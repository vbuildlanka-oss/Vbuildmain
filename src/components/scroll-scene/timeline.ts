/**
 * Scroll timeline for NEXBOT.
 *
 * The scene is a single continuous camera move. Every keyframe sits at an
 * absolute scroll offset (px); each frame the engine samples the timeline at
 * the current scroll position and damps towards it, so motion is
 * deterministic (jumping to any anchor gives the same shot) and never fights
 * GSAP tweens.
 *
 * Camera model: the robot stands at the origin (feet at y ≈ -1.1, visor at
 * y ≈ 0.93). The camera orbits a point on its centre line and uses a lens
 * shift to push the subject left/right without rotating the view, so text can
 * share the frame.
 */

export interface SceneState {
  /** Camera orbit around the robot (radians, 0 = straight on). */
  orbit: number;
  /** Camera elevation (radians, + = above the aim point looking down). */
  pitch: number;
  /** Camera distance to the aim point (scene units; the robot is 2.2 tall). */
  dist: number;
  /** Height of the aim point on the robot's centre line. */
  lookY: number;
  /** Lens shift: where the aim point lands on screen (-1…1 of the half-frame). */
  shiftX: number;
  shiftY: number;
  /** 0 = every part detached (hologram), 1 = fully assembled. Builds feet → head. */
  assemble: number;
  /** Detached parts burst outwards into a cloud the camera flies through. */
  explode: number;
  /** Detached parts line up as an ordered exploded-view blueprint. */
  blueprint: number;
  /** Holographic shell on detached parts. */
  holo: number;
  /** Contour lines on detached parts. */
  edges: number;
  /** Surface particle opacity. */
  points: number;
  /** 0 = particles hug the surface, 1 = dispersed data cloud. */
  disperse: number;
  /** Visor eyes + joint energy ("switched on"). */
  power: number;
  /** Raised-arm wave gesture. */
  wave: number;
  /** How strongly the head tracks the cursor. */
  look: number;
  /** Holographic floor ring under the feet. */
  ring: number;
  /** Blueprint grid on the floor. */
  grid: number;
  /** Giant wordmark standing behind the robot. */
  title: number;
  /** Backlight halo + light shafts behind the robot. */
  halo: number;
  /** Bloom intensity multiplier. */
  glow: number;
  /** Whole-canvas opacity. */
  opacity: number;
}

export const STATE_KEYS = [
  "orbit",
  "pitch",
  "dist",
  "lookY",
  "shiftX",
  "shiftY",
  "assemble",
  "explode",
  "blueprint",
  "holo",
  "edges",
  "points",
  "disperse",
  "power",
  "wave",
  "look",
  "ring",
  "grid",
  "title",
  "halo",
  "glow",
  "opacity",
] as const satisfies readonly (keyof SceneState)[];

export type Ease = (t: number) => number;

export interface Keyframe {
  at: number;
  state: SceneState;
  /** Easing applied to the segment that ends at this keyframe. */
  ease?: Ease;
}

export interface Anchors {
  vh: number;
  maxScroll: number;
  heroEnd: number;
  /** Pinned story section range. Absent when the story isn't pinned. */
  story?: { start: number; end: number; chapters: number };
  /** Contact section: top edge enters viewport → top edge reaches viewport top. */
  contact?: { start: number; end: number };
}

export type Layout = "mobile" | "tablet" | "desktop";

export const linear: Ease = (t) => t;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut: Ease = (t) => 1 - Math.pow(1 - t, 3);

export const BASE_STATE: SceneState = {
  orbit: 0,
  pitch: 0,
  dist: 5.6,
  lookY: 0,
  shiftX: 0,
  shiftY: 0,
  assemble: 1,
  explode: 0,
  blueprint: 0,
  holo: 0,
  edges: 0,
  points: 0,
  disperse: 0,
  power: 0,
  wave: 0,
  look: 0,
  ring: 0,
  grid: 0,
  title: 0,
  halo: 0.6,
  glow: 1,
  opacity: 1,
};

export function layoutFor(width: number): Layout {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

type Frame = Pick<SceneState, "dist" | "shiftX" | "shiftY">;

/**
 * Framing per layout. On desktop the robot sits right of the copy; on phones
 * and tablets it becomes a full-height backdrop behind the text.
 */
const FRAMING: Record<
  Layout,
  Record<"hero" | "visor" | "cloud" | "plan" | "legs" | "torso" | "launch" | "contact", Frame>
> = {
  desktop: {
    hero: { dist: 5.7, shiftX: 0.44, shiftY: 0 },
    visor: { dist: 1.05, shiftX: 0.3, shiftY: 0 },
    cloud: { dist: 4.4, shiftX: 0.36, shiftY: 0 },
    plan: { dist: 6.6, shiftX: 0.4, shiftY: 0.02 },
    legs: { dist: 2.9, shiftX: 0.38, shiftY: 0 },
    torso: { dist: 3.7, shiftX: 0.4, shiftY: 0 },
    launch: { dist: 5.1, shiftX: 0.42, shiftY: 0 },
    contact: { dist: 5.4, shiftX: 0.46, shiftY: 0 },
  },
  tablet: {
    hero: { dist: 5.9, shiftX: 0, shiftY: 0.2 },
    visor: { dist: 1.25, shiftX: 0, shiftY: 0.3 },
    cloud: { dist: 5.0, shiftX: 0, shiftY: 0.22 },
    plan: { dist: 7.0, shiftX: 0, shiftY: 0.24 },
    legs: { dist: 3.3, shiftX: 0, shiftY: 0.24 },
    torso: { dist: 4.6, shiftX: 0, shiftY: 0.24 },
    launch: { dist: 6.0, shiftX: 0, shiftY: 0.22 },
    contact: { dist: 6.6, shiftX: 0, shiftY: 0.34 },
  },
  mobile: {
    hero: { dist: 6.1, shiftX: 0, shiftY: 0.2 },
    visor: { dist: 1.35, shiftX: 0, shiftY: 0.32 },
    cloud: { dist: 5.2, shiftX: 0, shiftY: 0.24 },
    plan: { dist: 7.4, shiftX: 0, shiftY: 0.28 },
    legs: { dist: 3.4, shiftX: 0, shiftY: 0.26 },
    torso: { dist: 4.9, shiftX: 0, shiftY: 0.26 },
    launch: { dist: 6.3, shiftX: 0, shiftY: 0.24 },
    contact: { dist: 7.6, shiftX: 0, shiftY: 0.3 },
  },
};

/**
 * Story beats (fractions of each pinned chapter). Every chapter can hold more
 * than one shot; the last shot is held until the chapter ends.
 */
type Beat = { at: number; state: SceneState; ease?: Ease };

export function buildKeyframes(a: Anchors, layout: Layout, reducedMotion: boolean): Keyframe[] {
  const F = FRAMING[layout];
  const compact = layout !== "desktop";

  const hero: SceneState = {
    ...BASE_STATE,
    ...F.hero,
    orbit: compact ? -0.22 : -0.42,
    pitch: -0.05,
    lookY: 0.05,
    power: 0.55,
    look: 1,
    ring: 0.7,
    title: 1,
    halo: 0.9,
    points: 0.22,
    disperse: 0.05,
  };

  if (reducedMotion) {
    // One finished, still shot in the hero that simply fades away.
    const still: SceneState = { ...hero, look: 0, power: 0.8 };
    return [
      { at: 0, state: still },
      { at: Math.max(1, a.heroEnd * 0.8), state: { ...still, opacity: 0 }, ease: linear },
    ];
  }

  // Scrolling out of the hero pushes the camera right up to the visor.
  const visor: SceneState = {
    ...hero,
    ...F.visor,
    orbit: -0.1,
    pitch: 0.02,
    lookY: 0.93,
    power: 0.75,
    look: 0.25,
    title: 0,
    ring: 0.3,
    halo: 0.55,
    points: 0.12,
  };

  // Listen — the robot bursts apart around the camera, which pulls back through the cloud.
  const cloud: SceneState = {
    ...visor,
    ...F.cloud,
    orbit: 0.55,
    pitch: 0.12,
    lookY: 0.2,
    assemble: 0,
    explode: 1,
    holo: 0.95,
    edges: 0.3,
    points: 1,
    disperse: 0.85,
    power: 0,
    look: 0,
    ring: 0.12,
    halo: 0.4,
    glow: 1.25,
  };

  // Plan — high three-quarter view over an ordered exploded blueprint.
  const plan: SceneState = {
    ...cloud,
    ...F.plan,
    orbit: -0.95,
    pitch: 0.42,
    lookY: 0.3,
    explode: 0,
    blueprint: 1,
    holo: 1,
    edges: 1,
    points: 0.3,
    disperse: 0.03,
    ring: 0.45,
    grid: 1,
    halo: 0.5,
  };

  // Build — a low crane shot that rises with the assembly line, feet → head.
  const legs: SceneState = {
    ...plan,
    ...F.legs,
    orbit: -0.4,
    pitch: -0.1,
    lookY: -0.45,
    assemble: 0.42,
    blueprint: 0.55,
    holo: 0.85,
    edges: 0.85,
    grid: 0.7,
    ring: 0.7,
  };
  const torso: SceneState = {
    ...legs,
    ...F.torso,
    orbit: -0.18,
    pitch: 0,
    lookY: 0.5,
    assemble: 1,
    blueprint: 0,
    holo: 0.6,
    edges: 0.6,
    grid: 0.25,
    points: 0.2,
  };

  // Launch — pull back to a low hero angle as it switches on.
  const launch: SceneState = {
    ...torso,
    ...F.launch,
    orbit: 0.14,
    pitch: -0.15,
    lookY: 0.12,
    holo: 0,
    edges: 0,
    grid: 0,
    power: 1,
    look: 0.75,
    points: 0.7,
    disperse: 0.28,
    ring: 1,
    halo: 1.25,
    glow: 1.55,
  };

  const chapters: Beat[][] = [
    [{ at: 0.62, state: cloud }],
    [{ at: 0.6, state: plan }],
    [
      { at: 0.45, state: legs },
      { at: 0.92, state: torso },
    ],
    [{ at: 0.55, state: launch, ease: easeOut }],
  ];

  // After the story the camera cranes up over the head and the scene fades.
  const exit: SceneState = {
    ...launch,
    pitch: 0.55,
    lookY: 1.4,
    dist: launch.dist + 1.6,
    opacity: 0,
    ring: 0,
    halo: 0.6,
  };

  const kfs: Keyframe[] = [{ at: 0, state: hero }];

  if (a.story) {
    const { start, end } = a.story;
    const n = Math.min(a.story.chapters, chapters.length);
    const len = (end - start) / n;
    kfs.push({ at: start, state: visor });
    for (let i = 0; i < n; i++) {
      const s = start + i * len;
      const beats = chapters[i];
      for (const b of beats) kfs.push({ at: s + len * b.at, state: b.state, ease: b.ease });
      kfs.push({ at: s + len, state: beats[beats.length - 1].state });
    }
    kfs.push({ at: end + a.vh * 0.9, state: exit });
  } else {
    kfs.push({ at: a.heroEnd, state: { ...hero, opacity: 0 } });
  }

  if (a.contact) {
    const contact: SceneState = {
      ...launch,
      ...F.contact,
      orbit: compact ? -0.12 : -0.38,
      pitch: -0.05,
      lookY: 0.2,
      wave: 1,
      look: 1,
      points: 0.55,
      disperse: 0.2,
      ring: 0.9,
      halo: 1,
      glow: 1.2,
      opacity: 1,
    };
    // Sweep in from the side as the section arrives.
    const contactIn: SceneState = {
      ...contact,
      orbit: contact.orbit - 1.5,
      dist: contact.dist + 3,
      wave: 0,
      opacity: 0,
    };
    const last = kfs[kfs.length - 1];
    // Start once the section is well into view so the shot never plays over the FAQ.
    const enter = a.contact.start + (a.contact.end - a.contact.start) * 0.4;
    if (enter > last.at) {
      kfs.push({ at: enter, state: contactIn, ease: linear });
      kfs.push({ at: Math.max(a.contact.end, enter + 1), state: contact, ease: easeOut });
      if (a.maxScroll - a.contact.end > 1)
        kfs.push({ at: a.maxScroll, state: contact, ease: linear });
    }
  }

  // Guarantee strictly increasing offsets.
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].at <= kfs[i - 1].at) kfs[i].at = kfs[i - 1].at + 0.001;
  }
  return kfs;
}

export function sampleKeyframes(kfs: Keyframe[], t: number, out: SceneState): SceneState {
  if (kfs.length === 0) return out;
  if (t <= kfs[0].at) return Object.assign(out, kfs[0].state);
  for (let i = 1; i < kfs.length; i++) {
    const b = kfs[i];
    if (t <= b.at) {
      const a = kfs[i - 1];
      const p = (t - a.at) / (b.at - a.at);
      const e = (b.ease ?? easeInOut)(Math.min(1, Math.max(0, p)));
      for (const k of STATE_KEYS) out[k] = a.state[k] + (b.state[k] - a.state[k]) * e;
      return out;
    }
  }
  return Object.assign(out, kfs[kfs.length - 1].state);
}
