import type { LocalDraftScope, LocalQuoteSnapshot } from './localQuoteMemory';
import type { QuoteDemoMemory } from './quoteDemoMemory';
export type QuoteAutoCopyState = { enabled: boolean; pending: boolean; status: string };
/** Explicit opt-in automatic BACKUP, not a silent bidirectional merge. CAS
 * conflicts pause the writer. No polling, retries, original files or AI calls. */
export function createQuoteDemoAutoCopy(remote: QuoteDemoMemory, scope: LocalDraftScope, onState: (state: QuoteAutoCopyState) => void, delayMs = 3000) {
  let enabled = false, disposed = false, running = false, epoch = 0, version = 0;
  let latest: LocalQuoteSnapshot | null = null, digest = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const status = (text: string) => { if (!disposed) onState({ enabled, pending: running, status: text }); };
  const schedule = () => { clear(); if (enabled && !disposed && latest && !latest.interrupted && JSON.stringify(latest) !== digest) timer = setTimeout(() => void write(), delayMs); };
  const write = async () => {
    timer = null;
    if (!enabled || disposed || running || !latest || latest.interrupted) return;
    const snapshot = latest, serialized = JSON.stringify(snapshot); if (serialized === digest) return;
    const run = epoch; let failure = ''; running = true; status('Aggiorno la copia demo…');
    try {
      const next = await remote.save(scope, snapshot, version);
      if (disposed || run !== epoch) return;
      version = next; digest = serialized; status(`Copia demo aggiornata · v${version}`);
    } catch (e) {
      if (!disposed && run === epoch) { enabled = false; clear(); failure = `${(e as Error).message} Aggiornamento automatico sospeso; bozza locale conservata.`; }
    } finally { running = false; if (!disposed) { status(run !== epoch ? 'Copia automatica disattivata.' : enabled ? `Copia demo aggiornata · v${version}` : failure || 'Aggiornamento automatico sospeso: controlla la copia demo.'); if (run === epoch) schedule(); } }
  };
  return {
    isEnabled: () => enabled,
    isPending: () => running,
    async start(snapshot: LocalQuoteSnapshot, expectedVersion: number) {
      if (disposed || running || enabled || snapshot.interrupted) throw new Error('Attendi la fine delle operazioni prima di attivare la copia automatica.');
      const run = ++epoch; latest = snapshot; running = true; status('Attivo la copia demo…');
      try {
        const saved = await remote.save(scope, snapshot, expectedVersion);
        if (disposed || run !== epoch) return;
        version = saved; digest = JSON.stringify(snapshot); enabled = true;
      } finally { running = false; if (!disposed) { status(run !== epoch ? 'Copia automatica disattivata.' : enabled ? `Copia automatica attiva · v${version}` : 'Copia automatica non attivata. Bozza locale conservata.'); if (run === epoch) schedule(); } }
    },
    update(snapshot: LocalQuoteSnapshot) { latest = snapshot; schedule(); },
    stop() { enabled = false; epoch++; clear(); status('Aggiornamento automatico disattivato. Un salvataggio già avviato può essere concluso.'); },
    dispose() { disposed = true; enabled = false; epoch++; clear(); },
    resume() { disposed = false; status('Copia automatica disattivata.'); },
  };
}
