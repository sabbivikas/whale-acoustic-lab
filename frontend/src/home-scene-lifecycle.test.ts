import assert from "node:assert/strict";
import test from "node:test";
import { canUseWebGL, cappedDevicePixelRatio, SceneAnimationLoop, type FrameScheduler } from "./home-scene-lifecycle";

function scheduler(): FrameScheduler & { callbacks: Map<number, FrameRequestCallback>; cancelled: number[] } {
  let next = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  return {
    callbacks,
    cancelled,
    request(callback) { next += 1; callbacks.set(next, callback); return next; },
    cancel(frameId) { callbacks.delete(frameId); cancelled.push(frameId); },
  };
}

test("caps pixel ratio more aggressively on compact screens", () => {
  assert.equal(cappedDevicePixelRatio(3, false), 1.75);
  assert.equal(cappedDevicePixelRatio(3, true), 1.25);
  assert.equal(cappedDevicePixelRatio(Number.NaN, false), 1);
});

test("WebGL support helper returns false for missing or throwing contexts", () => {
  const unavailable = { getContext: () => null } as unknown as HTMLCanvasElement;
  assert.equal(canUseWebGL(() => unavailable), false);
  assert.equal(canUseWebGL(() => { throw new Error("unavailable"); }), false);
  const available = { getContext: (kind: string) => kind === "webgl2" ? {} : null } as unknown as HTMLCanvasElement;
  assert.equal(canUseWebGL(() => available), true);
});

test("reduced motion renders statically without scheduling animation", () => {
  const frames: number[] = [];
  const schedule = scheduler();
  const loop = new SceneAnimationLoop({ scheduler: schedule, renderFrame: (time) => frames.push(time), reducedMotion: true });
  loop.renderStatic(12);
  loop.start();
  assert.deepEqual(frames, [12]);
  assert.equal(schedule.callbacks.size, 0);
});

test("hidden tabs pause and visible tabs resume the animation loop", () => {
  const schedule = scheduler();
  const loop = new SceneAnimationLoop({ scheduler: schedule, renderFrame: () => undefined });
  loop.start();
  assert.equal(loop.isRunning(), true);
  loop.setDocumentHidden(true);
  assert.equal(loop.isRunning(), false);
  assert.equal(schedule.cancelled.length, 1);
  loop.setDocumentHidden(false);
  assert.equal(loop.isRunning(), true);
});

test("cleanup cancels the frame and permanently prevents restart", () => {
  const schedule = scheduler();
  const loop = new SceneAnimationLoop({ scheduler: schedule, renderFrame: () => undefined });
  loop.start();
  loop.dispose();
  loop.start();
  assert.equal(loop.isDisposed(), true);
  assert.equal(loop.isRunning(), false);
  assert.equal(schedule.callbacks.size, 0);
  assert.equal(schedule.cancelled.length, 1);
});
