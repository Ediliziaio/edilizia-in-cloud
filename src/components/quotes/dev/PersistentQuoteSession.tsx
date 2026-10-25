import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createLocalQuoteMemory, LocalDraftConflict, type LocalDraftScope, type LocalQuoteSnapshot, type QuoteLocalVersion } from "@/lib/preventivi/localQuoteMemory";
import type { QuoteDemoMemory, QuoteDemoCopy } from '@/lib/preventivi/quoteDemoMemory';
import { createQuoteDemoAutoCopy, type QuoteAutoCopyState } from '@/lib/preventivi/quoteDemoAutoCopy';
export type LoadedQuoteMemory = { counter: number; snapshot: LocalQuoteSnapshot | null; blob: Blob | null };
export type MemoryProps = {
  initial: LoadedQuoteMemory; status: string; issue: string | null; blocked: boolean;
  save: (snapshot: LocalQuoteSnapshot, blob: Blob | null) => void; reload: () => void; retry: () => void;
  flush: () => Promise<boolean>;
  versions?: () => Promise<QuoteLocalVersion[]>;
  checkpoint?: (name: string) => Promise<void>;
  restoreVersion?: (id: string) => Promise<void>;
  demo?: { inspect: () => Promise<QuoteDemoCopy | null>; upload: (expected: number) => Promise<number>; restore: (copy: QuoteDemoCopy) => Promise<void>; auto?: QuoteAutoCopyState & { start: (expected: number) => Promise<void>; stop: () => void } };
};
/** Persistence is opt-in with an authenticated account, never an anonymous shared key. */
export default function PersistentQuoteSession({ scope, children, demoMemory }: { scope: LocalDraftScope; children: (props: MemoryProps) => ReactNode; demoMemory?: QuoteDemoMemory }) {
  // Stateless adapter, memoized for normal renders but rebuilt on React Fast
  // Refresh. A useState initializer kept obsolete validation closures alive
  // after the local room/system contract changed during development.
  const repository = useMemo(() => createLocalQuoteMemory(), []);
  const [loaded, setLoaded] = useState<LoadedQuoteMemory | null>(null);
  const [status, setStatus] = useState("Recupero bozza locale…"); const [issue, setIssue] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); const [mount, setMount] = useState(0);
  const counter = useRef(0); const assetId = useRef<string | null>(null); const stopped = useRef(false);
  const latest = useRef<{ snapshot: LocalQuoteSnapshot; blob: Blob | null } | null>(null);
  const pending = useRef(false); const writing = useRef(false); const disposed = useRef(false);
  const serialized = useRef("");
  const loadingGeneration = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const chain = useRef(Promise.resolve());
  const [autoState, setAutoState] = useState<QuoteAutoCopyState>({ enabled: false, pending: false, status: '' });
  const autoCopy = useMemo(() => demoMemory ? createQuoteDemoAutoCopy(demoMemory, scope, setAutoState) : null, [demoMemory, scope]);
  const load = useCallback(async () => {
    const run = ++loadingGeneration.current;
    try {
      const record = await repository.load(scope);
      if (disposed.current || run !== loadingGeneration.current) return;
      counter.current = record.counter; assetId.current = record.blob ? record.snapshot?.plan?.id ?? null : null; stopped.current = false;
      serialized.current = record.snapshot ? JSON.stringify(record.snapshot) : "";
      pending.current = false; latest.current = null; setIssue(null); setBlocked(false); setLoaded(record); setMount(m => m + 1);
      setStatus(record.snapshot ? "Bozza ripresa da questo browser" : "Memoria locale pronta");
    } catch { if (!disposed.current && run === loadingGeneration.current) { setIssue("Non riesco a recuperare la memoria locale. Non la sovrascrivo: controlla l’accesso ai dati del browser."); setBlocked(true); } }
  }, [repository, scope]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    chain.current = chain.current.then(async () => {
      if (stopped.current || !pending.current || !latest.current) return;
      const task = latest.current; pending.current = false; writing.current = true;
      try {
        const blob = task.snapshot.plan?.id !== assetId.current ? task.blob : undefined;
        counter.current = await repository.save(scope, task.snapshot, counter.current, blob);
        serialized.current = JSON.stringify(task.snapshot);
        assetId.current = task.snapshot.plan?.localFileMissing ? null : task.snapshot.plan?.id ?? null;
        autoCopy?.update(task.snapshot);
        if (!disposed.current) {
          // A child remount (including dev hot refresh) must start from the
          // latest committed snapshot, not the stale snapshot loaded at login.
          setLoaded(previous => previous ? { counter: counter.current, snapshot: task.snapshot, blob: task.snapshot.plan && !task.snapshot.plan.localFileMissing ? task.blob ?? previous.blob : null } : previous);
          setStatus(pending.current ? "Salvataggio locale…" : "Salvato su questo browser");
        }
      } catch (e) {
        stopped.current = true; pending.current = true;
        if (!disposed.current) { setIssue(e instanceof LocalDraftConflict ? e.message : `Salvataggio locale non riuscito: ${e instanceof Error ? e.message.slice(0, 240) : 'errore del browser'}. Mantengo la bozza in memoria: non chiudere la pagina.`); setBlocked(e instanceof LocalDraftConflict); setStatus("Bozza non salvata"); }
      } finally { writing.current = false; }
    });
  }, [repository, scope, autoCopy]);
  useEffect(() => {
    disposed.current = false; void Promise.resolve().then(load);
    const unload = (e: BeforeUnloadEvent) => { if (pending.current || writing.current) { e.preventDefault(); e.returnValue = ""; flush(); } };
    window.addEventListener("beforeunload", unload);
    return () => { disposed.current = true; window.removeEventListener("beforeunload", unload); flush(); };
  }, [load, flush]);
  useEffect(() => { autoCopy?.resume(); return () => autoCopy?.dispose(); }, [autoCopy]);
  const save = useCallback((snapshot: LocalQuoteSnapshot, blob: Blob | null) => {
    latest.current = { snapshot, blob };
    if (JSON.stringify(snapshot) === serialized.current && !writing.current && !pending.current) return;
    pending.current = true;
    if (stopped.current) return;
    setStatus("Salvataggio locale…"); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);
  const reload = useCallback(() => { stopped.current = true; pending.current = false; void chain.current.then(load); }, [load]);
  const retry = useCallback(() => { stopped.current = false; setIssue(null); setBlocked(false); flush(); }, [flush]);
  const checkpoint = async (name: string) => {
    flush(); await chain.current;
    if (stopped.current || pending.current || !latest.current) throw new Error('Completa il salvataggio locale prima di creare una versione.');
    await repository.checkpoint(scope, name, latest.current.snapshot, latest.current.blob, counter.current);
  };
  const restoreVersion = async (id: string) => {
    flush(); await chain.current;
    if (stopped.current || pending.current) throw new Error('Salvataggio locale non riuscito: ripristino non eseguito.');
    const version = (await repository.versions(scope)).find(v => v.id === id);
    if (!version) throw new Error('Versione locale non trovata.');
    // The previous working draft is not destroyed: restore is revisioned and
    // only proceeds after the user saves it as a named checkpoint in the UI.
    const revision = Math.max(latest.current?.snapshot.document.revision ?? 0, version.snapshot.document.revision) + 1;
    counter.current = await repository.save(scope, { ...version.snapshot, interrupted: false, pendingEdits: null, document: { ...version.snapshot.document, revision } }, counter.current, version.blob ?? undefined);
    await load();
  };
  const demo = demoMemory ? {
    inspect: () => demoMemory.load(scope),
    upload: async (expected: number) => {
      if (autoCopy?.isEnabled() || autoCopy?.isPending()) throw new Error('Disattiva e attendi la fine dell’aggiornamento automatico della copia demo.');
      flush(); await chain.current;
      if (stopped.current || pending.current || !latest.current || latest.current.snapshot.interrupted) throw new Error('Attendi la fine dell’operazione e il salvataggio locale.');
      return demoMemory.save(scope, latest.current.snapshot, expected);
    },
    restore: async (copy: QuoteDemoCopy) => {
      if (autoCopy?.isEnabled() || autoCopy?.isPending()) throw new Error('Disattiva e attendi la fine dell’aggiornamento automatico della copia demo.');
      flush(); await chain.current;
      if (stopped.current || pending.current) throw new Error('Completa prima il salvataggio locale.');
      if (latest.current) await repository.checkpoint(scope, `Prima copia demo ${new Date().toLocaleString('it-IT')}`, latest.current.snapshot, latest.current.blob, counter.current);
      const blob = copy.snapshot.plan?.id === latest.current?.snapshot.plan?.id ? latest.current?.blob : null;
      const snapshot: LocalQuoteSnapshot = { ...copy.snapshot, interrupted: false, pendingEdits: null, document: { ...copy.snapshot.document, revision: Math.max(copy.snapshot.document.revision, latest.current?.snapshot.document.revision ?? 0) + 1 }, plan: copy.snapshot.plan ? { ...copy.snapshot.plan, ...(blob ? { localFileMissing: undefined } : { localFileMissing: true as const }) } : null };
      counter.current = await repository.save(scope, snapshot, counter.current, blob);
      await load();
    },
    auto: autoCopy ? { ...autoState, start: async (expected: number) => {
      flush(); await chain.current;
      if (stopped.current || pending.current || !latest.current) throw new Error('Completa prima il salvataggio locale.');
      await autoCopy.start(latest.current.snapshot, expected);
    }, stop: () => autoCopy.stop() } : undefined,
  } : undefined;
  if (!loaded) return <section className="simulation-shell" aria-label="Recupero memoria locale"><h1>Riprendo il tuo progetto</h1><p role="status">{issue ?? status}</p>{issue && <button onClick={() => void load()}>Riprova recupero locale</button>}</section>;
  // The render prop forwards event/effect callbacks; it does not read their refs during render.
  // eslint-disable-next-line react-hooks/refs
  return <div key={mount}>{children({ initial: loaded, status, issue, blocked, save, reload, retry, flush: () => { flush(); return chain.current.then(() => !stopped.current && !pending.current); }, checkpoint, versions: () => repository.versions(scope), restoreVersion, demo })}</div>;
}
