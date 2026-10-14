import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { loadParticles } from "./loadParticles";
import { buildKeyframes, layoutFor, type Anchors } from "./timeline";
import type { ParticleEngine, Quality } from "./engine";

/** Pinned story ScrollTrigger id — must match the one created on the page. */
export const STORY_TRIGGER_ID = "story";

/** Particles per device tier (see Quality in engine.ts). */
const PARTICLE_COUNT: Record<Quality, number> = { 0: 50_000, 1: 100_000, 2: 200_000 };

function supportsWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function whenIdle(cb: () => void): () => void {
  let cancelled = false;
  let idleId: number | undefined;
  const hasIdle = typeof window.requestIdleCallback === "function";
  const run = () => {
    if (cancelled) return;
    idleId = hasIdle
      ? window.requestIdleCallback(cb, { timeout: 1200 })
      : (window as Window).setTimeout(cb, 150);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
    if (idleId === undefined) return;
    if (hasIdle) window.cancelIdleCallback(idleId);
    else (window as Window).clearTimeout(idleId);
  };
}

function absoluteTop(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY;
}

function readAnchors(): Anchors {
  const vh = window.innerHeight;
  const maxScroll = ScrollTrigger.maxScroll(window);
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const anchors: Anchors = { vh, maxScroll, heroEnd: hero ? hero.offsetHeight : vh };

  const story = ScrollTrigger.getById(STORY_TRIGGER_ID);
  if (story) {
    const chapters = document.querySelectorAll("[data-chapter]").length || 4;
    anchors.story = { start: story.start, end: story.end, chapters };
  }
  const contact = document.getElementById("contact");
  if (contact) {
    const top = absoluteTop(contact);
    anchors.contact = { start: Math.max(0, top - vh), end: Math.min(top, maxScroll) };
  }
  return anchors;
}

/**
 * Fixed, full-viewport WebGL layer behind the page content: a particle
 * sphere that becomes a brain as the story scrolls. three.js and the
 * particle generation (in a worker) start only once the page has loaded and
 * the main thread is idle, so the 3D never competes with first paint.
 */
export function ScrollScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || !supportsWebGL2()) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cores = navigator.hardwareConcurrency ?? 8;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const quality: Quality = cores <= 4 ? 0 : coarse || window.innerWidth < 1024 ? 1 : 2;

    let engine: ParticleEngine | undefined;
    let disposed = false;
    const abort = new AbortController();

    const applyTimeline = () => {
      if (!engine) return;
      engine.setKeyframes(
        buildKeyframes(readAnchors(), layoutFor(window.innerWidth), reducedMotion),
      );
    };

    const boot = async () => {
      try {
        const [{ ParticleEngine }, data] = await Promise.all([
          import("./engine"),
          loadParticles(PARTICLE_COUNT[quality], 7, abort.signal),
        ]);
        if (disposed) return;
        engine = new ParticleEngine(container, {
          reducedMotion,
          quality,
          onContextLost: () => {
            engine?.dispose();
            setFailed(true);
          },
        });
        await engine.load(data);
        if (disposed) return;
        applyTimeline();
        ScrollTrigger.addEventListener("refresh", applyTimeline);
        engine.start();
      } catch (err) {
        if (!disposed) {
          console.warn("[ScrollScene] 3D scene disabled:", err);
          setFailed(true);
          engine?.dispose();
        }
      }
    };

    const cancelIdle = whenIdle(() => void boot());
    return () => {
      disposed = true;
      abort.abort();
      cancelIdle();
      ScrollTrigger.removeEventListener("refresh", applyTimeline);
      engine?.dispose();
    };
  }, []);

  if (failed) return null;
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh opacity-0"
    >
      {/* Lens vignette: fades into the page background so the frame has no hard edge */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,var(--background)_100%)]" />
    </div>
  );
}
