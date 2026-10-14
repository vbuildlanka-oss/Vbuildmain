/**
 * Scroll timeline for the particle scene: dust sphere → brain.
 *
 * Every keyframe sits at an absolute scroll offset in pixels. Each frame the
 * engine samples the timeline at the current scroll position and damps
 * towards the result. Motion is therefore deterministic (jumping to any
 * anchor gives the same shot) and never fights GSAP tweens.
 *
 * Camera model: the particles sit at the origin (sphere radius 1, brain
 * about 2 long). The camera orbits the origin. A lens shift moves the
 * subject left or right without rotating the view, so text can share the
 * frame.
 */

export interface SceneState {
  /** Camera orbit around the subject (radians, 0 = side view of the brain). */
  orbit: number;
  /** Camera elevation (radians, + = above, looking down). */
  pitch: number;
  /** Camera distance to the origin. */
  dist: number;
  /** Lens shift: where the origin lands on screen (-1…1 of the half-frame). */
  shiftX: number;
  shiftY: number;
  /** 0 = sphere, 1 = brain. Particles leave the sphere staggered and flow into place. */
  morph: number;
  /** 0 = on the shape, 1 = burst into a slowly turning cloud. */
  scatter: number;
  /** Neural activity: waves of light and sparks across the brain. */
  pulse: number;
  /** 0 = white dust, 1 = ice → violet brand gradient. */
  tint: number;
  /** Particle size multiplier. */
  size: number;
  /** Whole-canvas opacity. */
  opacity: number;
}

export const STATE_KEYS = [
  "orbit",
  "pitch",
  "dist",
  "shiftX",
  "shiftY",
  "morph",
  "scatter",
  "pulse",
  "tint",
  "size",
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
  dist: 5.4,
  shiftX: 0,
  shiftY: 0,
  morph: 0,
  scatter: 0,
  pulse: 0,
  tint: 0,
  size: 1,
  opacity: 1,
};

export function layoutFor(width: number): Layout {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

type Frame = Pick<SceneState, "dist" | "shiftX" | "shiftY">;
type Shot = "hero" | "close" | "cloud" | "forming" | "brain" | "alive" | "contact";

/**
 * Framing per layout. On desktop the subject sits to the right of the copy.
 * On phones and tablets it becomes a backdrop behind the text, raised above
 * centre and pulled back far enough to fit the narrow frame.
 */
const FRAMING: Record<Layout, Record<Shot, Frame>> = {
  desktop: {
    hero: { dist: 6.0, shiftX: 0.44, shiftY: 0 },
    close: { dist: 3.4, shiftX: 0.34, shiftY: 0 },
    cloud: { dist: 5.0, shiftX: 0.38, shiftY: 0 },
    forming: { dist: 5.4, shiftX: 0.4, shiftY: 0.02 },
    brain: { dist: 5.6, shiftX: 0.42, shiftY: 0 },
    alive: { dist: 5.2, shiftX: 0.42, shiftY: 0 },
    contact: { dist: 5.8, shiftX: 0.46, shiftY: 0 },
  },
  tablet: {
    hero: { dist: 7.0, shiftX: 0, shiftY: 0.22 },
    close: { dist: 4.6, shiftX: 0, shiftY: 0.26 },
    cloud: { dist: 6.6, shiftX: 0, shiftY: 0.24 },
    forming: { dist: 7.2, shiftX: 0, shiftY: 0.26 },
    brain: { dist: 7.0, shiftX: 0, shiftY: 0.26 },
    alive: { dist: 6.6, shiftX: 0, shiftY: 0.26 },
    contact: { dist: 7.4, shiftX: 0, shiftY: 0.34 },
  },
  mobile: {
    hero: { dist: 10.6, shiftX: 0, shiftY: 0.26 },
    close: { dist: 7.2, shiftX: 0, shiftY: 0.3 },
    cloud: { dist: 9.6, shiftX: 0, shiftY: 0.28 },
    forming: { dist: 11.0, shiftX: 0, shiftY: 0.3 },
    brain: { dist: 11.6, shiftX: 0, shiftY: 0.32 },
    alive: { dist: 11.0, shiftX: 0, shiftY: 0.32 },
    contact: { dist: 12.0, shiftX: 0, shiftY: 0.36 },
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

  // Hero: the dust sphere, as in the Spline scene.
  const hero: SceneState = {
    ...BASE_STATE,
    ...F.hero,
    orbit: -0.35,
    pitch: 0.12,
    tint: 0.12,
  };

  if (reducedMotion) {
    // No scroll animation: one still shot of the finished brain that fades with the hero.
    const still: SceneState = {
      ...hero,
      ...F.brain,
      orbit: 0.5,
      pitch: 0.2,
      morph: 1,
      tint: 0.8,
      pulse: 0.4,
    };
    return [
      { at: 0, state: still },
      { at: Math.max(1, a.heroEnd * 0.8), state: { ...still, opacity: 0 }, ease: linear },
    ];
  }

  // Leaving the hero, the camera pushes in until the shell fills the frame.
  const close: SceneState = { ...hero, ...F.close, orbit: -0.1, pitch: 0.05, tint: 0.2 };

  // Listen ("every project starts in pieces"): the sphere bursts into a cloud of signal.
  const cloud: SceneState = {
    ...close,
    ...F.cloud,
    orbit: 0.45,
    pitch: 0.18,
    scatter: 1,
    tint: 0.4,
    size: 0.9,
  };

  // Plan ("lay it all out"): the cloud settles and the brain begins to take shape, seen from above.
  const forming: SceneState = {
    ...cloud,
    ...F.forming,
    orbit: 0.95,
    pitch: 0.62,
    scatter: 0.18,
    morph: 0.55,
    tint: 0.55,
    size: 0.95,
  };

  // Build ("put it together, properly"): fully formed, swinging to a three-quarter view.
  const brain: SceneState = {
    ...forming,
    ...F.brain,
    orbit: 0.3,
    pitch: 0.16,
    scatter: 0,
    morph: 1,
    tint: 0.75,
    size: 1,
  };

  // Launch ("comes to life"): it lights up with activity.
  const alive: SceneState = {
    ...brain,
    ...F.alive,
    orbit: -0.22,
    pitch: 0.1,
    pulse: 1,
    tint: 1,
    size: 1.1,
  };

  const chapters: Beat[][] = [
    [{ at: 0.62, state: cloud }],
    [{ at: 0.7, state: forming }],
    [{ at: 0.75, state: brain }],
    [{ at: 0.55, state: alive, ease: easeOut }],
  ];

  // After the story the camera cranes up and back while the scene fades.
  const exit: SceneState = {
    ...alive,
    pitch: 0.55,
    dist: alive.dist + 1.6,
    opacity: 0,
  };

  const kfs: Keyframe[] = [{ at: 0, state: hero }];

  if (a.story) {
    const { start, end } = a.story;
    const n = Math.min(a.story.chapters, chapters.length);
    const len = (end - start) / n;
    kfs.push({ at: start, state: close });
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
      ...alive,
      ...F.contact,
      orbit: compact ? 0.2 : 0.35,
      pitch: 0.16,
      pulse: 0.85,
      opacity: 1,
    };
    // Sweep in from the side as the section arrives.
    const contactIn: SceneState = {
      ...contact,
      orbit: contact.orbit - 1.4,
      dist: contact.dist + 3,
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
