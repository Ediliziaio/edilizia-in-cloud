/** Coda comune CRM: eventi ravvicinati accorpati, niente refetch sovrapposti,
 * pausa in background/offline e riconciliazione anche se Realtime perde eventi.
 * Non riattiva globalmente refetchOnWindowFocus per tutte le query dell'app. */
export function createLiveRefresh(options: {
  busy: () => boolean;
  refresh: (reconcile: boolean) => Promise<unknown>;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  let lastRefresh = -Infinity;
  let delay = 15_000;
  let reconcile = false;

  const request = (full = false) => {
    if (disposed) return;
    reconcile ||= full;
    if (timer || document.hidden || !navigator.onLine) return;
    timer = setTimeout(run, Math.max(1000, delay - (Date.now() - lastRefresh)));
  };
  const run = () => {
    timer = undefined;
    if (disposed || document.hidden || !navigator.onLine) return;
    if (running || options.busy() || Date.now() - lastRefresh < delay) { request(); return; }
    running = true;
    const start = Date.now();
    const full = reconcile;
    reconcile = false;
    lastRefresh = start;
    void options.refresh(full).catch(() => {
      // Gli errori di lettura sono già gestiti dal QueryClient. Il prossimo
      // ritorno/heartbeat riprova senza produrre rejection non gestite.
    }).finally(() => {
      running = false;
      lastRefresh = Date.now();
      delay = Math.min(120_000, Math.max(15_000, (lastRefresh - start) * 5));
    });
  };
  const resume = () => { request(true); };
  // Realtime non è una consegna garantita; questo recupera anche eventi persi,
  // record fuori dalla pagina caricata e tabelle non pubblicate in Realtime.
  const heartbeat = setInterval(resume, 120_000);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);

  return {
    request,
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    },
  };
}
