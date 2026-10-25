/**
 * Particle targets for the scroll scene: a dust sphere (after the
 * "Particles" Spline community scene by auroregmbt) and a brain.
 *
 * Particle i has a position on the sphere and a matching position on the
 * brain, so the GPU can morph one into the other. To keep the pairs
 * coherent, the sphere direction is stretched into an ellipsoid shaped like
 * a brain. The surface is then found along that ray. The sphere deforms into
 * the brain instead of rearranging itself at random.
 *
 * The brain is an implicit surface built from smooth-unioned ellipsoids:
 * two cerebral hemispheres with a longitudinal fissure, temporal lobes, the
 * cerebellum and the brain stem. Gyri and sulci are carved in with noise.
 * Folds appear in two ways: grooved particles are pushed inwards, and they
 * are dimmed through the w channel.
 *
 * Coordinates: +x = front, +y = up, ±z = right/left hemisphere. The sphere
 * radius is 1; the brain is about 2 units long.
 *
 * This file has no DOM or three.js dependency. The brain stage runs in Web
 * Workers (particles.worker.ts) and falls back to the main thread if needed.
 */

// -----------------------------------------------------------------------------
// Random + noise
// -----------------------------------------------------------------------------

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3 = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
];

/** 3D simplex noise (Gustavson), output roughly in -1..1. */
function createNoise3D(random: () => number) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const F3 = 1 / 3;
  const G3 = 1 / 6;

  return (x: number, y: number, z: number): number => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n = 0;
    let tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tt > 0) {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      tt *= tt;
      n += tt * tt * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tt > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      tt *= tt;
      n += tt * tt * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tt > 0) {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      tt *= tt;
      n += tt * tt * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tt > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      tt *= tt;
      n += tt * tt * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * n;
  };
}

// -----------------------------------------------------------------------------
// Brain implicit surface
// -----------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Approximate ellipsoid distance (Quilez). */
function ellipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number) {
  const ax = px / rx;
  const ay = py / ry;
  const az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx;
  const by = ay / ry;
  const bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

/** Tapered capsule between a and b with radii ra → rb. */
function capsule(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ra: number,
  rb: number,
) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = clamp01((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

const PART_CEREBRUM = 0;
const PART_CEREBELLUM = 1;
const PART_STEM = 2;

/** Filled by brainField() so the caller can tell which anatomy it hit. */
const hit = { part: PART_CEREBRUM, lobeGap: 1 };

function brainField(x: number, y: number, z: number): number {
  const az = Math.abs(z);

  // Cerebral hemisphere: long front-to-back, narrower at the frontal pole, flatter underneath.
  const taper = 1 - 0.09 * x;
  let ly = y - 0.14;
  if (ly < 0) ly *= 1.3;
  // Centred off the midline but wide enough to cross it, so the fissure cut below
  // leaves a flat medial face (hemispheres pressed together, not two eggs touching).
  const main = ellipsoid(x, ly, (az - 0.36) / taper, 1.0, 0.66, 0.47);
  // Temporal lobe hangs below the middle-front. The fold between them becomes the lateral (Sylvian) fissure.
  const temporal = ellipsoid(x - 0.15, y + 0.25, az - 0.5, 0.56, 0.3, 0.3);
  let cerebrum = smin(main, temporal, 0.12);
  // Longitudinal fissure between the hemispheres.
  cerebrum = smax(cerebrum, 0.014 - az, 0.03);
  // Corpus callosum: the floor of the fissure.
  cerebrum = smin(cerebrum, ellipsoid(x + 0.05, y - 0.08, z, 0.62, 0.26, 0.12), 0.02);

  // Cerebellum tucked under the occipital lobe (two lobes meeting at the vermis).
  const cerebellum = ellipsoid(x + 0.62, y + 0.42, az - 0.26, 0.36, 0.24, 0.3);

  // Brain stem with the pons bulge.
  const stem = smin(
    capsule(x, y, z, -0.18, -0.3, 0, -0.26, -0.86, 0, 0.14, 0.095),
    ellipsoid(x + 0.14, y + 0.52, z, 0.17, 0.16, 0.17),
    0.06,
  );

  let d = smin(cerebrum, cerebellum, 0.035);
  d = smin(d, stem, 0.06);

  hit.part =
    cerebrum <= cerebellum && cerebrum <= stem
      ? PART_CEREBRUM
      : cerebellum <= stem
        ? PART_CEREBELLUM
        : PART_STEM;
  hit.lobeGap = Math.abs(main - temporal);
  return d;
}

// -----------------------------------------------------------------------------
// Generation
//
// Two stages so the sphere can be shown straight away:
// 1. generateSphere() — cheap (~10 ms for 200k), runs on the main thread.
//    It also records each particle's direction, which is what pairs it with
//    its brain point.
// 2. generateBrain() — the expensive ray march (~4 µs per particle). It runs
//    on slices of those directions across several workers, and the slices
//    are joined with joinBrain().
// -----------------------------------------------------------------------------

export interface SphereData {
  count: number;
  /** xyz on the sphere. */
  sphere: Float32Array;
  /** xyz = random unit vector (scatter direction); w = uniform random 0..1. */
  seed: Float32Array;
  /** xyz = unit direction on the sphere; w = interior fill (0..1) or -1 for a surface particle. */
  dirs: Float32Array;
}

export interface BrainChunk {
  /** xyzw per particle, not yet centred (see joinBrain). */
  brain: Float32Array;
  /** minX, minY, minZ, maxX, maxY, maxZ of this chunk. */
  bounds: Float32Array;
}

export interface BrainRequest {
  dirs: Float32Array;
  /** Seeds the groove noise; must be the same for every chunk. */
  seed: number;
  /** Seeds this chunk's jitter, so results don't depend on how the work was split. */
  chunk: number;
}

/** How the unit sphere is stretched into the brain's proportions (length, height, width). */
const STRETCH = [1.0, 0.7, 0.8] as const;
/**
 * Rays start inside the hemisphere on their own side (z = ±ORIGIN_Z). A ray then
 * never crosses the longitudinal fissure, so the hidden medial walls get no
 * particles and the fissure reads as a clean gap.
 */
const ORIGIN_X = -0.1;
const ORIGIN_Y = -0.08;
const ORIGIN_Z = 0.07;
const MARCH_START = 1.8;
/** Share of particles that fill the volume rather than the surface. */
const INTERIOR = 0.05;
/** Retries for particles that land in a groove; folds show as gaps where none remain. */
const RETRIES = 5;

const surf = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, t: 0, part: PART_CEREBRUM, lobeGap: 1 };

/** Outermost brain surface along the ray o + r·t (t from MARCH_START down to 0). */
function march(ox: number, oy: number, oz: number, rx: number, ry: number, rz: number): number {
  let t = MARCH_START;
  let prevT = t;
  for (let step = 0; step < 140 && t > 0.01; step++) {
    const f = brainField(ox + rx * t, oy + ry * t, oz + rz * t);
    if (f < 0) {
      let lo = t;
      let hi = prevT;
      for (let b = 0; b < 10; b++) {
        const mid = (lo + hi) * 0.5;
        if (brainField(ox + rx * mid, oy + ry * mid, oz + rz * mid) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) * 0.5;
    }
    prevT = t;
    t -= Math.max(0.004, f * 0.7);
  }
  return 0.3;
}

/** Finds the surface point for a sphere direction and fills `surf`. */
function sampleSurface(dx: number, dy: number, dz: number) {
  let rx = dx * STRETCH[0];
  let ry = dy * STRETCH[1];
  let rz = dz * STRETCH[2];
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const oz = dz >= 0 ? ORIGIN_Z : -ORIGIN_Z;
  const t = march(ORIGIN_X, ORIGIN_Y, oz, rx, ry, rz);
  const px = ORIGIN_X + rx * t;
  const py = ORIGIN_Y + ry * t;
  const pz = oz + rz * t;

  brainField(px, py, pz);
  surf.part = hit.part;
  surf.lobeGap = hit.lobeGap;

  const e = 0.004;
  let nx = brainField(px + e, py, pz) - brainField(px - e, py, pz);
  let ny = brainField(px, py + e, pz) - brainField(px, py - e, pz);
  let nz = brainField(px, py, pz + e) - brainField(px, py, pz - e);
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  surf.x = px;
  surf.y = py;
  surf.z = pz;
  surf.nx = nx;
  surf.ny = ny;
  surf.nz = nz;
  surf.t = t;
}

/** The dust sphere, plus the per-particle directions the brain is built from. */
export function generateSphere(count: number, seed = 7): SphereData {
  const rand = mulberry32(seed);
  const sphere = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const dirs = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    // Uniform direction on the sphere.
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(phi);
    const dy = u;
    const dz = s * Math.sin(phi);
    const interior = rand() < INTERIOR;
    const fill = Math.cbrt(rand());

    // A thin, slightly frayed shell (the Spline look) plus a faint core.
    const shell = 1 + (rand() - 0.5) * 0.035 + Math.pow(rand(), 7) * 0.09;
    const r = interior ? fill * 0.94 : shell;
    sphere[i * 3] = dx * r;
    sphere[i * 3 + 1] = dy * r;
    sphere[i * 3 + 2] = dz * r;

    dirs[i * 4] = dx;
    dirs[i * 4 + 1] = dy;
    dirs[i * 4 + 2] = dz;
    dirs[i * 4 + 3] = interior ? fill : -1;

    // Scatter direction + per-particle random.
    const su = rand() * 2 - 1;
    const sphi = rand() * Math.PI * 2;
    const ss = Math.sqrt(1 - su * su);
    seeds[i * 4] = ss * Math.cos(sphi);
    seeds[i * 4 + 1] = su;
    seeds[i * 4 + 2] = ss * Math.sin(sphi);
    seeds[i * 4 + 3] = rand();
  }
  return { count, sphere, seed: seeds, dirs };
}

/** Brain positions for a slice of sphere directions (the expensive part; runs in a worker). */
export function generateBrain({ dirs, seed, chunk }: BrainRequest): BrainChunk {
  const count = dirs.length / 4;
  const rand = mulberry32(seed * 977 + chunk * 7919 + 1);
  const noise = createNoise3D(mulberry32(seed * 31 + 17));
  const brain = new Float32Array(count * 4);

  /** Groove depth at a surface point (0 = crest, 1 = bottom of a sulcus) for the current part. */
  const grooveAt = (px: number, py: number, pz: number, part: number, lobeGap: number) => {
    if (part === PART_CEREBRUM) {
      // Gyri: the zero set of the noise draws winding grooves across the cortex.
      const q = 3.0;
      const n =
        noise(px * q, py * q, pz * q) +
        0.4 * noise(px * q * 2.1 + 11.7, py * q * 2.1 - 3.1, pz * q * 2.1 + 5.3);
      const sulcus = 1 - smoothstep(0.04, 0.3, Math.abs(n));
      // The lateral fissure where the temporal lobe meets the frontal and parietal lobes.
      const sylvian = px > -0.45 ? 1 - smoothstep(0.01, 0.06, lobeGap) : 0;
      return Math.max(sulcus, sylvian);
    }
    if (part === PART_CEREBELLUM) {
      // Folia: fine, roughly horizontal ridges.
      const v = Math.abs(Math.sin((py - px * 0.35) * 58 + 1.6 * noise(px * 5, py * 5, pz * 5)));
      return 1 - smoothstep(0.05, 0.5, v);
    }
    return 0;
  };

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const dx = dirs[i * 4];
    const dy = dirs[i * 4 + 1];
    const dz = dirs[i * 4 + 2];
    const fill = dirs[i * 4 + 3];
    let px: number;
    let py: number;
    let pz: number;
    let bright: number;

    if (fill >= 0) {
      // Interior particle: somewhere along the ray inside the volume.
      sampleSurface(dx, dy, dz);
      const k = 0.12 + 0.78 * fill;
      const oz = dz >= 0 ? ORIGIN_Z : -ORIGIN_Z;
      px = ORIGIN_X + (surf.x - ORIGIN_X) * k;
      py = ORIGIN_Y + (surf.y - ORIGIN_Y) * k;
      pz = oz + (surf.z - oz) * k;
      bright = 0.2;
    } else {
      // Land on the surface; particles that fall into a groove usually try a nearby spot instead.
      let depth = 0;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        let ax = dx;
        let ay = dy;
        let az = dz;
        if (attempt > 0) {
          const j = 0.05 * attempt;
          ax += (rand() - 0.5) * j;
          ay += (rand() - 0.5) * j;
          az += (rand() - 0.5) * j;
          const l = Math.sqrt(ax * ax + ay * ay + az * az);
          ax /= l;
          ay /= l;
          az /= l;
          // Never jitter across the fissure.
          if (Math.sign(az) !== Math.sign(dz)) az = -az;
        }
        sampleSurface(ax, ay, az);
        depth = grooveAt(surf.x, surf.y, surf.z, surf.part, surf.lobeGap);
        const keep = surf.part === PART_CEREBRUM ? 0.96 : 0.75;
        if (rand() >= depth * keep) break;
      }
      const carve = surf.part === PART_CEREBRUM ? 0.05 : surf.part === PART_CEREBELLUM ? 0.016 : 0;
      // Low-frequency lumps so the lobes aren't perfect ellipsoids.
      const lump =
        surf.part === PART_STEM ? 0 : 0.03 * noise(surf.x * 1.7 + 40, surf.y * 1.7, surf.z * 1.7);
      const push = lump - depth * carve;
      px = surf.x + surf.nx * push;
      py = surf.y + surf.ny * push;
      pz = surf.z + surf.nz * push;
      bright =
        surf.part === PART_STEM ? 0.62 : (surf.part === PART_CEREBELLUM ? 0.92 : 1) - 0.65 * depth;
    }

    brain[i * 4] = px;
    brain[i * 4 + 1] = py;
    brain[i * 4 + 2] = pz;
    brain[i * 4 + 3] = bright;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  return { brain, bounds: new Float32Array([minX, minY, minZ, maxX, maxY, maxZ]) };
}

/** Joins the chunks in order and centres the brain on the origin so both shapes share a pivot. */
export function joinBrain(chunks: BrainChunk[]): Float32Array {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let total = 0;
  for (const c of chunks) {
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], c.bounds[k]);
      b[k + 3] = Math.max(b[k + 3], c.bounds[k + 3]);
    }
    total += c.brain.length;
  }
  const cx = (b[0] + b[3]) / 2;
  const cy = (b[1] + b[4]) / 2;
  const cz = (b[2] + b[5]) / 2;
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    const src = c.brain;
    for (let i = 0; i < src.length; i += 4) {
      out[o++] = src[i] - cx;
      out[o++] = src[i + 1] - cy;
      out[o++] = src[i + 2] - cz;
      out[o++] = src[i + 3];
    }
  }
  return out;
}
