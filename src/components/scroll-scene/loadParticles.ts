import { generateBrain, joinBrain, type BrainChunk } from "./particles";

/**
 * Builds the brain targets for the given sphere directions, split across
 * several workers so it finishes in a fraction of the single-thread time.
 * Falls back to the main thread if workers aren't available.
 */
export function loadBrain(
  dirs: Float32Array,
  seed = 7,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const count = dirs.length / 4;
  // Leave a core for the main thread; ~25k particles per worker is plenty to amortise start-up.
  const cores = navigator.hardwareConcurrency || 4;
  const n = Math.max(1, Math.min(cores - 1, 6, Math.ceil(count / 25_000)));
  const per = Math.ceil(count / n);
  const workers: Worker[] = [];
  const stop = () => workers.forEach((w) => w.terminate());

  const runChunk = (chunk: number): Promise<BrainChunk> => {
    const slice = dirs.slice(chunk * per * 4, Math.min(count, (chunk + 1) * per) * 4);
    const request = { dirs: slice, seed, chunk };
    const onMain = () => Promise.resolve().then(() => generateBrain(request));
    let worker: Worker;
    try {
      worker = new Worker(new URL("./particles.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return onMain();
    }
    workers.push(worker);
    return new Promise<BrainChunk>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<BrainChunk>) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        onMain().then(resolve, reject);
      };
      worker.postMessage(request, [request.dirs.buffer]);
    });
  };

  return new Promise<Float32Array>((resolve, reject) => {
    const onAbort = () => {
      stop();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.all(Array.from({ length: n }, (_, i) => runChunk(i)))
      .then((chunks) => resolve(joinBrain(chunks)), reject)
      .finally(() => signal?.removeEventListener("abort", onAbort));
  });
}
