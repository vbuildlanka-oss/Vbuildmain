/**
 * Particle engine: a dust sphere that morphs into a brain as you scroll.
 *
 * The look comes from the "Particles" Spline community scene by auroregmbt
 * (https://app.spline.design/community/file/3ff7b617-2fe9-46c7-8e06-b6d7c382f4db):
 * a fine, frayed shell of dust that parts around the cursor. It's rebuilt in
 * plain three.js because a Spline export can't morph its particles into
 * another shape.
 *
 * Every particle carries a sphere position, a brain position and a random
 * seed (see particles.ts). One vertex shader does all the work:
 * - a staggered morph between the two shapes, with a curl of noise mid-flight
 * - a scatter into a cloud
 * - idle breathing
 * - cursor repulsion in screen space
 * - neural activity on the brain
 * The CPU only uploads a few uniforms per frame.
 *
 * Rendering is sharp at high resolution. Pixel ratio goes up to 2 within a
 * budget of about 8.3 MP (a full 3840×2160 frame). Sprites are sized in CSS
 * pixels, so they look the same at any density. There is no post-processing,
 * so nothing is upscaled or blurred.
 */
import * as THREE from "three";

import type { ParticleData } from "./particles";
import {
  BASE_STATE,
  STATE_KEYS,
  sampleKeyframes,
  type Keyframe,
  type SceneState,
} from "./timeline";

/** Page background (#040609); must match --background in styles.css. */
const BG_HEX = 0x040609;
/** Brand colours from the logo, matching --primary and --violet. */
const ICE = new THREE.Color("#5ee9fb");
const VIOLET = new THREE.Color("#9b62ff");
const FOV = 30;
/** Max rendered pixels: a full 4K UHD frame. */
const PIXEL_BUDGET_4K = 3840 * 2160;

/**
 * Device tier picked by ScrollScene.
 * - 2: desktop, DPR up to 2 within the 4K budget
 * - 1: tablets and phones
 * - 0: low-end devices
 */
export type Quality = 0 | 1 | 2;

export interface EngineOptions {
  reducedMotion: boolean;
  quality: Quality;
  onContextLost?: () => void;
}

type Uniform<T> = { value: T };

const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ashima / Stefan Gustavson 3D simplex noise (MIT). */
const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uScatter;
  uniform float uPulse;
  uniform float uTint;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uViewScale;
  uniform float uOpacity;
  uniform float uAspect;
  uniform float uPointerForce;
  uniform vec2 uPointer;
  uniform vec3 uIce;
  uniform vec3 uViolet;
  uniform vec3 uCamDir;

  attribute vec4 aBrain;
  attribute vec4 aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  ${NOISE_GLSL}

  void main() {
    float r1 = aSeed.w;
    float r2 = fract(r1 * 7.731 + aSeed.x * 3.17 + 0.5);
    float r3 = fract(r1 * 13.37 + aSeed.y * 5.11 + 0.5);

    // Staggered morph: each particle leaves the sphere at its own moment, so the
    // shell flows into the brain instead of snapping.
    float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.6 - r2 * 0.6, 0.0, 1.0));
    vec3 pos = mix(position, aBrain.xyz, m);
    float travel = sin(3.14159265 * m);

    // Idle breathing, stronger on the loose sphere than on the brain.
    vec3 dir = normalize(pos + vec3(1e-5));
    float breathe = snoise(pos * 1.7 + vec3(0.0, uTime * 0.22, uTime * 0.05));
    pos += dir * breathe * mix(0.032, 0.008, m);

    float flowAmt = travel * 0.5 + uScatter;
    if (flowAmt > 0.001) {
      vec3 q = pos * 1.15 + vec3(uTime * 0.06);
      vec3 flow = vec3(snoise(q), snoise(q + 19.1), snoise(q + 37.7));
      pos += flow * flowAmt * 0.32;
      // Scatter: burst out into a wide, slowly turning cloud.
      vec3 cloud = aSeed.xyz * (1.2 + pow(r1, 0.7) * 2.2);
      float a = uTime * (0.025 + r3 * 0.05) + r2 * 6.2831;
      float ca = cos(a);
      float sa = sin(a);
      cloud.xz = mat2(ca, -sa, sa, ca) * cloud.xz;
      pos = mix(pos, cloud + flow * 0.25, uScatter * 0.85);
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;

    // Cursor: particles part around the pointer, in screen space, like the Spline scene.
    if (uPointerForce > 0.001) {
      vec2 ndc = clip.xy / clip.w;
      vec2 dv = (ndc - uPointer) * vec2(uAspect, 1.0);
      float d2 = dot(dv, dv);
      float f = uPointerForce * exp(-d2 / 0.035);
      ndc += (dv / (sqrt(d2) + 1e-4)) / vec2(uAspect, 1.0) * f * 0.085 * (0.55 + r3 * 0.9);
      clip.xy = ndc * clip.w;
    }
    gl_Position = clip;

    // Neural activity: slow waves of light crawl across the cortex, plus single sparks.
    float act = 0.0;
    if (uPulse > 0.001) {
      float wave = snoise(aBrain.xyz * 2.1 + vec3(uTime * 0.45, -uTime * 0.3, uTime * 0.2));
      act = smoothstep(0.42, 0.85, wave);
      float spark = smoothstep(0.975, 1.0, fract(r1 * 57.3 + uTime * (0.1 + r3 * 0.22)));
      act = max(act, spark) * uPulse * m;
    }

    // Grooves stay dim; this is what draws the folds of the cortex.
    float surface = mix(1.0, aBrain.w, m);
    float twinkle = 0.7 + 0.3 * sin(uTime * (0.7 + r3 * 2.4) + r1 * 40.0);
    // Far side of the shape is dimmer, so the volume reads as 3D rather than flat.
    float facing = dot(normalize(pos + vec3(1e-5)), uCamDir);
    float depthFade = mix(0.22, 1.0, smoothstep(-0.6, 0.5, facing));

    vec3 white = vec3(0.88, 0.92, 1.0);
    float g = smoothstep(-1.0, 1.0, aBrain.x * 0.85 + aBrain.y * 0.55);
    vec3 brand = mix(uViolet, uIce, g);
    vec3 col = mix(white, mix(white, brand, 0.85), uTint);
    col = mix(col, uIce * 1.35 + vec3(0.18), act);

    float size = uSize * (0.55 + r2 * 0.9) * (0.7 + 0.3 * surface) * (1.0 + act * 0.8);
    float px = size * uPixelRatio * uViewScale * (5.0 / max(0.1, -mv.z));
    gl_PointSize = max(px, 1.0);
    // Sub-pixel sprites fade instead of shimmering.
    float coverage = clamp(px / 1.6, 0.0, 1.0);

    vColor = col;
    vAlpha = uOpacity * twinkle * coverage * coverage * depthFade
      * (0.22 + 0.78 * surface) * (1.0 + act * 1.4);
  }`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    // Bright core, soft falloff: crisp at 4K without hard pixel edges.
    float a = 1.0 - d;
    a = a * a * (0.6 + 0.4 * a);
    gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
    #include <colorspace_fragment>
  }`;

/** Faint far-field dust for depth. */
const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uViewScale;
  uniform float uOpacity;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float a = uTime * (0.01 + aSeed.x * 0.02);
    float ca = cos(a);
    float sa = sin(a);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;
    p.y += sin(uTime * 0.2 + aSeed.y * 6.2831) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = (0.8 + aSeed.z * 1.4) * uPixelRatio * uViewScale * (5.0 / max(0.1, -mv.z));
    gl_PointSize = max(px, 1.0);
    vAlpha = uOpacity * (0.12 + 0.2 * aSeed.w) * clamp(px / 1.6, 0.0, 1.0)
      * (0.6 + 0.4 * sin(uTime * (0.5 + aSeed.w) + aSeed.x * 30.0));
  }`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d) * (1.0 - d);
    gl_FragColor = vec4(uColor * a * vAlpha, 1.0);
    #include <colorspace_fragment>
  }`;

export class ParticleEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly opts: EngineOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
  private readonly subject = new THREE.Group();
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly resizeObserver: ResizeObserver;

  private points?: THREE.Points;
  private dust?: THREE.Points;
  private count = 0;
  /** Share of particles drawn; lowered when the device can't keep up. */
  private drawShare = 1;

  private readonly u = {
    uTime: { value: 0 } as Uniform<number>,
    uMorph: { value: 0 } as Uniform<number>,
    uScatter: { value: 0 } as Uniform<number>,
    uPulse: { value: 0 } as Uniform<number>,
    uTint: { value: 0 } as Uniform<number>,
    uSize: { value: 1 } as Uniform<number>,
    uPixelRatio: { value: 1 } as Uniform<number>,
    uViewScale: { value: 1 } as Uniform<number>,
    uOpacity: { value: 1 } as Uniform<number>,
    uAspect: { value: 1 } as Uniform<number>,
    uPointerForce: { value: 0 } as Uniform<number>,
    uPointer: { value: new THREE.Vector2(9, 9) } as Uniform<THREE.Vector2>,
    uIce: { value: ICE.clone() } as Uniform<THREE.Color>,
    uViolet: { value: VIOLET.clone() } as Uniform<THREE.Color>,
    uCamDir: { value: new THREE.Vector3(0, 0, 1) } as Uniform<THREE.Vector3>,
  };
  private readonly dustU = {
    uTime: this.u.uTime,
    uPixelRatio: this.u.uPixelRatio,
    uViewScale: this.u.uViewScale,
    uOpacity: { value: 1 } as Uniform<number>,
    uColor: { value: new THREE.Color("#a9c4ff") } as Uniform<THREE.Color>,
  };

  private keyframes: Keyframe[] = [];
  private readonly target: SceneState = { ...BASE_STATE, opacity: 0 };
  private readonly current: SceneState = { ...BASE_STATE, opacity: 0 };
  private hasSampled = false;
  /** Pointer in NDC (y up); `inside` = over the window. */
  private pointer = { x: 9, y: 9, tx: 9, ty: 9, speed: 0, force: 0, inside: false };
  private readonly finePointer: boolean;
  private intro = 0;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private disposed = false;
  private needsRender = true;
  private pixelRatio = 1;
  private readonly maxPixelRatio: number;
  private readonly pixelBudget: number;
  private prScale = 1;
  private frameTimes: number[] = [];
  private viewport = { w: 1, h: 1 };
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();

  constructor(container: HTMLElement, opts: EngineOptions) {
    this.container = container;
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.className = "block h-full w-full";
    container.style.opacity = "0";
    container.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(new THREE.Color(BG_HEX), 1);

    this.maxPixelRatio = [1.5, 2, 2][opts.quality];
    this.pixelBudget = [2.2e6, 4.2e6, PIXEL_BUDGET_4K][opts.quality];

    this.scene.add(this.subject);
    this.finePointer = window.matchMedia("(pointer: fine)").matches;
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    if (!opts.reducedMotion && this.finePointer) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    }
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  async load(data: ParticleData): Promise<void> {
    this.count = data.count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.sphere, 3));
    geo.setAttribute("aBrain", new THREE.BufferAttribute(data.brain, 4));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(data.seed, 4));
    // Both shapes and the scatter cloud fit in this; skips per-frame bounds work.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.subject.add(this.points);
    this.disposables.push(geo, mat);

    this.buildDust();
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  private buildDust() {
    const n = [500, 900, 1600][this.opts.quality];
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const r = 2.6 + Math.pow(Math.random(), 0.6) * 6;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(phi) * r;
      pos[i * 3 + 1] = u * r * 0.7;
      pos[i * 3 + 2] = s * Math.sin(phi) * r;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.dustU,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.disposables.push(geo, mat);
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
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
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
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    if (!this.pointer.inside) {
      // Re-entering: jump there instead of sweeping across the frame.
      this.pointer.x = x;
      this.pointer.y = y;
    }
    this.pointer.speed += Math.hypot(x - this.pointer.tx, y - this.pointer.ty);
    this.pointer.tx = x;
    this.pointer.ty = y;
    this.pointer.inside = true;
  };

  private onPointerLeave = () => {
    this.pointer.inside = false;
  };

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.viewport = { w, h };
    const budgetRatio = Math.sqrt((this.pixelBudget * this.prScale) / Math.max(1, w * h));
    this.pixelRatio = Math.max(
      0.75,
      Math.min(window.devicePixelRatio || 1, this.maxPixelRatio, budgetRatio),
    );
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.u.uPixelRatio.value = this.pixelRatio;
    // Sprite sizes are tuned on a 900px-tall viewport and scale with it.
    this.u.uViewScale.value = h / 900;
    this.u.uAspect.value = w / h;
    this.camera.aspect = w / h;
    this.needsRender = true;
  }

  /**
   * If the device can't hold about 50fps, steps quality down: pixel ratio
   * first, then particle count. Never steps back up.
   */
  private adaptQuality(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    this.frameTimes.length = 0;
    if (sorted[Math.floor(sorted.length / 2)] <= 1 / 50) return;
    if (this.prScale > 0.4) {
      this.prScale = Math.max(0.35, this.prScale * 0.72);
      this.resize();
    } else if (this.drawShare > 0.3) {
      // Particles are stored in random order, so any prefix is an even subset.
      this.drawShare = Math.max(0.3, this.drawShare * 0.7);
      this.points?.geometry.setDrawRange(0, Math.floor(this.count * this.drawShare));
      // Fewer particles: make each one a little brighter so the shape keeps its weight.
      this.needsRender = true;
    }
  }

  private updateCamera(c: SceneState, t: number) {
    const handheld = this.opts.reducedMotion ? 0 : 1;
    const introE = 1 - Math.pow(1 - this.intro, 3);
    const px = this.pointer.inside ? this.pointer.x : 0;
    const py = this.pointer.inside ? this.pointer.y : 0;
    const orbit = c.orbit + px * 0.12 + Math.sin(t * 0.21) * 0.05 * handheld;
    const pitch = c.pitch + py * 0.05 + Math.sin(t * 0.17 + 1.3) * 0.02 * handheld;
    const dist = c.dist * (1 + (1 - introE) * 0.25);
    this.camera.position.set(
      dist * Math.cos(pitch) * Math.sin(orbit),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(orbit),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    // Lens shift: move the subject on screen without rotating the view.
    const pm = this.camera.projectionMatrix.elements;
    pm[8] = -c.shiftX;
    pm[9] = -c.shiftY;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.updateMatrixWorld();
    // Camera direction in subject space, for the near/far shading.
    this.tmpV.copy(this.camera.position).normalize();
    this.subject.updateMatrixWorld();
    this.tmpM.copy(this.subject.matrixWorld).invert();
    this.u.uCamDir.value.copy(this.tmpV).transformDirection(this.tmpM);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (!this.points) return;

    const reduced = this.opts.reducedMotion;
    const t = this.target;
    const c = this.current;

    sampleKeyframes(this.keyframes, window.scrollY, t);
    if (!this.hasSampled) {
      Object.assign(c, t);
      this.hasSampled = true;
    }
    for (const k of STATE_KEYS) c[k] = reduced ? t[k] : damp(c[k], t[k], 7, dt);

    if (reduced) {
      this.intro = 1;
      this.time = 12;
    } else {
      this.time += dt;
      this.intro = Math.min(1, this.intro + dt / 2.6);
      const p = this.pointer;
      p.x = damp(p.x, p.tx, 9, dt);
      p.y = damp(p.y, p.ty, 9, dt);
      // Resting cursor still parts the dust a little; moving it pushes harder.
      const want = p.inside ? Math.min(1.25, 0.4 + p.speed * 9) : 0;
      p.force = damp(p.force, want, p.force < want ? 10 : 2.5, dt);
      p.speed = damp(p.speed, 0, 6, dt);
    }

    const introE = 1 - Math.pow(1 - this.intro, 3);
    const opacity = c.opacity * smooth(0, 0.35, this.intro);
    const op = opacity.toFixed(3);
    if (this.container.style.opacity !== op) this.container.style.opacity = op;
    // Fully faded out: drop the layer from compositing and skip the GPU entirely.
    const vis = opacity < 0.004 ? "hidden" : "visible";
    if (this.container.style.visibility !== vis) this.container.style.visibility = vis;
    if (opacity < 0.004) return;
    if (reduced && !this.needsRender) return;
    this.needsRender = false;

    // A slow sway so the brain's depth reads even when the page is still.
    this.subject.rotation.y = reduced ? 0 : Math.sin(this.time * 0.13) * 0.22;
    this.updateCamera(c, this.time);

    this.u.uTime.value = this.time;
    this.u.uMorph.value = c.morph;
    // Intro: the dust gathers into the sphere on load.
    this.u.uScatter.value = Math.max(c.scatter, (1 - introE) * 0.9);
    this.u.uPulse.value = c.pulse;
    this.u.uTint.value = c.tint;
    // Phones pull the camera far back to fit the narrow frame; keep the dust from vanishing.
    this.u.uSize.value = c.size * 1.55 * Math.sqrt(Math.max(1, c.dist / 6));
    this.u.uOpacity.value = Math.min(1.6, 1 / Math.sqrt(this.drawShare));
    this.u.uPointerForce.value = this.pointer.force;
    this.u.uPointer.value.set(this.pointer.x, this.pointer.y);
    this.dustU.uOpacity.value = 0.6 + c.scatter * 0.6;

    this.renderer.render(this.scene, this.camera);
    if (!reduced) this.adaptQuality(dt);
  };
}
