/**
 * HelmetEngine — vanilla Three.js renderer for the scroll-driven hero model.
 *
 * Model: "Sci-Fi Helmet" by Michael Pavlovich, Khronos glTF Sample Assets,
 * CC0 1.0 (public domain). Re-packed with glTF-Transform (meshopt + WebP, 1K).
 *
 * The same geometry is rendered four ways and blended by scroll state:
 *  - Points     — surface-sampled particle cloud ("signal"/data)
 *  - Hologram   — additive fresnel shell ("blueprint")
 *  - Edges      — contour lines ("blueprint")
 *  - PBR        — the real textured model, revealed by a rising scan plane,
 *                 with emissive seams + rim energy when "ignited".
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
const MODEL_HEIGHT = 2.2;
const CAMERA_Z = 9;
const FOV = 30;

export interface EngineOptions {
  reducedMotion: boolean;
  /** Lower particle count / pixel ratio for small or touch devices. */
  lowPower: boolean;
  onFrame?: (state: Readonly<SceneState>) => void;
  onContextLost?: () => void;
}

type Uniform<T> = { value: T };

/** Copies (and de-quantizes) every attribute into a plain Float32 geometry. */
function toFloatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const a = attr as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const size = a.itemSize;
    const arr = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      const o = i * size;
      arr[o] = a.getX(i);
      if (size > 1) arr[o + 1] = a.getY(i);
      if (size > 2) arr[o + 2] = a.getZ(i);
      if (size > 3) arr[o + 3] = a.getW(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (src.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array), 1));
  return out;
}

const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

export class HelmetEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly opts: EngineOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly root = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly rimCyan = new THREE.DirectionalLight(CYAN, 1.5);
  private readonly rimMagenta = new THREE.DirectionalLight(MAGENTA, 1);
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly resizeObserver: ResizeObserver;

  private solid?: THREE.Mesh;
  private holo?: THREE.Mesh;
  private edges?: THREE.LineSegments;
  private points?: THREE.Points;
  private minY = -MODEL_HEIGHT / 2;
  private maxY = MODEL_HEIGHT / 2;

  private readonly u = {
    uTime: { value: 0 } as Uniform<number>,
    uBuildY: { value: -10 } as Uniform<number>,
    uIntroY: { value: -10 } as Uniform<number>,
    uFront: { value: 0 } as Uniform<number>,
    uIgnite: { value: 0 } as Uniform<number>,
    uHolo: { value: 0 } as Uniform<number>,
    uEdges: { value: 0 } as Uniform<number>,
    uDisperse: { value: 0 } as Uniform<number>,
    uPoints: { value: 0 } as Uniform<number>,
    uPixelRatio: { value: 1 } as Uniform<number>,
    uPointSize: { value: 26 } as Uniform<number>,
    uCyan: { value: CYAN.clone() } as Uniform<THREE.Color>,
    uMagenta: { value: MAGENTA.clone() } as Uniform<THREE.Color>,
  };

  private keyframes: Keyframe[] = [];
  private readonly target: SceneState = { ...BASE_STATE, opacity: 0 };
  private readonly current: SceneState = { ...BASE_STATE, opacity: 0 };
  private hasSampled = false;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private intro = 0;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private disposed = false;
  private needsRender = true;
  private pixelRatio: number;
  private frameTimes: number[] = [];

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
    this.renderer.toneMappingExposure = 1.05;

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.u.uPixelRatio.value = this.pixelRatio;

    this.camera.position.set(0, 0, CAMERA_Z);
    this.scene.add(this.camera);

    // Lighting: neutral studio reflections + brand-coloured rim lights.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.disposables.push(envRT);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 4, 5);
    this.rimCyan.position.set(4, 1.5, -4);
    this.rimMagenta.position.set(-4, -1, -3);
    this.scene.add(key, this.rimCyan, this.rimMagenta);

    this.root.add(this.tilt);
    this.scene.add(this.root);

    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    if (!opts.reducedMotion && window.matchMedia("(pointer: fine)").matches) {
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

    gltf.scene.updateMatrixWorld(true);
    let src: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (!src) throw new Error("Model contains no mesh");

    // Bake transform into a float geometry, centred and normalised in height.
    const geo = toFloatGeometry(src.geometry);
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    const s = MODEL_HEIGHT / size.y;
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.minY = geo.boundingBox!.min.y;
    this.maxY = geo.boundingBox!.max.y;
    src.geometry.dispose();
    this.disposables.push(geo);

    // --- PBR model --------------------------------------------------------
    const material = src.material as THREE.MeshStandardMaterial;
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (const tex of [material.map, material.normalMap, material.roughnessMap, material.aoMap]) {
      if (tex) {
        tex.anisotropy = aniso;
        this.disposables.push(tex);
      }
    }
    this.patchSolidMaterial(material);
    this.disposables.push(material);
    this.solid = new THREE.Mesh(geo, material);
    this.solid.visible = false;

    // --- Hologram shell ---------------------------------------------------
    const holoMat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          vLocal = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uHolo, uBuildY, uIntroY;
        uniform vec3 uCyan, uMagenta;
        varying vec3 vLocal;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        void main() {
          if (vLocal.y < uBuildY || vLocal.y > uIntroY) discard;
          float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.4);
          float lines = smoothstep(0.82, 1.0, sin(vLocal.y * 70.0 - uTime * 1.5) * 0.5 + 0.5);
          float band = smoothstep(0.12, 0.0, abs(fract(vLocal.y * 0.35 - uTime * 0.12) - 0.5));
          float drawFront = smoothstep(0.12, 0.0, uIntroY - vLocal.y);
          vec3 col = mix(uCyan, uMagenta, smoothstep(-1.2, 1.4, vLocal.y + vLocal.x * 0.4));
          float a = (0.035 + fres * 0.75 + lines * 0.16 + band * 0.22 + drawFront * 0.8) * uHolo;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(holoMat);
    this.holo = new THREE.Mesh(geo, holoMat);
    this.holo.renderOrder = 1;

    // --- Blueprint contour lines -----------------------------------------
    const posOnly = new THREE.BufferGeometry();
    posOnly.setAttribute("position", geo.getAttribute("position"));
    if (geo.index) posOnly.setIndex(geo.index);
    const merged = mergeVertices(posOnly, 1e-4);
    const edgesGeo = new THREE.EdgesGeometry(merged, 32);
    merged.dispose();
    this.disposables.push(edgesGeo);
    const edgesMat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uEdges, uBuildY, uIntroY;
        uniform vec3 uCyan, uMagenta;
        varying vec3 vLocal;
        void main() {
          if (vLocal.y < uBuildY || vLocal.y > uIntroY) discard;
          float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + vLocal.y * 12.0);
          vec3 col = mix(uCyan, uMagenta, smoothstep(-1.4, 1.6, vLocal.y - vLocal.x * 0.3));
          gl_FragColor = vec4(col, 0.42 * uEdges * flicker);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(edgesMat);
    this.edges = new THREE.LineSegments(edgesGeo, edgesMat);
    this.edges.renderOrder = 2;

    // --- Surface particles -----------------------------------------------
    this.points = this.buildPoints(geo);

    this.tilt.add(this.solid, this.holo, this.edges, this.points);

    // Compile all programs up-front so the first scroll never hitches.
    this.solid.visible = true;
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    this.solid.visible = false;
    this.intro = this.opts.reducedMotion ? 1 : 0;
    this.needsRender = true;
  }

  private patchSolidMaterial(material: THREE.MeshStandardMaterial) {
    const u = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uBuildY: u.uBuildY,
        uFront: u.uFront,
        uIgnite: u.uIgnite,
        uTime: u.uTime,
        uCyan: u.uCyan,
        uMagenta: u.uMagenta,
      });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vLocal;
          uniform float uBuildY, uFront, uIgnite, uTime;
          uniform vec3 uCyan, uMagenta;`,
        )
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          if (vLocal.y > uBuildY) discard;`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float front = (1.0 - smoothstep(0.0, 0.09, uBuildY - vLocal.y)) * uFront;
            totalEmissiveRadiance += uCyan * front * 3.5;
            #ifdef USE_AOMAP
              float aoS = texture2D(aoMap, vAoMapUv).r;
            #else
              float aoS = 1.0;
            #endif
            float seam = smoothstep(0.72, 0.18, aoS);
            float pulse = 0.55 + 0.45 * sin(vLocal.y * 5.0 - uTime * 2.2);
            float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
            vec3 tint = mix(uCyan, uMagenta, smoothstep(-1.1, 1.1, vLocal.y));
            totalEmissiveRadiance += tint * (seam * pulse * 1.6 + rim * 0.35) * uIgnite;
          }`,
        );
    };
    material.customProgramCacheKey = () => "vbuild-helmet-solid";
    material.needsUpdate = true;
  }

  private buildPoints(geo: THREE.BufferGeometry): THREE.Points {
    const count = this.opts.lowPower ? 4000 : 9000;
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
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
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aNormal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rnd, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    this.disposables.push(g);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        uniform float uTime, uDisperse, uPointSize, uPixelRatio, uPoints, uIntroY;
        attribute vec3 aNormal;
        attribute vec4 aRand;
        varying float vAlpha;
        varying float vMix;
        void main() {
          float s = aRand.w;
          float d = uDisperse;
          vec3 dir = normalize(aNormal * 0.9 + aRand.xyz);
          vec3 p = position + dir * d * (0.5 + s * 2.6);
          float ang = d * (1.1 + s * 1.8) + uTime * 0.06 * (0.4 + s) * d;
          float c = cos(ang), sn = sin(ang);
          p.xz = mat2(c, -sn, sn, c) * p.xz;
          p += aNormal * 0.012 * sin(uTime * 2.0 + s * 40.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPointSize * uPixelRatio * (0.45 + s * 0.9) / -mv.z;
          gl_Position = projectionMatrix * mv;
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + s * 2.0) + s * 60.0);
          vAlpha = uPoints * twinkle * (0.35 + 0.65 * fract(s * 13.7)) * step(position.y, uIntroY);
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
          vec3 col = mix(uCyan, uMagenta, vMix * vMix);
          gl_FragColor = vec4(col, a * a * vAlpha);
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

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (!this.solid) return;

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
      const next = reduced ? t[k] : damp(c[k], t[k], 6.5, dt);
      delta = Math.max(delta, Math.abs(next - c[k]));
      c[k] = next;
    }

    if (!reduced) {
      this.time += dt;
      this.intro = Math.min(1, this.intro + dt / 2.6);
      this.pointer.x = damp(this.pointer.x, this.pointer.tx, 3, dt);
      this.pointer.y = damp(this.pointer.y, this.pointer.ty, 3, dt);
    }

    const introE = 1 - Math.pow(1 - this.intro, 3);
    const opacity = c.opacity * Math.min(1, introE * 2.5);
    this.canvas.style.opacity = opacity.toFixed(3);
    this.opts.onFrame?.(c);

    // Nothing visible → skip the GPU entirely.
    if (opacity < 0.004) return;
    // Reduced motion: only render when something actually changed.
    if (reduced && delta < 1e-4 && !this.needsRender) return;
    this.needsRender = false;

    // Layout: viewport-space → world-space on the z=0 plane.
    const visH = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * this.camera.aspect;
    const float = reduced ? 0 : Math.sin(this.time * 0.8) * 0.045;
    this.root.position.set((c.x * visW) / 2, (c.y * visH) / 2 + float, 0);
    this.root.scale.setScalar(c.scale * (0.9 + 0.1 * introE));
    const idle = reduced ? 0 : Math.sin(this.time * 0.35) * 0.12 * (1 - c.build * 0.5);
    this.tilt.rotation.set(
      c.rotX + this.pointer.y * 0.12,
      c.rotY + idle + this.pointer.x * 0.32 + (1 - introE) * -0.9,
      c.rotZ,
    );

    // Materials
    const pad = 0.06;
    this.u.uTime.value = this.time;
    this.u.uBuildY.value = THREE.MathUtils.lerp(this.minY - pad, this.maxY + pad, c.build);
    this.u.uIntroY.value = THREE.MathUtils.lerp(this.minY - pad * 2, this.maxY + pad * 2, introE);
    this.u.uFront.value =
      THREE.MathUtils.smoothstep(c.build, 0, 0.04) *
      (1 - THREE.MathUtils.smoothstep(c.build, 0.96, 1));
    this.u.uIgnite.value = c.ignite;
    this.u.uHolo.value = c.holo;
    this.u.uEdges.value = c.edges;
    this.u.uDisperse.value = c.disperse;
    this.u.uPoints.value = c.points;

    this.solid.visible = c.build > 0.001;
    this.holo!.visible = c.holo > 0.001 && c.build < 0.999;
    this.edges!.visible = c.edges > 0.001 && c.build < 0.999;
    this.points!.visible = c.points > 0.001;

    this.rimCyan.intensity = 1.5 + c.ignite * 2.5;
    this.rimMagenta.intensity = 1 + c.ignite * 1.5;

    this.renderer.render(this.scene, this.camera);
    if (!reduced) this.adaptQuality(dt);
  };
}
