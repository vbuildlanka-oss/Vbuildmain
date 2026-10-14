import { generateParticles, type ParticleRequest } from "./particles";

// The project compiles against the DOM lib, so give the worker scope its minimal shape here.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ParticleRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const data = generateParticles(e.data.count, e.data.seed);
  ctx.postMessage(data, [data.sphere.buffer, data.brain.buffer, data.seed.buffer]);
};
