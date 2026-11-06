import { useMemo, useSyncExternalStore } from "react";

/** Persistenza prima dell'aggiornamento React: una sostituzione del modulo non perde l'esito. */
export function useProgresso<T extends { id: string }>(key: string): [T[], (row: T) => void] {
  const leggi = () => { try { return sessionStorage.getItem(key) || "[]"; } catch { return "[]"; } };
  const snapshot = useSyncExternalStore((notify) => {
    window.addEventListener(key, notify);
    return () => window.removeEventListener(key, notify);
  }, leggi, () => "[]");
  const results = useMemo<T[]>(() => { try { const value: unknown = JSON.parse(snapshot); return Array.isArray(value) ? value : []; } catch { return []; } }, [snapshot]);
  const update = (row: T) => {
    let old: T[] = [];
    try { const value: unknown = JSON.parse(leggi()); if (Array.isArray(value)) old = value; } catch { /* snapshot corrotto */ }
    const next = [...old.filter((r) => r.id !== row.id), row];
    sessionStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(key));
  };
  return [results, update];
}
