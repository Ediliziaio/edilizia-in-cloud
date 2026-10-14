/** Batches events and recovers missed ones only on the visible, online workspace.
 * No overlapping refresh, no background polling; all listeners/timers are released. */
export function createCommessaRefresh(refresh: () => Promise<unknown>) {
  let disposed = false, running = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -Infinity, failures = 0;
  const available = () => !document.hidden && navigator.onLine;
  const request = () => {
    if (disposed) return;
    pending = true;
    if (running || timer || !available()) return;
    timer = setTimeout(run, Math.max(350, Math.min(30_000, 2_000 * 2 ** failures) - (Date.now() - last)));
  };
  const run = () => {
    timer = undefined;
    if (disposed || running || !available()) return;
    running = true; pending = false;
    void Promise.resolve().then(refresh).then(() => { failures = 0; }).catch(() => {
      failures = Math.min(failures + 1, 4);
    }).finally(() => {
      running = false; last = Date.now();
      if (pending) request();
    });
  };
  const resume = () => { if (available()) request(); };
  // Only active read models refetch. Needed because operational tables are not
  // all published; two minutes is a recovery bound, not a promise of instant delivery.
  const heartbeat = setInterval(resume, 120_000);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);
  return {
    request,
    dispose: () => {
      disposed = true; pending = false;
      if (timer) clearTimeout(timer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    },
  };
}
