export interface HomeOceanHandle { dispose(): void }

export function mountLazyHomeOcean(container: HTMLElement): HomeOceanHandle {
  const browserWindow = window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let disposed = false;
  let scene: HomeOceanHandle | null = null;
  let observer: IntersectionObserver | null = null;
  let idleId: number | null = null;

  const load = async (): Promise<void> => {
    if (disposed || scene) return;
    container.dataset.sceneState = "loading";
    try {
      const { mountHomeOceanScene } = await import("./home-ocean-scene");
      if (disposed) return;
      scene = mountHomeOceanScene(container);
    } catch {
      container.dataset.sceneState = "fallback";
    }
  };

  if (typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); observer = null; void load(); }
    }, { rootMargin: "180px" });
    observer.observe(container);
  } else if (browserWindow.requestIdleCallback) {
    idleId = browserWindow.requestIdleCallback(() => void load(), { timeout: 800 });
  } else {
    globalThis.setTimeout(() => void load(), 0);
  }

  return {
    dispose(): void {
      disposed = true;
      observer?.disconnect();
      if (idleId !== null) browserWindow.cancelIdleCallback?.(idleId);
      scene?.dispose();
    },
  };
}
