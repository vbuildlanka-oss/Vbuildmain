import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import modelUrl from "@/assets/models/scifi-helmet.glb?url";
import { buildKeyframes, layoutFor, type Anchors, type SceneState } from "./timeline";
import type { HelmetEngine } from "./engine";

/** Pinned story ScrollTrigger id — must match the one created on the page. */
export const STORY_TRIGGER_ID = "story";

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

/** Writes live scene values into any `[data-hud="<stateKey>"]` element. */
function createHudWriter() {
  let nodes: HTMLElement[] = [];
  let frame = 0;
  const cache = new Map<HTMLElement, string>();
  return {
    refresh() {
      nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-hud]"));
    },
    write(s: Readonly<SceneState>) {
      if (++frame % 3 !== 0 || nodes.length === 0) return;
      for (const n of nodes) {
        const key = n.dataset.hud as keyof SceneState;
        const v = Math.round(Math.min(1, Math.max(0, s[key] ?? 0)) * 100);
        const text = String(v).padStart(3, "0");
        if (cache.get(n) !== text) {
          n.textContent = text;
          (n.closest<HTMLElement>("[data-hud-row]") ?? n).style.setProperty(
            "--hud",
            String(v / 100),
          );
          cache.set(n, text);
        }
      }
    },
  };
}

/**
 * Fixed, full-viewport WebGL layer behind the page content. Three.js and the
 * model are fetched only after the page has loaded and the main thread is idle,
 * so the 3D never competes with first paint.
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
    const lowPower =
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth < 768 ||
      (navigator.hardwareConcurrency ?? 8) <= 4;

    let engine: HelmetEngine | undefined;
    let disposed = false;
    const hud = createHudWriter();

    const applyTimeline = () => {
      if (!engine) return;
      hud.refresh();
      engine.setKeyframes(
        buildKeyframes(readAnchors(), layoutFor(window.innerWidth), reducedMotion),
      );
    };

    const boot = async () => {
      try {
        const [{ HelmetEngine }, buffer] = await Promise.all([
          import("./engine"),
          fetch(modelUrl).then((r) => {
            if (!r.ok) throw new Error(`Model request failed: ${r.status}`);
            return r.arrayBuffer();
          }),
        ]);
        if (disposed) return;
        engine = new HelmetEngine(container, {
          reducedMotion,
          lowPower,
          onFrame: hud.write,
          onContextLost: () => {
            engine?.dispose();
            setFailed(true);
          },
        });
        await engine.load(buffer);
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
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh"
    />
  );
}
