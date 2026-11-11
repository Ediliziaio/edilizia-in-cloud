import { useEffect, useRef } from "react";

/** Debounce con attesa massima: scrivere senza pause non rinvia il salvataggio all'infinito. */
export function useBoundedAutosave(
  snapshot: string,
  enabled: boolean,
  save: () => void,
  scope: string,
  delayMs = 3_000,
  maxWaitMs = 15_000,
) {
  const latestSave = useRef(save);
  latestSave.current = save;
  const pending = useRef<{ scope: string; since: number } | null>(null);
  useEffect(() => {
    if (!enabled) { pending.current = null; return; }
    if (pending.current?.scope !== scope) pending.current = { scope, since: Date.now() };
    const wait = Math.max(0, Math.min(delayMs, maxWaitMs - (Date.now() - pending.current.since)));
    const timer = setTimeout(() => {
      pending.current = null;
      latestSave.current();
    }, wait);
    return () => clearTimeout(timer);
  }, [snapshot, enabled, scope, delayMs, maxWaitMs]);
}

/** La navigazione SPA non genera pagehide: conserva l'ultimo input anche
 * smontando la pagina prima che scatti il timer della bozza locale. */
export function useDraftExitFlush(persist: () => void) {
  const latest = useRef(persist);
  latest.current = persist;
  useEffect(() => {
    const flush = () => latest.current();
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
