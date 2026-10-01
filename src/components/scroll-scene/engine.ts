/**
 * NexbotEngine — vanilla Three.js renderer for the scroll-driven NEXBOT story.
 *
 * Model: "NEXBOT – robot character concept" by aximoris (Spline Community).
 * Geometry was exported from the Spline scene and re-packed with glTF-Transform
 * (weld + simplify + quantize + meshopt, 6.4 MB → 0.28 MB). The file ships
 * without materials; all shading and rigging below is done in code.
 *
 * Every mesh in the model is a "piece" that can be:
 *  - scattered into a drifting cloud            (explode)
 *  - laid out as an ordered exploded blueprint   (blueprint)
 *  - re-assembled feet → head, dissolving from hologram into solid metal (assemble)
 * Named rig nodes (rig_head, rig_arm_R, …) are posed procedurally for head
 * tracking, idle breathing, the power-on flex and the closing wave.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  BASE_STATE,
  STATE_KEYS,
  sampleKeyframes,
  type Keyframe,
  type SceneState,
} from "./timeline";

const CYAN = new THREE.Color("#3fd8f5");
const MAGENTA = new THREE.Color("#c77dff");
/** Robot height in scene units after normalisation. */
const MODEL_HEIGHT = 2.2;
const CAMERA_Z = 9;
const FOV = 30;
/** Eye centres on the visor, in the source model's units (see nexbot.glb). */
const EYE_X = 13;
const EYE_Y = 235;
const EYE_SIZE = new THREE.Vector2(12, 6.5);

export interface EngineOptions {
  reducedMotion: boolean;
  /** Lower particle count / pixel ratio / no contour lines on small or touch devices. */
  lowPower: boolean;
  onFrame?: (state: Readonly<SceneState>) => void;
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
  /** 0 (feet) … 1 (head) — assembly order. */
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

export class NexbotEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly opts: EngineOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  /** Viewport placement. */
  private readonly root = new THREE.Group();
  /** Turntable rotation. Everything below lives in normalised "model space". */
  private readonly tilt = new THREE.Group();
  private readonly key = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly rimCyan = new THREE.DirectionalLight(CYAN, 2.5);
  private readonly rimMagenta = new THREE.DirectionalLight(MAGENTA, 1.6);
  private readonly chestGlow = new THREE.PointLight(CYAN, 0, 2.2, 1.6);
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly resizeObserver: ResizeObserver;

  private pieces: Piece[] = [];
  private joints = new Map<string, Joint>();
  private points?: THREE.Points;
  private ring?: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private floorY = -MODEL_HEIGHT / 2;
  private loaded = false;

  /** Uniforms shared by every material. */
  private readonly u = {
    uTime: { value: 0 } as Uniform<number>,
    uPower: { value: 0 } as Uniform<number>,
    uBlink: { value: 1 } as Uniform<number>,
    uRing: { value: 0 } as Uniform<number>,
    uDisperse: { value: 0 } as Uniform<number>,
    uPoints: { value: 0 } as Uniform<number>,
    uPixelRatio: { value: 1 } as Uniform<number>,
    uPointSize: { value: 22 } as Uniform<number>,
    uModelInv: { value: new THREE.Matrix4() } as Uniform<THREE.Matrix4>,
    uCyan: { value: CYAN.clone() } as Uniform<THREE.Color>,
    uMagenta: { value: MAGENTA.clone() } as Uniform<THREE.Color>,
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
  private frameTimes: number[] = [];

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly AX = new THREE.Vector3(1, 0, 0);
  private readonly AY = new THREE.Vector3(0, 1, 0);
  private readonly AZ = new THREE.Vector3(0, 0, 1);

  constructor(container: HTMLElement, opts: EngineOptions) {
    this.container = container;
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.className = "block h-full w-full";
    this.canvas.style.opacity = "0";
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.u.uPixelRatio.value = this.pixelRatio;

    this.camera.position.set(0, 0, CAMERA_Z);
    this.scene.add(this.camera);

    // Studio reflections for the glossy visor and metal joints + brand rim lights.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
    this.disposables.push(envRT);

    this.key.position.set(-3, 4, 6);
    this.rimCyan.position.set(5, 1.5, -4);
    this.rimMagenta.position.set(-5, 0.5, -3);
    this.scene.add(this.key, this.rimCyan, this.rimMagenta);

    this.root.add(this.tilt);
    this.scene.add(this.root);

    this.finePointer = window.matchMedia("(pointer: fine)").matches;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    if (!opts.reducedMotion && this.finePointer) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    }
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // Loading & scene construction
  // ---------------------------------------------------------------------------

  async load(buffer: ArrayBuffer): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buffer, "");
    if (this.disposed) return;

    const model = gltf.scene;
    model.updateMatrixWorld(true);

    // Eyes are placed on the visor by ray-casting the rest pose (source units).
    const eyeHits = this.findEyeSurface(model);

    // Normalise: centred, MODEL_HEIGHT tall.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = MODEL_HEIGHT / size.y;
    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(s);
    wrapper.position.copy(center).multiplyScalar(-s);
    wrapper.add(model);
    this.tilt.add(wrapper);
    this.tilt.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(wrapper);
    this.collectJoints(model);
    this.buildPieces(model, bounds);
    this.buildEyes(eyeHits);
    this.points = this.buildPoints();
    this.ring = this.buildRing(bounds.min.y);
    this.tilt.add(this.points, this.ring);

    this.chestGlow.position.set(0, 0.45, 0.55);
    this.tilt.add(this.chestGlow);

    // Compile every program up-front so the first scroll never hitches.
    for (const p of this.pieces) {
      p.mesh.visible = true;
      p.holo.visible = true;
      if (p.edges) p.edges.visible = true;
    }
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
    const tiltInv = this.tilt.matrixWorld.clone().invert();
    model.traverse((o) => {
      if (!o.name.startsWith("rig_") || !o.parent) return;
      const parentModel = new THREE.Matrix4().multiplyMatrices(tiltInv, o.parent.matrixWorld);
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
  ): THREE.MeshPhysicalMaterial {
    const lp = this.opts.lowPower;
    const mat =
      kind === "visor"
        ? new THREE.MeshPhysicalMaterial({
            color: 0x050508,
            metalness: 0.55,
            roughness: 0.07,
            clearcoat: lp ? 0 : 1,
            clearcoatRoughness: 0.04,
          })
        : kind === "shell"
          ? new THREE.MeshPhysicalMaterial({
              color: 0x3b3d44,
              metalness: 0.12,
              roughness: 0.52,
              sheen: lp ? 0 : 0.7,
              sheenRoughness: 0.55,
              sheenColor: new THREE.Color(0x8d94a3),
            })
          : new THREE.MeshPhysicalMaterial({ color: 0x0b0b0e, metalness: 0.95, roughness: 0.26 });
    mat.defines = { ...mat.defines, NEX_KIND: kind === "visor" ? 0 : kind === "joint" ? 1 : 2 };
    const u = this.u;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uBuilt: built,
        uTime: u.uTime,
        uPower: u.uPower,
        uModelInv: u.uModelInv,
        uCyan: u.uCyan,
        uMagenta: u.uMagenta,
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
          uniform vec3 uCyan, uMagenta;
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
            totalEmissiveRadiance += mix(uCyan, uMagenta, nexN) * front * 4.0;
            // Powered-on rim light
            float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
            vec3 tint = mix(uCyan, uMagenta, smoothstep(-0.6, 1.1, vMPos.y + vMPos.x * 0.6));
            totalEmissiveRadiance += tint * rim * uPower * 0.55;
            #if NEX_KIND == 1
              // Energy flowing up through the joints
              float flow = smoothstep(0.75, 1.0, sin(vMPos.y * 26.0 - uTime * 5.0) * 0.5 + 0.5);
              totalEmissiveRadiance += uCyan * (0.05 + flow * 0.9) * uPower;
            #endif
          }`,
        );
    };
    mat.customProgramCacheKey = () => `nexbot-solid-${kind}-${lp ? 1 : 0}`;
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
        uniform vec3 uCyan, uMagenta;
        varying vec3 vMPos;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.2);
          float lines = smoothstep(0.8, 1.0, sin(vMPos.y * 90.0 - uTime * 2.0) * 0.5 + 0.5);
          float band = smoothstep(0.1, 0.0, abs(fract(vMPos.y * 0.45 - uTime * 0.15) - 0.5));
          vec3 col = mix(uCyan, uMagenta, smoothstep(-1.0, 1.3, vMPos.y + vMPos.x * 0.5));
          gl_FragColor = vec4(col, (0.04 + fres * 0.7 + lines * 0.12 + band * 0.25) * uAmt);
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
        uniform vec3 uCyan, uMagenta;
        varying vec3 vMPos;
        void main() {
          float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + vMPos.y * 14.0);
          vec3 col = mix(uCyan, uMagenta, smoothstep(-1.2, 1.4, vMPos.y - vMPos.x * 0.4));
          gl_FragColor = vec4(col, 0.55 * uAmt * flicker);
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
    const tiltInv = this.tilt.matrixWorld.clone().invert();
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

      // Piece centre in model space
      const toModel = new THREE.Matrix4().multiplyMatrices(tiltInv, mesh.matrixWorld);
      const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(toModel);

      // Scattered "signal" cloud
      const dir = c.clone().sub(mid);
      dir.y *= 0.6;
      dir
        .add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9))
        .normalize();
      const explode = dir.multiplyScalar(0.28 + rand() * 0.5);
      explode.y *= 0.75;
      explode.z += (rand() - 0.5) * 0.5;
      // Ordered exploded-view blueprint
      const blueprint = new THREE.Vector3(
        (c.x - mid.x) * 0.85,
        (c.y - mid.y) * 0.42,
        (c.z - mid.z) * 1.6 + (rand() - 0.5) * 0.08,
      );

      // Convert model-space offsets into the parent's local frame.
      const parentModel = new THREE.Matrix4().multiplyMatrices(tiltInv, mesh.parent!.matrixWorld);
      const toLocal = new THREE.Matrix3().setFromMatrix4(parentModel).invert();
      const spin = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rand() - 0.5) * 2.4, (rand() - 0.5) * 2.4, (rand() - 0.5) * 2.4),
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
      if (!this.opts.lowPower) {
        const posOnly = new THREE.BufferGeometry();
        const fg = toFloatGeometry(mesh.geometry);
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
        uniform vec3 uCyan;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          q.y /= max(uBlink, 0.06);
          float mask = smoothstep(1.0, 0.82, length(q));
          vec2 cell = fract(vUv * vec2(10.0, 6.5)) - 0.5;
          float led = smoothstep(0.44, 0.2, length(cell));
          float scan = 0.85 + 0.15 * sin(vUv.y * 40.0 - uTime * 6.0);
          float a = mask * (led * 0.95 + 0.12) * uPower * scan;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uCyan * 2.2, a);
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
    // One merged model-space surface for sampling.
    const tiltInv = this.tilt.matrixWorld.clone().invert();
    const posArr: number[] = [];
    const nrmArr: number[] = [];
    const m = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const p of this.pieces) {
      const g = toFloatGeometry(p.mesh.geometry).toNonIndexed();
      m.multiplyMatrices(tiltInv, p.mesh.matrixWorld);
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

    const count = this.opts.lowPower ? 3500 : 8000;
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
          vec3 p = position + dir * d * (0.4 + s * 2.2);
          float ang = d * (0.9 + s * 1.6) + uTime * 0.07 * (0.4 + s) * d;
          float c = cos(ang), sn = sin(ang);
          p.xz = mat2(c, -sn, sn, c) * p.xz;
          p += aNormal * 0.01 * sin(uTime * 2.0 + s * 40.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPointSize * uPixelRatio * (0.45 + s * 0.9) / -mv.z;
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + s * 2.0) + s * 60.0);
          vAlpha = uPoints * twinkle * (0.35 + 0.65 * fract(s * 13.7));
          vMix = fract(s * 7.31);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCyan, uMagenta;
        varying float vAlpha;
        varying float vMix;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r);
          if (a * vAlpha < 0.003) discard;
          gl_FragColor = vec4(mix(uCyan, uMagenta, vMix * vMix), a * a * vAlpha);
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
    const geo = new THREE.PlaneGeometry(1.45, 1.45);
    this.disposables.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uRing, uPower;
        uniform vec3 uCyan, uMagenta;
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
          float glow = exp(-r * r * 5.0) * (0.18 + 0.3 * uPower);
          vec3 col = mix(uCyan, uMagenta, smoothstep(0.2, 0.8, ang));
          float a = (outer + inner + ticks * 0.8 + arc * 0.9 + pulse * 1.4 + glow) * uRing * smoothstep(1.0, 0.9, r);
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = floorY + 0.005;
    this.floorY = floorY;
    ring.renderOrder = 0;
    return ring;
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
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Drops the pixel ratio if the device can't sustain ~45fps. Never raises it. */
  private adaptQuality(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.u.uPixelRatio.value = this.pixelRatio;
      this.resize();
    }
  }

  /** Applies model-space rotations (applied X, then Y, then Z) to a rig joint. */
  private pose(name: string, rx: number, ry: number, rz: number) {
    const j = this.joints.get(name);
    if (!j) return;
    const d = this.tmpQ.setFromAxisAngle(this.AZ, rz);
    d.multiply(this.tmpQ2.setFromAxisAngle(this.AY, ry));
    d.multiply(this.tmpQ2.setFromAxisAngle(this.AX, rx));
    // Express the model-space delta in the parent's frame (handles mirrored limbs).
    const w = Math.min(1, Math.max(-1, d.w));
    const angle = 2 * Math.acos(w);
    const sinHalf = Math.sqrt(1 - w * w);
    if (sinHalf < 1e-5) {
      j.node.quaternion.copy(j.restQuat);
      return;
    }
    const axis = this.tmpV
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
    // Power-on flex: a short shoulder roll while the robot boots.
    const boot = 4 * c.power * (1 - c.power);
    const wave = c.wave;
    const waveCycle = Math.sin(t * 6.5) * idle;

    // Head: follows the cursor; gentle auto-glance on touch devices.
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

    // Arms: relaxed sway, boot flex; the robot's right arm waves in the finale.
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
      const next = reduced ? t[k] : damp(c[k], t[k], 6, dt);
      delta = Math.max(delta, Math.abs(next - c[k]));
      c[k] = next;
    }

    if (!reduced) {
      this.time += dt;
      this.intro = Math.min(1, this.intro + dt / 2.8);
      this.pointer.x = damp(this.pointer.x, this.pointer.tx, 3.5, dt);
      this.pointer.y = damp(this.pointer.y, this.pointer.ty, 3.5, dt);
    }

    // Intro: the robot materialises feet → head on first load.
    const introE = 1 - Math.pow(1 - this.intro, 3);
    const opacity = c.opacity * Math.min(1, this.intro * 4);
    this.canvas.style.opacity = opacity.toFixed(3);
    this.opts.onFrame?.(c);

    if (opacity < 0.004) return;
    if (reduced && delta < 1e-4 && !this.needsRender) return;
    this.needsRender = false;

    // Viewport placement: x/y in viewport space, scale = robot height / viewport height.
    const visH = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * this.camera.aspect;
    const float = reduced ? 0 : Math.sin(this.time * 0.9) * 0.03 * (1 - c.assemble * 0.6);
    this.root.position.set((c.x * visW) / 2, (c.y * visH) / 2 + float, 0);
    this.root.scale.setScalar((c.scale * visH) / MODEL_HEIGHT);
    const idleYaw = reduced ? 0 : Math.sin(this.time * 0.3) * 0.1 * (1 - c.assemble * 0.7);
    this.tilt.rotation.set(
      c.rotX + this.pointer.y * 0.05,
      c.rotY + idleYaw + this.pointer.x * 0.22 + (1 - introE) * -0.6,
      0,
    );

    // Pieces: scatter / blueprint / assemble
    const assemble = Math.min(c.assemble, smooth(0.08, 1, this.intro));
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
        const drift = reduced ? 0 : Math.sin(tm * 0.6 + i * 1.7) * 0.06 * c.explode;
        m.position
          .addScaledVector(p.explodeOff, free * (c.explode + drift))
          .addScaledVector(p.blueprintOff, free * c.blueprint);
        const spinAmt = free * c.explode;
        m.quaternion.copy(p.restQuat).multiply(this.tmpQ.identity().slerp(p.spin, spinAmt));
      } else {
        m.quaternion.copy(p.restQuat);
      }
      p.built.value = a;
      m.visible = true; // children (holo/edges) still need the parent visible
      p.holoAmt.value = holoBase * free;
      p.edgeAmt.value = edgeBase * free;
      p.holo.visible = p.holoAmt.value > 0.002;
      if (p.edges) p.edges.visible = p.edgeAmt.value > 0.002;
    }

    this.animateRig(c, this.time, reduced);

    // Shared uniforms
    this.tilt.updateMatrixWorld(true);
    this.u.uModelInv.value.copy(this.tilt.matrixWorld).invert();
    this.u.uTime.value = this.time;
    this.u.uPower.value = c.power * smooth(0.6, 1, this.intro);
    this.u.uRing.value = c.ring * introE;
    this.u.uDisperse.value = c.disperse;
    this.u.uPoints.value = c.points;
    if (!reduced) {
      const blinkPhase = this.time % 4.2;
      this.u.uBlink.value =
        blinkPhase < 0.14 ? Math.abs(Math.cos((blinkPhase / 0.14) * Math.PI)) : 1;
    }
    this.points!.visible = c.points > 0.001;
    this.ring!.visible = this.u.uRing.value > 0.002;
    // Keep the floor ring under the feet while the blueprint spreads the parts out.
    this.ring!.position.y = this.floorY + 0.005 - 0.46 * c.blueprint * (1 - assemble);
    for (const e of this.eyes) e.visible = this.u.uPower.value > 0.002;

    this.rimCyan.intensity = 2.5 + c.power * 2.5;
    this.rimMagenta.intensity = 1.6 + c.power * 1.4;
    this.chestGlow.intensity = c.power * 1.6;

    this.renderer.render(this.scene, this.camera);
    if (!reduced) this.adaptQuality(dt);
  };
}
