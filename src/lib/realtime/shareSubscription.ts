/** Una sola subscription per client/cache e ambito, anche con più badge montati.
 * Il microtask evita stop/start inutili nel replay degli effect di StrictMode. */
const owners = new WeakMap<object, Map<string, { references: number; stop: () => void }>>();
// Diagnostica opt-in solo in sviluppo, senza ID utente/azienda o credenziali.
function trace(enabled: boolean, event: string, consumers: number) {
  if (enabled) {
    console.debug('[realtime-audit]', JSON.stringify({ event, consumers }));
  }
}
export function shareSubscription(owner: object, scope: string, start: () => () => void): () => void {
  // Conserva l'opt-in nella lease: anche l'uscita dalla pagina deve essere tracciata.
  const audit = import.meta.env.DEV && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('__realtimeAudit') === '1';
  let entries = owners.get(owner);
  if (!entries) { entries = new Map(); owners.set(owner, entries); }
  let entry = entries.get(scope);
  const created = !entry;
  if (!entry) { entry = { references: 0, stop: start() }; entries.set(scope, entry); }
  entry.references++;
  trace(audit, created ? 'opened' : 'shared', entry.references);
  const current = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    current.references--;
    trace(audit, 'released', current.references);
    if (current.references === 0) queueMicrotask(() => {
      if (current.references !== 0 || entries!.get(scope) !== current) return;
      entries!.delete(scope);
      current.stop();
      trace(audit, 'closed', 0);
    });
  };
}
