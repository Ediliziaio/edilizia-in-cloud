/** Bozze locali: chi usa il hook deve montare il modulo con key azienda/utente/documento. */
import { useState, useEffect, useCallback, useRef } from "react";
const PREFIX = "campo-draft:";
export function useFormDraft<T extends Record<string, unknown>>(key: string, initialValues: T, debounceMs = 500) {
  const storageKey = PREFIX + key;
  const initial = useRef(initialValues);
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.data && typeof p.data === "object" && !Array.isArray(p.data)) {
          // Recupera solo campi noti. Non riporta nel modulo chiavi arbitrarie del deposito locale.
          const data = Object.fromEntries(Object.entries(p.data).filter(([k]) => k in initialValues));
          return { data: { ...initialValues, ...data } as T, exists: true, date: new Date(p.savedAt) };
        }
      }
    } catch { /* Un deposito non disponibile non è un salvataggio riuscito. */ }
    return { data: initialValues, exists: false, date: null };
  });
  const [draft, setDraft] = useState<T>(loaded.data);
  const [hasSavedDraft, setHasSavedDraft] = useState(loaded.exists);
  const [lastSaved, setLastSaved] = useState<Date | null>(loaded.date);
  const [saveError, setSaveError] = useState<string | null>(null);
  const value = useRef(draft);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((notify = true) => {
    if (!pending.current) return;
    try {
      const now = new Date();
      localStorage.setItem(storageKey, JSON.stringify({ data: value.current, savedAt: now.toISOString() }));
      pending.current = false;
      if (notify) { setLastSaved(now); setHasSavedDraft(true); setSaveError(null); }
    } catch {
      if (notify) setSaveError("La bozza non è stata salvata sul telefono. Mantieni aperta la pagina o invia quando torna la connessione.");
    }
  }, [storageKey]);
  const updateDraft = useCallback((patch: Partial<T>) => {
    value.current = { ...value.current, ...patch };
    setDraft(value.current);
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, debounceMs);
  }, [persist, debounceMs]);
  const clearDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; pending.current = false;
    try {
      localStorage.removeItem(storageKey);
      value.current = initial.current; setDraft(initial.current);
      setHasSavedDraft(false); setLastSaved(null); setSaveError(null);
    } catch { setSaveError("Non riesco a rimuovere la bozza locale. Controlla lo storico prima di riprenderla."); }
  }, [storageKey]);
  useEffect(() => {
    const flush = () => persist();
    const hide = () => { if (document.visibilityState === "hidden") persist(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", hide);
      if (timer.current) clearTimeout(timer.current);
      persist(false);
    };
  }, [persist]);
  return { draft, updateDraft, clearDraft, hasSavedDraft, lastSaved, saveError };
}
export function listDraftKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
    return keys;
  } catch { return []; }
}
export function clearAllDrafts(): void {
  try { listDraftKeys().forEach(key => localStorage.removeItem(PREFIX + key)); } catch { /* deposito non disponibile */ }
}
