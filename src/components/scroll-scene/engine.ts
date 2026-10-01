/**
 * NexbotEngine: a full-screen, art-directed Three.js scene for the NEXBOT story.
 *
 * Model: "NEXBOT – robot character concept" by aximoris (Spline Community).
 * Geometry was exported from the Spline scene and re-packed with glTF-Transform
 * (weld + simplify + quantize + meshopt, 6.4 MB → 0.28 MB). The file ships
 * without materials; all shading, lighting and rigging below is done in code.
 *
 * The scene owns the whole frame: a camera rig flies a single continuous shot
 * driven by scroll (see timeline.ts), the robot is lit like a studio product
 * shot (key + two coloured rims + top light + backlight halo), and stands on a
 * dark reflective floor with a giant wordmark behind it. Rendering goes
 * through a bloom pipeline on capable devices.
 *
 * Every mesh in the model is a "piece" that can be:
 *  - burst into a drifting cloud the camera flies through   (explode)
 *  - laid out as an ordered exploded-view blueprint          (blueprint)
 *  - re-assembled feet → head, dissolving from hologram into metal (assemble)
 * Named rig nodes (rig_head, rig_arm_R, …) are posed procedurally for head
 * tracking, idle breathing, the power-on flex and the closing wave.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import {
  BASE_STATE,
  STATE_KEYS,
  sampleKeyframes,
  type Keyframe,
  type SceneState,
} from "./timeline";

/** Page background (#040609), must match --background in styles.css. */
const BG_HEX = 0x040609;
const ICE = new THREE.Color("#5ee9fb");
const VIOLET = new THREE.Color("#9b62ff");
const WARM = new THREE.Color("#ffe9d6");
/** Robot height in scene units after normalisation. */
const MODEL_HEIGHT = 2.2;
const FLOOR_Y = -MODEL_HEIGHT / 2;
const FOV = 30;
const TONE_EXPOSURE = 1.1;
/** Objects on this layer are seen by the main camera but not by the floor reflection. */
const NO_REFLECT_LAYER = 2;
/** Eye centres on the visor, in the source model's units (see nexbot.glb). */
const EYE_X = 13;
const EYE_Y = 235;
const EYE_SIZE = new THREE.Vector2(12, 6.5);

/**
 * 2 = bloom + real floor reflections, 1 = bloom only, 0 = direct render.
 * The engine steps down on its own if the device can't hold the frame rate.
 */
export type Quality = 0 | 1 | 2;

export interface EngineOptions {
  reducedMotion: boolean;
  quality: Quality;
  onContextLost?: () => void;
}

type Uniform<T> = { value: T };
type MaterialKind = "visor" | "joint" | "shell";

interface Piece {
  mesh: THREE.Mesh;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  /** Offsets in the parent's local space (precomputed at rest). */
  explodeOff: THREE.Vector3;
  blueprintOff: THREE.Vector3;
  spin: THREE.Quaternion;
  /** 0 (feet) … 1 (head): assembly order. */
  order: number;
  built: Uniform<number>;
  holoAmt: Uniform<number>;
  edgeAmt: Uniform<number>;
  holo: THREE.Mesh;
  edges?: THREE.LineSegments;
}

interface Joint {
  node: THREE.Object3D;
  restQuat: THREE.Quaternion;
  /** Model-space → parent-local linear map (rest pose). */
  toLocal: THREE.Matrix3;
  mirror: number;
}

const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Small deterministic PRNG so the exploded layout is identical on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Copies (and de-quantizes) position + normal into a plain Float32 geometry. */
function toFloatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal"]) {
    const a = src.getAttribute(name) as
      THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!a) continue;
    const arr = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      arr[i * 3] = a.getX(i);
      arr[i * 3 + 1] = a.getY(i);
      arr[i * 3 + 2] = a.getZ(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  if (src.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array), 1));
  return out;
}

/** three.js ACES Filmic matrices (tonemapping_pars_fragment), row-major here. */
const ACES_IN = new THREE.Matrix3().set(
  0.59719,
  0.35458,
  0.04823,
  0.076,
  0.90834,
  0.01566,
  0.0284,
  0.13383,
  0.83777,
);
const ACES_OUT = new THREE.Matrix3().set(
  1.60475,
  -0.53108,
  -0.07367,
  -0.10208,
  1.10813,
  -0.00605,
  -0.00327,
  -0.07276,
  1.07602,
);

/** Inverse of RRTAndODTFit: y = (v(v + a) - b) / (v(c·v + d) + e), solved for v ≥ 0. */
function invRRT(y: number): number {
  const A = 0.0245786,
    B = 0.000090537,
    C = 0.983729,
    D = 0.432951,
    E = 0.238081;
  const qa = 1 - y * C,
    qb = A - y * D,
    qc = -(B + y * E);
  return Math.max(0, (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa));
}

/**
 * Finds the pre-tonemap linear colour that comes out as `target` after the
 * bloom pipeline's ACES tone mapping, so the 3D backdrop is identical to the
 * page background and the canvas can fade in/out without a visible seam.
 */
function invertToneMap(target: THREE.Color, exposure: number): THREE.Color {
  const v = new THREE.Vector3(target.r, target.g, target.b).applyMatrix3(ACES_OUT.clone().invert());
  v.set(invRRT(v.x), invRRT(v.y), invRRT(v.z)).applyMatrix3(ACES_IN.clone().invert());
  v.multiplyScalar(0.6 / exposure);
  return new THREE.Color().setRGB(
    Math.max(0, v.x),
    Math.max(0, v.y),
    Math.max(0, v.z),
    THREE.LinearSRGBColorSpace,
  );
}

const NOISE_GLSL = /* glsl */ `
  float nexHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float nexNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(nexHash(i), nexHash(i + vec3(1, 0, 0)), f.x), mix(nexHash(i + vec3(0, 1, 0)), nexHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(nexHash(i + vec3(0, 0, 1)), nexHash(i + vec3(1, 0, 1)), f.x), mix(nexHash(i + vec3(0, 1, 1)), nexHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }`;

/** Appended to every custom shader so the direct-render tier matches the bloom tier. */
const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export class NexbotEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly opts: EngineOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 80);
  /** Robot root. Everything robot-related lives in this "model space". */
  private readonly robot = new THREE.Group();
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly resizeObserver: ResizeObserver;

  // Lights
  // Directional only (no cones / falloff) to keep per-pixel shading cheap.
  private readonly key = new THREE.DirectionalLight(WARM, 2.1);
  private readonly rimIce = new THREE.DirectionalLight(ICE, 3.6);
  private readonly rimViolet = new THREE.DirectionalLight(VIOLET, 3.2);
  /** Sky = soft top light on the helmet and shoulders, ground = black. */
  private readonly fill = new THREE.HemisphereLight(0x3a4258, 0x000000, 0.9);

  // Post-processing (quality ≥ 1)
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private quality: Quality;

  // Scene parts
  private pieces: Piece[] = [];
  private joints = new Map<string, Joint>();
  private eyes: THREE.Mesh[] = [];
  private points?: THREE.Points;
  private ring?: THREE.Mesh;
  private halo?: THREE.Mesh;
  private wordmark?: THREE.Mesh;
  private dust?: THREE.Points;
  private floor?: THREE.Mesh;
  private reflector?: Reflector;
  private loaded = false;

  /** Uniforms shared by every material. */
  private readonly u = {
    uTime: { value: 0 } as Uniform<number>,
    uPower: { value: 0 } as Uniform<number>,
    uBlink: { value: 1 } as Uniform<number>,
    uRing: { value: 0 } as Uniform<number>,
    uGrid: { value: 0 } as Uniform<number>,
    uHalo: { value: 0 } as Uniform<number>,
    uTitle: { value: 0 } as Uniform<number>,
    uDisperse: { value: 0 } as Uniform<number>,
    uPoints: { value: 0 } as Uniform<number>,
    uPixelRatio: { value: 1 } as Uniform<number>,
    uPointSize: { value: 22 } as Uniform<number>,
    uModelInv: { value: new THREE.Matrix4() } as Uniform<THREE.Matrix4>,
    uIce: { value: ICE.clone() } as Uniform<THREE.Color>,
    uViolet: { value: VIOLET.clone() } as Uniform<THREE.Color>,
    uBg: { value: new THREE.Color() } as Uniform<THREE.Color>,
  };

  private keyframes: Keyframe[] = [];
  private readonly target: SceneState = { ...BASE_STATE, opacity: 0 };
  private readonly current: SceneState = { ...BASE_STATE, opacity: 0 };
  private hasSampled = false;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private readonly finePointer: boolean;
  private intro = 0;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private disposed = false;
  private needsRender = true;
  private pixelRatio: number;
  private readonly maxPixelRatio: number;
  /** Max rendered pixels for the tier (a 1440×900 @2x screen would be 5.2 MP). */
  private readonly pixelBudget: number;
  /** Shrinks the budget when the device can't keep up (adaptQuality). */
  private prScale = 1;
  private lastScrollY = -1;
  private frameIndex = 0;
  private idleFrames = 0;
  private frameTimes: number[] = [];
  private viewport = { w: 1, h: 1 };

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly AX = new THREE.Vector3(1, 0, 0);
  private readonly AY = new THREE.Vector3(0, 1, 0);
  private readonly AZ = new THREE.Vector3(0, 0, 1);

  constructor(container: HTMLElement, opts: EngineOptions) {
    this.container = container;
    this.opts = opts;
    this.quality = opts.quality;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.className = "block h-full w-full";
    container.style.opacity = "0";
    container.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: opts.quality === 0,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = TONE_EXPOSURE;

    this.maxPixelRatio = opts.quality === 2 ? 1.5 : 1.25;
    this.pixelBudget = [0.9e6, 1.15e6, 1.6e6][opts.quality];
    this.pixelRatio = 1;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.u.uPixelRatio.value = this.pixelRatio;

    // Backdrop colour. The bloom tier tone-maps the clear colour, so feed it the
    // pre-image of the page background; the direct tier clears straight to it.
    const bg = new THREE.Color(BG_HEX);
    this.u.uBg.value.copy(invertToneMap(bg, TONE_EXPOSURE));
    this.scene.background = this.quality > 0 ? this.u.uBg.value.clone() : bg;

    // Soft studio reflections for the visor and metal joints.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();
    this.disposables.push(envRT);

    this.setupLights();
    this.scene.add(this.robot);

    this.finePointer = window.matchMedia("(pointer: fine)").matches;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    if (!opts.reducedMotion && this.finePointer) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    }
    if (this.quality > 0) this.setupComposer();
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  private setupLights() {
    const aim = new THREE.Object3D();
    aim.position.set(0, 0.1, 0);
    this.scene.add(aim);

    // Key: warm, soft, high front-left.
    this.key.position.set(-3.4, 4.2, 4.2);
    // Rims: coloured edges from behind, so the silhouette always reads against the dark.
    this.rimIce.position.set(3.6, 2.4, -3.4);
    this.rimViolet.position.set(-3.6, 1.6, -3.0);
    for (const l of [this.key, this.rimIce, this.rimViolet]) {
      l.target = aim;
      this.scene.add(l);
    }
    this.scene.add(this.fill);
  }

  private setupComposer() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.6, 0.9);
    // Bloom is a soft, wide blur, so it doesn't need many pixels: run its mip chain at
    // half the render size (UnrealBloomPass halves again internally → quarter res).
    const setBloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w: number, h: number) =>
      setBloomSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
    this.bloom = bloom;
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Drops to direct rendering (no bloom) when the GPU can't keep up. */
  private dropComposer() {
    if (!this.composer) return;
    this.composer.dispose();
    this.composer = undefined;
    this.bloom = undefined;
    this.quality = 0;
    this.scene.background = new THREE.Color(BG_HEX);
  }

  private dropReflector() {
    if (!this.reflector || !this.floor) return;
    this.reflector.visible = false;
    this.floor.visible = true;
    if (this.quality === 2) this.quality = 1;
  }

  async load(buffer: ArrayBuffer): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const [gltf] = await Promise.all([
      loader.parseAsync(buffer, ""),
      // The wordmark texture needs the display face; don't wait more than a second for it.
      Promise.race([
        document.fonts?.load('700 200px "Space Grotesk"'),
        new Promise((r) => setTimeout(r, 1000)),
      ]).catch(() => undefined),
    ]);
    if (this.disposed) return;

    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const eyeHits = this.findEyeSurface(model);

    // Normalise: feet on the floor (y = FLOOR_Y), MODEL_HEIGHT tall, centred.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = MODEL_HEIGHT / size.y;
    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(s);
    wrapper.position.copy(center).multiplyScalar(-s);
    wrapper.add(model);
    this.robot.add(wrapper);
    this.robot.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(wrapper);
    this.collectJoints(model);
    this.buildPieces(model, bounds);
    this.buildEyes(eyeHits);
    this.points = this.buildPoints();
    this.ring = this.buildRing(bounds.min.y);
    this.robot.add(this.points, this.ring);

    this.buildFloor(bounds.min.y);
    this.halo = this.buildHalo();
    this.wordmark = this.buildWordmark();
    this.dust = this.buildDust();
    this.scene.add(this.halo, this.dust);
    // Particles, dust and the halo don't need to appear in the floor reflection.
    for (const o of [this.halo, this.dust, this.points]) o.layers.set(NO_REFLECT_LAYER);
    this.camera.layers.enable(NO_REFLECT_LAYER);
    if (this.wordmark) this.scene.add(this.wordmark);

    // Compile every program up-front so the first scroll never hitches.
    for (const p of this.pieces) {
      p.holo.visible = true;
      if (p.edges) p.edges.visible = true;
    }
    for (const e of this.eyes) e.visible = true;
    this.updateCamera(this.current, 0);
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    this.intro = this.opts.reducedMotion ? 1 : 0;
    this.loaded = true;
    this.needsRender = true;
  }

  private findEyeSurface(model: THREE.Object3D) {
    const helmet = model.getObjectByName("mesh_helmet") as THREE.Mesh | undefined;
    const head = model.getObjectByName("rig_head");
    if (!helmet || !head) return [];
    const ray = new THREE.Raycaster();
    const hits: { pos: THREE.Vector3; normal: THREE.Vector3; head: THREE.Object3D }[] = [];
    for (const side of [-1, 1]) {
      ray.set(new THREE.Vector3(side * EYE_X, EYE_Y, 500), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(helmet, false)[0];
      if (!hit || !hit.face) continue;
      const normal = hit.face.normal.clone().transformDirection(helmet.matrixWorld);
      if (normal.z < 0) normal.negate();
      const pos = hit.point.clone().addScaledVector(normal, 0.35);
      const headRot = new THREE.Quaternion();
      head.getWorldQuaternion(headRot);
      hits.push({
        pos: head.worldToLocal(pos),
        normal: normal.applyQuaternion(headRot.invert()),
        head,
      });
    }
    return hits;
  }

  private collectJoints(model: THREE.Object3D) {
    const inv = this.robot.matrixWorld.clone().invert();
    model.traverse((o) => {
      if (!o.name.startsWith("rig_") || !o.parent) return;
      const parentModel = new THREE.Matrix4().multiplyMatrices(inv, o.parent.matrixWorld);
      const lin = new THREE.Matrix3().setFromMatrix4(parentModel);
      this.joints.set(o.name, {
        node: o,
        restQuat: o.quaternion.clone(),
        toLocal: lin.clone().invert(),
        mirror: Math.sign(lin.determinant()) || 1,
      });
    });
  }

  private materialKind(m: THREE.Material): MaterialKind {
    if (m.name === "Head") return "visor";
    if (m.name === "Body") return "shell";
    return "joint";
  }

  private createSolidMaterial(
    kind: MaterialKind,
    built: Uniform<number>,
  ): THREE.MeshStandardMaterial {
    const hi = this.quality > 0;
    const mat: THREE.MeshStandardMaterial =
      kind === "visor"
        ? new THREE.MeshPhysicalMaterial({
            color: 0x040407,
            metalness: 0.6,
            roughness: 0.06,
            clearcoat: hi ? 1 : 0,
            clearcoatRoughness: 0.03,
            envMapIntensity: 1.6,
          })
        : kind === "shell"
          ? new THREE.MeshStandardMaterial({ color: 0x62666f, metalness: 0.1, roughness: 0.4 })
          : new THREE.MeshStandardMaterial({
              color: 0x101116,
              metalness: 0.95,
              roughness: 0.22,
              envMapIntensity: 1.3,
            });
    mat.defines = { ...mat.defines, NEX_KIND: kind === "visor" ? 0 : kind === "joint" ? 1 : 2 };
    const u = this.u;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uBuilt: built,
        uTime: u.uTime,
        uPower: u.uPower,
        uModelInv: u.uModelInv,
        uIce: u.uIce,
        uViolet: u.uViolet,
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform mat4 uModelInv;\nvarying vec3 vMPos;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvMPos = (uModelInv * modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vMPos;
          uniform float uBuilt, uTime, uPower;
          uniform vec3 uIce, uViolet;
          ${NOISE_GLSL}`,
        )
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          float nexN = nexNoise(vMPos * 11.0) * 0.75 + nexNoise(vMPos * 37.0) * 0.25;
          float nexThr = uBuilt * 1.16 - 0.08;
          if (nexN > nexThr) discard;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            // Materialising edge
            float front = (1.0 - smoothstep(0.0, 0.07, nexThr - nexN)) * step(uBuilt, 0.999);
            totalEmissiveRadiance += mix(uIce, uViolet, nexN) * front * 5.0;
            // Powered-on rim
            float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
            vec3 tint = mix(uIce, uViolet, smoothstep(-0.6, 1.1, vMPos.y + vMPos.x * 0.6));
            totalEmissiveRadiance += tint * rim * uPower * 0.18;
            #if NEX_KIND == 1
              // Energy pulsing up through the joints
              float flow = smoothstep(0.8, 1.0, sin(vMPos.y * 24.0 - uTime * 5.0) * 0.5 + 0.5);
              totalEmissiveRadiance += uIce * (0.025 + flow * 0.75) * uPower;
            #endif
          }`,
        );
    };
    mat.customProgramCacheKey = () => `nexbot-solid-${kind}-${hi ? 1 : 0}`;
    this.disposables.push(mat);
    return mat;
  }

  private holoShader(amt: Uniform<number>): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, uAmt: amt },
      vertexShader: /* glsl */ `
        uniform mat4 uModelInv;
        varying vec3 vMPos;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          vMPos = (uModelInv * modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAmt;
        uniform vec3 uIce, uViolet;
        varying vec3 vMPos;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.2);
          float lines = smoothstep(0.8, 1.0, sin(vMPos.y * 90.0 - uTime * 2.0) * 0.5 + 0.5);
          float band = smoothstep(0.1, 0.0, abs(fract(vMPos.y * 0.45 - uTime * 0.15) - 0.5));
          vec3 col = mix(uIce, uViolet, smoothstep(-1.0, 1.3, vMPos.y + vMPos.x * 0.5));
          gl_FragColor = vec4(col * 1.3, (0.03 + fres * 0.65 + lines * 0.1 + band * 0.22) * uAmt);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    return mat;
  }

  private edgeShader(amt: Uniform<number>): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, uAmt: amt },
      vertexShader: /* glsl */ `
        uniform mat4 uModelInv;
        varying vec3 vMPos;
        void main() {
          vMPos = (uModelInv * modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAmt;
        uniform vec3 uIce, uViolet;
        varying vec3 vMPos;
        void main() {
          float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + vMPos.y * 14.0);
          vec3 col = mix(uIce, uViolet, smoothstep(-1.2, 1.4, vMPos.y - vMPos.x * 0.4));
          gl_FragColor = vec4(col * 1.4, 0.6 * uAmt * flicker);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    return mat;
  }

  private buildPieces(model: THREE.Object3D, bounds: THREE.Box3) {
    const rand = rng(0x4e3b07);
    const inv = this.robot.matrixWorld.clone().invert();
    const mid = bounds.getCenter(new THREE.Vector3());
    const minY = bounds.min.y;
    const height = bounds.max.y - bounds.min.y;
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });

    for (const mesh of meshes) {
      const kind = this.materialKind(mesh.material as THREE.Material);
      (mesh.material as THREE.Material).dispose();
      this.disposables.push(mesh.geometry);
      mesh.geometry.computeBoundingBox();

      const toModel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(toModel);

      // A wide burst, biased towards the camera, so pieces sweep past the lens.
      const dir = c.clone().sub(mid);
      dir.y *= 0.55;
      dir
        .add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.1))
        .normalize();
      const explode = dir.multiplyScalar(0.4 + rand() * 0.9);
      explode.y *= 0.8;
      explode.z += (rand() - 0.25) * 1.5;
      // Never push a piece through the floor.
      explode.y = Math.max(explode.y, minY + 0.06 - c.y);
      // Ordered exploded-view blueprint: spreads sideways and upwards from the feet.
      const blueprint = new THREE.Vector3(
        (c.x - mid.x) * 0.85,
        (c.y - minY) * 0.38,
        (c.z - mid.z) * 1.6 + (rand() - 0.5) * 0.08,
      );

      const parentModel = new THREE.Matrix4().multiplyMatrices(inv, mesh.parent!.matrixWorld);
      const toLocal = new THREE.Matrix3().setFromMatrix4(parentModel).invert();
      const spin = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3),
      );

      const built = { value: 1 };
      const holoAmt = { value: 0 };
      const edgeAmt = { value: 0 };
      mesh.material = this.createSolidMaterial(kind, built);

      const holo = new THREE.Mesh(mesh.geometry, this.holoShader(holoAmt));
      holo.renderOrder = 1;
      holo.visible = false;
      mesh.add(holo);

      let edges: THREE.LineSegments | undefined;
      if (this.quality > 0) {
        const fg = toFloatGeometry(mesh.geometry);
        const posOnly = new THREE.BufferGeometry();
        posOnly.setAttribute("position", fg.getAttribute("position"));
        if (fg.index) posOnly.setIndex(fg.index);
        const merged = mergeVertices(posOnly, 1e-4);
        const edgesGeo = new THREE.EdgesGeometry(merged, 35);
        merged.dispose();
        fg.dispose();
        this.disposables.push(edgesGeo);
        edges = new THREE.LineSegments(edgesGeo, this.edgeShader(edgeAmt));
        edges.renderOrder = 2;
        edges.visible = false;
        mesh.add(edges);
      }

      this.pieces.push({
        mesh,
        restPos: mesh.position.clone(),
        restQuat: mesh.quaternion.clone(),
        explodeOff: explode.applyMatrix3(toLocal),
        blueprintOff: blueprint.applyMatrix3(toLocal),
        spin,
        order: Math.min(1, Math.max(0, (c.y - minY) / height)),
        built,
        holoAmt,
        edgeAmt,
        holo,
        edges,
      });
    }
  }

  private buildEyes(hits: { pos: THREE.Vector3; normal: THREE.Vector3; head: THREE.Object3D }[]) {
    if (hits.length === 0) return;
    const geo = new THREE.PlaneGeometry(EYE_SIZE.x, EYE_SIZE.y);
    this.disposables.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uPower, uBlink, uTime;
        uniform vec3 uIce;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          q.y /= max(uBlink, 0.06);
          float mask = smoothstep(1.0, 0.82, length(q));
          vec2 cell = fract(vUv * vec2(10.0, 6.5)) - 0.5;
          float led = smoothstep(0.44, 0.2, length(cell));
          float scan = 0.85 + 0.15 * sin(vUv.y * 40.0 - uTime * 6.0);
          float a = mask * (led * 0.95 + 0.15) * uPower * scan;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uIce * 4.0, a);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    for (const h of hits) {
      const eye = new THREE.Mesh(geo, mat);
      eye.position.copy(h.pos);
      eye.quaternion.setFromUnitVectors(this.AZ, h.normal.normalize());
      eye.renderOrder = 4;
      h.head.add(eye);
      this.eyes.push(eye);
    }
  }

  private buildPoints(): THREE.Points {
    const inv = this.robot.matrixWorld.clone().invert();
    const posArr: number[] = [];
    const nrmArr: number[] = [];
    const m = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const p of this.pieces) {
      const g = toFloatGeometry(p.mesh.geometry).toNonIndexed();
      m.multiplyMatrices(inv, p.mesh.matrixWorld);
      nm.getNormalMatrix(m);
      const pa = g.getAttribute("position");
      const na = g.getAttribute("normal");
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m);
        posArr.push(v.x, v.y, v.z);
        if (na) v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        else v.set(0, 1, 0);
        nrmArr.push(v.x, v.y, v.z);
      }
      g.dispose();
    }
    const surface = new THREE.BufferGeometry();
    surface.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    surface.setAttribute("normal", new THREE.Float32BufferAttribute(nrmArr, 3));
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(surface)).build();

    const count = this.quality > 0 ? 5000 : 2500;
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const r = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      sampler.sample(p, n);
      p.toArray(pos, i * 3);
      n.toArray(nrm, i * 3);
      r.randomDirection().toArray(rnd, i * 4);
      rnd[i * 4 + 3] = Math.random();
    }
    surface.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aNormal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    this.disposables.push(g);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        uniform float uTime, uDisperse, uPointSize, uPixelRatio, uPoints;
        attribute vec3 aNormal;
        attribute vec4 aRand;
        varying float vAlpha;
        varying float vMix;
        void main() {
          float s = aRand.w;
          float d = uDisperse;
          vec3 dir = normalize(aNormal * 0.8 + aRand.xyz);
          vec3 p = position + dir * d * (0.4 + s * 2.4);
          float ang = d * (0.9 + s * 1.6) + uTime * 0.07 * (0.4 + s) * d;
          float c = cos(ang), sn = sin(ang);
          p.xz = mat2(c, -sn, sn, c) * p.xz;
          p += aNormal * 0.01 * sin(uTime * 2.0 + s * 40.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(uPointSize * uPixelRatio * (0.45 + s * 0.9) / -mv.z, 18.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + s * 2.0) + s * 60.0);
          vAlpha = uPoints * twinkle * (0.35 + 0.65 * fract(s * 13.7)) * smoothstep(0.05, 0.4, -mv.z);
          vMix = fract(s * 7.31);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uIce, uViolet;
        varying float vAlpha;
        varying float vMix;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r);
          if (a * vAlpha < 0.003) discard;
          gl_FragColor = vec4(mix(uIce, uViolet, vMix * vMix) * 1.4, a * a * vAlpha);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    const points = new THREE.Points(g, mat);
    points.renderOrder = 3;
    return points;
  }

  private buildRing(floorY: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1.5, 1.5);
    this.disposables.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uRing, uPower;
        uniform vec3 uIce, uViolet;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          float r = length(q);
          float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
          float outer = smoothstep(0.012, 0.0, abs(r - 0.94));
          float inner = smoothstep(0.008, 0.0, abs(r - 0.7)) * 0.7;
          float ticks = step(0.7, fract(ang * 72.0 + uTime * 0.25)) * smoothstep(0.03, 0.0, abs(r - 0.83));
          float arc = smoothstep(0.02, 0.0, abs(r - 0.6)) * step(0.62, fract(ang - uTime * 0.08));
          float pulse = smoothstep(0.03, 0.0, abs(r - fract(uTime * 0.35) * 0.95)) * (1.0 - r) * uPower;
          float glow = exp(-r * r * 5.0) * (0.12 + 0.3 * uPower);
          vec3 col = mix(uIce, uViolet, smoothstep(0.2, 0.8, ang));
          float a = (outer + inner + ticks * 0.8 + arc * 0.9 + pulse * 1.4 + glow) * uRing * smoothstep(1.0, 0.9, r);
          if (a < 0.003) discard;
          gl_FragColor = vec4(col * 1.5, a);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = floorY + 0.006;
    ring.renderOrder = 0;
    return ring;
  }

  /**
   * Dark polished floor: soft real reflections (quality 2), a contact shadow,
   * the key light's pool, an optional blueprint grid, and a long falloff into
   * the backdrop so there's never a visible horizon.
   */
  private buildFloor(floorY: number) {
    const uniforms = {
      ...this.u,
      tDiffuse: { value: null as THREE.Texture | null },
      textureMatrix: { value: new THREE.Matrix4() },
      color: { value: new THREE.Color() },
      uReflect: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    };
    const shader = {
      name: "NexbotFloor",
      uniforms,
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vRefl;
        varying vec3 vWorld;
        void main() {
          vRefl = textureMatrix * vec4(position, 1.0);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uReflect, uGrid, uTime, uPower, uHalo;
        uniform vec2 uTexel;
        uniform vec3 uBg, uIce, uViolet;
        varying vec4 vRefl;
        varying vec3 vWorld;
        float gridLine(vec2 p, float scale) {
          vec2 g = abs(fract(p * scale - 0.5) - 0.5) / fwidth(p * scale);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main() {
          float r = length(vWorld.xz);
          vec3 col = uBg * 1.6;
          // Key light pool and contact shadow under the feet.
          col += vec3(1.0, 0.95, 0.9) * exp(-r * r * 0.55) * 0.028;
          col *= 1.0 - 0.75 * exp(-r * r * 9.0);
          // Soft reflections (5-tap blur; blur grows with distance).
          if (uReflect > 0.0) {
            vec2 uv = vRefl.xy / vRefl.w;
            vec2 o = uTexel * (1.5 + r * 2.5);
            vec3 refl = texture2D(tDiffuse, uv).rgb * 0.36;
            refl += texture2D(tDiffuse, uv + vec2(o.x, 0.0)).rgb * 0.16;
            refl += texture2D(tDiffuse, uv - vec2(o.x, 0.0)).rgb * 0.16;
            refl += texture2D(tDiffuse, uv + vec2(0.0, o.y)).rgb * 0.16;
            refl += texture2D(tDiffuse, uv - vec2(0.0, o.y)).rgb * 0.16;
            col += refl * uReflect * 0.3 * exp(-r * 0.35);
          }
          // Blueprint grid
          float grid = gridLine(vWorld.xz, 4.0) * 0.6 + gridLine(vWorld.xz, 1.0);
          col += mix(uIce, uViolet, smoothstep(-2.0, 2.0, vWorld.x)) * grid * uGrid * 0.22 * exp(-r * 0.45);
          // Coloured bounce from the halo behind the robot
          col += uViolet * exp(-pow(length(vWorld.xz - vec2(0.0, -1.2)), 2.0) * 0.6) * 0.02 * uHalo;
          col = mix(col, uBg, smoothstep(2.2, 8.0, r));
          gl_FragColor = vec4(col, 1.0);
          ${OUTPUT_GLSL}
        }`,
    };

    const geo = new THREE.PlaneGeometry(40, 40);
    this.disposables.push(geo);

    // Fallback / low tier: same shader, no reflection pass.
    const flatMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
    });
    this.disposables.push(flatMat);
    this.floor = new THREE.Mesh(geo, flatMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = floorY;
    this.floor.renderOrder = -2;
    this.scene.add(this.floor);

    if (this.quality === 2) {
      const reflector = new Reflector(geo, {
        shader,
        textureWidth: 512,
        textureHeight: 512,
        multisample: 0,
      });
      reflector.rotation.x = -Math.PI / 2;
      reflector.position.y = floorY;
      reflector.renderOrder = -2;
      const rm = reflector.material as THREE.ShaderMaterial;
      // Share the live uniforms (time, grid, colours) with the reflector's clone.
      for (const k of Object.keys(this.u)) rm.uniforms[k] = this.u[k as keyof typeof this.u];
      rm.uniforms.uReflect = { value: 1 };
      this.reflector = reflector;
      this.scene.add(reflector);
      this.floor.visible = false;
      this.disposables.push({ dispose: () => reflector.dispose() });
    }
  }

  /** Billboarded backlight behind the robot: a soft bloom with slow light shafts. */
  private buildHalo(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uHalo, uPower;
        uniform vec3 uIce, uViolet;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          // Light source sits just above the head.
          vec2 s = q - vec2(0.0, 0.28);
          float r = length(s);
          float ang = atan(s.y, s.x);
          float rays = (0.5 + 0.5 * sin(ang * 7.0 + uTime * 0.21)) * (0.5 + 0.5 * sin(ang * 13.0 - uTime * 0.13 + 1.7));
          rays = rays * rays * smoothstep(1.0, 0.1, r) * smoothstep(0.02, 0.2, r);
          float core = exp(-r * r * 9.0);
          float wide = exp(-r * r * 2.2);
          vec3 col = uViolet * wide * 0.09 + mix(uIce, vec3(1.0), 0.3) * core * 0.16 + mix(uViolet, uIce, 0.45) * rays * 0.14;
          col *= uHalo * (0.85 + 0.35 * uPower);
          float edge = smoothstep(1.0, 0.75, length(q));
          gl_FragColor = vec4(col * edge, 1.0);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    const halo = new THREE.Mesh(geo, mat);
    halo.scale.setScalar(7);
    halo.position.set(0, 0.35, -3.2);
    halo.renderOrder = -1;
    return halo;
  }

  /** Giant "VBUILD" standing behind the robot, catching the backlight. */
  private buildWordmark(): THREE.Mesh | undefined {
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 512;
    const g = c.getContext("2d");
    if (!g) return undefined;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '700 400px "Space Grotesk", "Manrope", sans-serif';
    // Measure and fit to the canvas width with tight tracking.
    const text = "VBUILD";
    const w = g.measureText(text).width;
    const scale = Math.min(1, (c.width * 0.96) / w);
    g.save();
    g.translate(c.width / 2, c.height / 2 + 12);
    g.scale(scale, scale);
    const grad = g.createLinearGradient(0, -200, 0, 200);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0.15)");
    g.fillStyle = grad;
    g.fillText(text, 0, 0);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.disposables.push(tex);

    const geo = new THREE.PlaneGeometry(5.6, 1.4);
    this.disposables.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, tMap: { value: tex } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap;
        uniform float uTitle, uTime, uHalo;
        uniform vec3 uIce, uViolet;
        varying vec2 vUv;
        void main() {
          float a = texture2D(tMap, vUv).a;
          // A slow light sweep across the letters.
          float sweep = smoothstep(0.12, 0.0, abs(vUv.x - fract(uTime * 0.06) * 1.6 + 0.3));
          vec3 col = mix(vec3(0.11, 0.12, 0.15), mix(uViolet, uIce, vUv.x) * 0.3, 0.5) + sweep * uIce * 0.3;
          col += mix(uViolet, uIce, 0.5) * 0.05 * uHalo * (1.0 - vUv.y);
          gl_FragColor = vec4(col, a * uTitle);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.disposables.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.55, -1.7);
    mesh.renderOrder = -1;
    return mesh;
  }

  /** Slow-drifting dust motes in the light; out-of-focus near the lens. */
  private buildDust(): THREE.Points {
    const count = this.quality > 0 ? 420 : 220;
    const rand = rng(77);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 9;
      pos[i * 3 + 1] = FLOOR_Y + rand() * 4.2;
      pos[i * 3 + 2] = (rand() - 0.6) * 9;
      rnd[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 10);
    this.disposables.push(g);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        uniform float uTime, uPixelRatio, uHalo;
        attribute float aRand;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = -1.1 + mod(position.y + 1.1 + uTime * (0.02 + aRand * 0.04), 4.2);
          p.x += sin(uTime * 0.2 + aRand * 30.0) * 0.15;
          p.z += cos(uTime * 0.17 + aRand * 20.0) * 0.15;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float depth = -mv.z;
          float size = (2.0 + aRand * 3.0) + 8.0 * smoothstep(1.6, 0.2, depth);
          gl_PointSize = min(size * uPixelRatio * (2.5 / max(depth, 0.3)), 14.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
          // Brighter in the backlight cone, fainter when huge (out of focus).
          float lit = exp(-pow(length(p.xz - vec2(0.0, -1.5)), 2.0) * 0.12);
          vA = (0.15 + 0.85 * lit) * uHalo * mix(1.0, 0.25, smoothstep(1.6, 0.2, depth)) * smoothstep(0.08, 0.3, depth);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uIce, uViolet;
        varying float vA;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, r) * vA * 0.55;
          if (a < 0.003) discard;
          gl_FragColor = vec4(mix(vec3(0.9), uIce, 0.4), a);
          ${OUTPUT_GLSL}
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    const dust = new THREE.Points(g, mat);
    dust.renderOrder = 5;
    return dust;
  }

  // ---------------------------------------------------------------------------
  // Runtime
  // ---------------------------------------------------------------------------

  setKeyframes(kfs: Keyframe[]) {
    this.keyframes = kfs;
    this.needsRender = true;
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.composer?.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.opts.onContextLost?.();
  };

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.viewport = { w, h };
    // Fit the render to the pixel budget; the canvas is upscaled by CSS (grain + bloom hide it).
    const budgetRatio = Math.sqrt((this.pixelBudget * this.prScale) / Math.max(1, w * h));
    this.pixelRatio = Math.max(
      0.5,
      Math.min(window.devicePixelRatio || 1, this.maxPixelRatio, budgetRatio),
    );
    this.renderer.setPixelRatio(this.pixelRatio);
    this.u.uPixelRatio.value = this.pixelRatio;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
    if (this.reflector) {
      const rw = Math.round(w * this.pixelRatio * 0.35);
      const rh = Math.round(h * this.pixelRatio * 0.35);
      this.reflector.getRenderTarget().setSize(rw, rh);
      (this.reflector.material as THREE.ShaderMaterial).uniforms.uTexel.value.set(1 / rw, 1 / rh);
    }
    this.camera.aspect = w / h;
    this.needsRender = true;
  }

  /**
   * Steps quality down if the device can't sustain ~45fps:
   * pixel ratio → floor reflections → bloom. Never steps back up.
   */
  private adaptQuality(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    this.frameTimes.length = 0;
    // Median frame time: ignores one-off hitches (tab switches, GC).
    if (sorted[Math.floor(sorted.length / 2)] <= 1 / 52) return;
    if (this.prScale > 0.55) {
      this.prScale = Math.max(0.5, this.prScale * 0.75);
    } else if (this.reflector?.visible) {
      this.dropReflector();
    } else if (this.composer) {
      this.dropComposer();
    } else {
      return;
    }
    this.resize();
  }

  /** Places the camera from the shot description: orbit + lens shift + a little life. */
  private updateCamera(c: SceneState, t: number) {
    const reduced = this.opts.reducedMotion;
    const introE = 1 - Math.pow(1 - this.intro, 3);
    const handheld = reduced ? 0 : 1;
    const orbit = c.orbit + this.pointer.x * 0.08 + Math.sin(t * 0.31) * 0.012 * handheld;
    const pitch = c.pitch - this.pointer.y * 0.035 + Math.sin(t * 0.23 + 1.3) * 0.007 * handheld;
    // Intro: a slow dolly-in while the robot materialises.
    const dist = c.dist * (1 + (1 - introE) * 0.35);
    const aim = this.tmpV.set(0, c.lookY + Math.sin(t * 0.41) * 0.006 * handheld, 0);
    this.camera.position.set(
      aim.x + dist * Math.cos(pitch) * Math.sin(orbit),
      aim.y + dist * Math.sin(pitch),
      aim.z + dist * Math.cos(pitch) * Math.cos(orbit),
    );
    // Keep the lens above the floor during low crane shots.
    this.camera.position.y = Math.max(this.camera.position.y, FLOOR_Y + 0.08);
    this.camera.lookAt(aim);
    this.camera.updateProjectionMatrix();
    // Lens shift: move the subject on screen without rotating the view.
    const pm = this.camera.projectionMatrix.elements;
    pm[8] = -c.shiftX;
    pm[9] = -c.shiftY;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.updateMatrixWorld();
  }

  /** Applies model-space rotations (applied X, then Y, then Z) to a rig joint. */
  private pose(name: string, rx: number, ry: number, rz: number) {
    const j = this.joints.get(name);
    if (!j) return;
    const d = this.tmpQ.setFromAxisAngle(this.AZ, rz);
    d.multiply(this.tmpQ2.setFromAxisAngle(this.AY, ry));
    d.multiply(this.tmpQ2.setFromAxisAngle(this.AX, rx));
    const w = Math.min(1, Math.max(-1, d.w));
    const angle = 2 * Math.acos(w);
    const sinHalf = Math.sqrt(1 - w * w);
    if (sinHalf < 1e-5) {
      j.node.quaternion.copy(j.restQuat);
      return;
    }
    const axis = this.tmpV2
      .set(d.x / sinHalf, d.y / sinHalf, d.z / sinHalf)
      .applyMatrix3(j.toLocal)
      .normalize();
    this.tmpQ2.setFromAxisAngle(axis, angle * j.mirror);
    j.node.quaternion.copy(this.tmpQ2).multiply(j.restQuat);
  }

  private animateRig(c: SceneState, t: number, reduced: boolean) {
    const idle = reduced ? 0 : 1;
    const breathe = Math.sin(t * 1.6) * idle;
    const sway = Math.sin(t * 0.7) * idle;
    const boot = 4 * c.power * (1 - c.power);
    const wave = c.wave;
    const waveCycle = Math.sin(t * 6.5) * idle;

    // Head follows the cursor, or glances around on touch screens.
    const lookX = this.finePointer ? this.pointer.x : Math.sin(t * 0.45) * 0.45 * idle;
    const lookY = this.finePointer ? this.pointer.y : 0;
    this.pose(
      "rig_head",
      (lookY * 0.28 - boot * 0.12 + wave * 0.06) * c.look + breathe * 0.01,
      lookX * 0.6 * c.look + wave * -0.18,
      wave * -0.1 + sway * 0.015,
    );
    this.pose("rig_top", breathe * 0.012, sway * 0.04 + wave * -0.08, wave * 0.04);
    this.pose("rig_pelvis", 0, sway * -0.02, 0);

    const relaxed = 0.05 + sway * 0.02;
    this.pose("rig_arm_L", breathe * 0.02, 0, relaxed + boot * 0.22);
    this.pose(
      "rig_arm_R",
      breathe * 0.02 + wave * 0.15,
      wave * 0.2,
      -(relaxed + boot * 0.22) - wave * 1.65,
    );
    this.pose("rig_elbow_R", 0, 0, wave * (-1.05 + waveCycle * 0.32));
    this.pose("rig_elbow_L", -boot * 0.3, 0, 0);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (!this.loaded) return;

    const reduced = this.opts.reducedMotion;
    const t = this.target;
    const c = this.current;

    sampleKeyframes(this.keyframes, window.scrollY, t);
    if (!this.hasSampled) {
      Object.assign(c, t);
      this.hasSampled = true;
    }

    let delta = 0;
    for (const k of STATE_KEYS) {
      const next = reduced ? t[k] : damp(c[k], t[k], 11, dt);
      delta = Math.max(delta, Math.abs(next - c[k]));
      c[k] = next;
    }

    if (!reduced) {
      this.time += dt;
      this.intro = Math.min(1, this.intro + dt / 3);
      this.pointer.x = damp(this.pointer.x, this.pointer.tx, 3, dt);
      this.pointer.y = damp(this.pointer.y, this.pointer.ty, 3, dt);
    }

    const opacity = c.opacity * Math.min(1, this.intro * 3);
    const op = opacity.toFixed(3);
    if (this.container.style.opacity !== op) this.container.style.opacity = op;
    // Fully faded out: drop the layer from compositing and skip the GPU entirely.
    const vis = opacity < 0.004 ? "hidden" : "visible";
    if (this.container.style.visibility !== vis) this.container.style.visibility = vis;
    if (opacity < 0.004) return;
    if (reduced && delta < 1e-4 && !this.needsRender) return;

    const scrollY = window.scrollY;
    const moving =
      delta > 2e-4 ||
      scrollY !== this.lastScrollY ||
      Math.abs(this.pointer.tx - this.pointer.x) + Math.abs(this.pointer.ty - this.pointer.y) >
        1e-3 ||
      this.intro < 1;
    this.lastScrollY = scrollY;
    this.idleFrames = moving ? 0 : this.idleFrames + 1;
    this.frameIndex++;
    if (!this.needsRender && this.idleFrames > 30 && this.frameIndex % 2 === 1) return;
    this.needsRender = false;

    const introE = 1 - Math.pow(1 - this.intro, 3);
    this.updateCamera(c, this.time);

    // Pieces: burst / blueprint / assemble (intro materialises feet → head)
    const assemble = Math.min(c.assemble, smooth(0.1, 1, this.intro));
    const holoBase = Math.max(c.holo, (1 - introE) * 0.9);
    const edgeBase = Math.max(c.edges, (1 - introE) * 0.6);
    const tm = this.time;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const start = p.order * 0.72;
      const a = smooth(start, start + 0.28, assemble);
      const free = 1 - a;
      const m = p.mesh;
      m.position.copy(p.restPos);
      if (free > 1e-4) {
        const drift = reduced ? 0 : Math.sin(tm * 0.6 + i * 1.7) * 0.07 * c.explode;
        m.position
          .addScaledVector(p.explodeOff, free * (c.explode + drift))
          .addScaledVector(p.blueprintOff, free * c.blueprint);
        m.quaternion
          .copy(p.restQuat)
          .multiply(this.tmpQ.identity().slerp(p.spin, free * c.explode));
      } else {
        m.quaternion.copy(p.restQuat);
      }
      p.built.value = a;
      p.holoAmt.value = holoBase * free;
      p.edgeAmt.value = edgeBase * free;
      p.holo.visible = p.holoAmt.value > 0.002;
      if (p.edges) p.edges.visible = p.edgeAmt.value > 0.002;
    }

    this.animateRig(c, this.time, reduced);

    // Shared uniforms
    this.robot.updateMatrixWorld(true);
    this.u.uModelInv.value.copy(this.robot.matrixWorld).invert();
    this.u.uTime.value = this.time;
    this.u.uPower.value = c.power * smooth(0.55, 1, this.intro);
    this.u.uRing.value = c.ring * introE;
    this.u.uGrid.value = c.grid;
    this.u.uHalo.value = c.halo * smooth(0, 0.6, this.intro);
    this.u.uTitle.value = c.title * smooth(0.25, 0.9, this.intro);
    this.u.uDisperse.value = c.disperse;
    this.u.uPoints.value = c.points;
    if (!reduced) {
      const blinkPhase = this.time % 4.2;
      this.u.uBlink.value =
        blinkPhase < 0.14 ? Math.abs(Math.cos((blinkPhase / 0.14) * Math.PI)) : 1;
    }
    this.points!.visible = c.points > 0.001;
    this.ring!.visible = this.u.uRing.value > 0.002;
    if (this.wordmark) this.wordmark.visible = this.u.uTitle.value > 0.002;
    for (const e of this.eyes) e.visible = this.u.uPower.value > 0.002;
    this.halo!.quaternion.copy(this.camera.quaternion);

    // Lighting follows the story: rims flare and the key sweeps as it powers on.
    const pw = this.u.uPower.value;
    const lit = smooth(0, 0.8, this.intro);
    this.key.intensity = (2.1 + pw * 0.9) * lit;
    this.key.position.x = -3.4 + Math.sin(this.time * 0.15) * 0.6 + pw * 1.2;
    this.rimIce.intensity = (3.6 + pw * 3.2 + c.explode * 1.5) * lit;
    this.rimViolet.intensity = (3.2 + pw * 2.4 + c.blueprint * 2) * lit;
    this.fill.intensity = (0.9 + pw * 0.5) * lit;

    if (this.bloom) this.bloom.strength = 0.42 * c.glow;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    if (!reduced) this.adaptQuality(dt);
  };
}
