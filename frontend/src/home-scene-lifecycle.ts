export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(frameId: number): void;
}

export interface SceneLoopOptions {
  scheduler: FrameScheduler;
  renderFrame: (time: number) => void;
  reducedMotion?: boolean;
  documentHidden?: boolean;
}

export function cappedDevicePixelRatio(devicePixelRatio: number, compact: boolean): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, compact ? 1.25 : 1.75);
}

export function canUseWebGL(createCanvas: () => HTMLCanvasElement): boolean {
  try {
    const canvas = createCanvas();
    return Boolean(canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) || canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true }));
  } catch {
    return false;
  }
}

export class SceneAnimationLoop {
  private frameId: number | null = null;
  private disposed = false;
  private reducedMotion: boolean;
  private documentHidden: boolean;

  constructor(private readonly options: SceneLoopOptions) {
    this.reducedMotion = options.reducedMotion ?? false;
    this.documentHidden = options.documentHidden ?? false;
  }

  start(): void {
    if (this.disposed || this.reducedMotion || this.documentHidden || this.frameId !== null) return;
    this.frameId = this.options.scheduler.request(this.frame);
  }

  setDocumentHidden(hidden: boolean): void {
    this.documentHidden = hidden;
    this.synchronize();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.synchronize();
  }

  renderStatic(time = 0): void {
    if (!this.disposed) this.options.renderFrame(time);
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  isRunning(): boolean { return this.frameId !== null; }
  isDisposed(): boolean { return this.disposed; }

  private readonly frame = (time: number): void => {
    this.frameId = null;
    if (this.disposed || this.reducedMotion || this.documentHidden) return;
    this.options.renderFrame(time);
    this.frameId = this.options.scheduler.request(this.frame);
  };

  private synchronize(): void {
    if (this.disposed || this.reducedMotion || this.documentHidden) this.cancel();
    else this.start();
  }

  private cancel(): void {
    if (this.frameId === null) return;
    this.options.scheduler.cancel(this.frameId);
    this.frameId = null;
  }
}
