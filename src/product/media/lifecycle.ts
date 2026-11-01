import type { MediaSessionHandle } from "./types";

// The Toolkit owns a browser-global session. Serialize across component instances,
// including an old room unmounting while another room starts mounting.
let providerQueue: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<void>) {
  const next = providerQueue.then(task, task);
  providerQueue = next.catch(() => {});
  return next;
}

export class MediaLifecycle {
  private controller: AbortController | null = null;
  private handle: MediaSessionHandle | null = null;

  private async dispose() {
    const handle = this.handle;
    this.handle = null;
    if (handle) await handle.destroy();
  }

  start(
    factory: (signal: AbortSignal) => Promise<MediaSessionHandle>,
    ready: (handle: MediaSessionHandle, signal: AbortSignal) => void,
    failed: (error: unknown) => void,
  ) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return enqueue(async () => {
      try {
        await this.dispose();
        if (controller.signal.aborted) return;
        const handle = await factory(controller.signal);
        if (controller.signal.aborted) {
          await handle.destroy();
          return;
        }
        this.handle = handle;
        ready(handle, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) failed(error);
      }
    });
  }

  stop() {
    this.controller?.abort();
    return enqueue(() => this.dispose());
  }
}
