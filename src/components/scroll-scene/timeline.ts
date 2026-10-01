/**
 * Scroll timeline for the 3D helmet.
 *
 * The scene is driven by a list of keyframes positioned at absolute scroll
 * offsets (px). Every frame the engine samples the timeline at the current
 * scroll position and damps towards the result, so the motion is deterministic
 * (jumping to any anchor yields the same pose) and never fights GSAP tweens.
 */

export interface SceneState {
  /** Horizontal position in viewport space (-1 = left edge, 1 = right edge). */
  x: number;
  /** Vertical position in viewport space (-1 = bottom edge, 1 = top edge). */
  y: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Holographic "blueprint" shell intensity. */
  holo: number;
  /** Blueprint contour lines intensity. */
  edges: number;
  /** 0 = nothing materialised, 1 = fully built PBR model. */
  build: number;
  /** 0 = particles hug the surface, 1 = exploded data cloud. */
  disperse: number;
  /** Particle opacity. */
  points: number;
  /** Seams / rim energy glow ("switched on"). */
  ignite: number;
  /** Whole-canvas opacity. */
  opacity: number;
}

export const STATE_KEYS = [
  "x",
  "y",
  "scale",
  "rotX",
  "rotY",
  "rotZ",
  "holo",
  "edges",
  "build",
  "disperse",
  "points",
  "ignite",
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

export const BASE_STATE: SceneState = {
  x: 0,
  y: 0,
  scale: 1,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  holo: 0,
  edges: 0,
  build: 0,
  disperse: 0,
  points: 0,
  ignite: 0,
  opacity: 1,
};

export function layoutFor(width: number): Layout {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

const PLACEMENT: Record<
  Layout,
  Record<"hero" | "story" | "contact", Pick<SceneState, "x" | "y" | "scale">>
> = {
  desktop: {
    hero: { x: 0.42, y: -0.02, scale: 1.5 },
    story: { x: 0.38, y: 0, scale: 1.3 },
    contact: { x: 0.46, y: 0.04, scale: 1.25 },
  },
  tablet: {
    hero: { x: 0, y: 0.3, scale: 1.15 },
    story: { x: 0, y: 0.32, scale: 1.05 },
    contact: { x: 0, y: 0.44, scale: 1 },
  },
  mobile: {
    hero: { x: 0, y: 0.36, scale: 0.95 },
    story: { x: 0, y: 0.36, scale: 0.88 },
    contact: { x: 0, y: 0.4, scale: 0.8 },
  },
};

/** How far into each chapter (0..1) the model settles into that chapter's pose. */
const CHAPTER_SETTLE = [0.6, 0.6, 0.92, 0.6];

export function buildKeyframes(a: Anchors, layout: Layout, reducedMotion: boolean): Keyframe[] {
  const P = PLACEMENT[layout];
  const compact = layout !== "desktop";

  if (reducedMotion) {
    // A single, finished, still pose in the hero that simply fades away.
    const still: SceneState = {
      ...BASE_STATE,
      ...P.hero,
      rotY: -0.45,
      build: 1,
      ignite: 0.7,
      points: 0.45,
      disperse: 0.25,
    };
    return [
      { at: 0, state: still },
      { at: Math.max(1, a.heroEnd * 0.8), state: { ...still, opacity: 0 }, ease: linear },
    ];
  }

  const hero: SceneState = {
    ...BASE_STATE,
    ...P.hero,
    rotX: 0.05,
    rotY: compact ? -0.25 : -0.55,
    holo: compact ? 0.7 : 1,
    edges: compact ? 0.55 : 0.9,
    disperse: 0.04,
    points: compact ? 0.65 : 0.85,
  };
  const storyIn: SceneState = { ...hero, ...P.story, rotY: -0.3, holo: 1, edges: 0.9 };

  // Chapter poses — Discover · Design · Build · Ship
  const discover: SceneState = {
    ...storyIn,
    rotY: 0.55,
    scale: P.story.scale * 1.05,
    holo: 0.32,
    edges: 0.16,
    disperse: 0.85,
    points: 1,
  };
  const design: SceneState = {
    ...storyIn,
    rotY: -1.35,
    rotX: 0,
    holo: 1,
    edges: 1,
    disperse: 0.02,
    points: 0.5,
  };
  const build: SceneState = {
    ...design,
    rotY: -0.35,
    build: 1,
    holo: 0.8,
    edges: 0.8,
    disperse: 0.06,
    points: 0.3,
  };
  const ship: SceneState = {
    ...build,
    rotY: 0,
    rotX: -0.04,
    scale: P.story.scale * 1.08,
    holo: 0,
    edges: 0,
    ignite: 1,
    points: 0.9,
    disperse: 0.35,
  };
  const chapters = [discover, design, build, ship];

  const exit: SceneState = {
    ...ship,
    y: ship.y + 1.9,
    rotY: 0.6,
    scale: ship.scale * 0.9,
    opacity: 0,
  };

  const kfs: Keyframe[] = [{ at: 0, state: hero }];

  if (a.story) {
    const { start, end } = a.story;
    const n = Math.min(a.story.chapters, chapters.length);
    const len = (end - start) / n;
    kfs.push({ at: start, state: storyIn });
    for (let i = 0; i < n; i++) {
      const s = start + i * len;
      kfs.push({ at: s + len * CHAPTER_SETTLE[i], state: chapters[i] });
      kfs.push({ at: s + len, state: chapters[i] });
    }
    kfs.push({ at: end + a.vh * 0.9, state: exit });
  } else {
    kfs.push({ at: a.heroEnd, state: { ...hero, opacity: 0 } });
  }

  if (a.contact) {
    const contact: SceneState = {
      ...ship,
      ...P.contact,
      rotX: 0,
      rotY: compact ? 0 : -0.3,
      ignite: 1,
      points: 0.8,
      disperse: 0.3,
      opacity: 1,
    };
    // Enter from one viewport below so it travels in lock-step with the section.
    const contactIn: SceneState = {
      ...contact,
      y: contact.y - 2,
      rotY: contact.rotY - 1.8,
      opacity: 0,
    };
    const last = kfs[kfs.length - 1];
    if (a.contact.start > last.at) {
      kfs.push({ at: a.contact.start, state: contactIn, ease: linear });
      kfs.push({ at: Math.max(a.contact.end, a.contact.start + 1), state: contact, ease: linear });
      // If the section is taller than the viewport keep tracking it to the very end.
      const overflow = a.maxScroll - a.contact.end;
      if (overflow > 1) {
        kfs.push({
          at: a.maxScroll,
          state: { ...contact, y: contact.y + (overflow / a.vh) * 2 },
          ease: linear,
        });
      }
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
