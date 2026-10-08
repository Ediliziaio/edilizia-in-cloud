/** One write in flight, one latest snapshot pending. Slow DBs cannot build an unbounded queue. */
export function createLatestStreamWriter(write: (text: string) => Promise<void>, onError: (error: unknown) => void) {
  let pending: string | undefined;
  let running: Promise<void> | null = null;
  const start = () => {
    if (running) return;
    running = Promise.resolve().then(async () => {
      while (pending !== undefined) {
        const text = pending;
        pending = undefined;
        try { await write(text); } catch (error) { onError(error); }
      }
    }).finally(() => {
      running = null;
      if (pending !== undefined) start();
    });
  };
  return {
    push(text: string) { pending = text; start(); },
    async flush() { while (running) await running; },
  };
}
