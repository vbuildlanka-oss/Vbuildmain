import { generateBrain, type BrainRequest } from "./particles";

// The project compiles against the DOM lib, so give the worker scope its minimal shape here.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BrainRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const chunk = generateBrain(e.data);
  ctx.postMessage(chunk, [chunk.brain.buffer, chunk.bounds.buffer]);
};
