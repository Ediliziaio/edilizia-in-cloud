/** Si interroga soltanto un'impronta tecnica; i dati si rileggono quando cambia. */
export function createFinancialLiveRefresh(options: {
  busy: () => boolean;
  active: () => boolean;
  fingerprint: () => Promise<string>;
  refresh: () => Promise<unknown>;
  visible: () => boolean;
  online: () => boolean;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  let pending = false;
  let previous: string | undefined;
  let failures = 0;

  const request = () => {
    if (disposed) return;
    pending = true;
    if (timer || running || !options.active() || !options.visible() || !options.online()) return;
    timer = setTimeout(run, 300 * 2 ** failures);
  };
  const run = async () => {
    timer = undefined;
    if (disposed || !options.active() || !options.visible() || !options.online()) return;
    if (options.busy()) { request(); return; }
    running = true;
    pending = false;
    try {
      const current = await options.fingerprint();
      if (disposed) return;
      if (options.busy() || !options.visible() || !options.online()) { pending = true; return; }
      if (current !== previous) await options.refresh();
      if (!disposed) previous = current;
      failures = 0;
    } catch {
      // Si riprova al heartbeat/ritorno oppure al prossimo evento, senza
      // salvare una revisione che non è stata effettivamente riletta.
      failures = Math.min(4, failures + 1);
    } finally {
      running = false;
      if (pending) request();
    }
  };
  return {
    request,
    dispose() { disposed = true; if (timer) clearTimeout(timer); },
  };
}
