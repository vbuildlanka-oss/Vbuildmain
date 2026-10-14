import type { ParticleData } from "./particles";

/**
 * Builds the sphere/brain particle targets off the main thread, which takes
 * around half a second for the largest tier. If workers aren't available,
 * it falls back to the main thread.
 */
export function loadParticles(
  count: number,
  seed = 7,
  signal?: AbortSignal,
): Promise<ParticleData> {
  const fallback = () => import("./particles").then((m) => m.generateParticles(count, seed));

  return new Promise<ParticleData>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./particles.worker.ts", import.meta.url), { type: "module" });
    } catch {
      fallback().then(resolve, reject);
      return;
    }
    const done = () => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      done();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (e: MessageEvent<ParticleData>) => {
      done();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      done();
      fallback().then(resolve, reject);
    };
    worker.postMessage({ count, seed });
  });
}
