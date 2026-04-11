/**
 * Hook per salvare automaticamente le bozze dei form campo in localStorage.
 * Previene la perdita di dati quando il dispositivo va offline o l'app si chiude.
 *
 * Usage:
 *   const { draft, updateDraft, clearDraft } = useFormDraft<MyForm>("rapportino-form", initialValues);
 */
import { useState, useEffect, useCallback, useRef } from "react";

const PREFIX = "campo-draft:";

export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  initialValues: T,
  /** Intervallo di auto-save in ms (default 1000) */
  debounceMs = 1000,
): {
  draft: T;
  updateDraft: (patch: Partial<T>) => void;
  clearDraft: () => void;
  hasSavedDraft: boolean;
  lastSaved: Date | null;
} {
  const storageKey = PREFIX + key;

  // Load from localStorage on mount
  const loadSaved = (): { data: T; exists: boolean; savedAt: Date | null } => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { data: T; savedAt: string };
        return { data: { ...initialValues, ...parsed.data }, exists: true, savedAt: new Date(parsed.savedAt) };
      }
    } catch {
      // ignore parse errors
    }
    return { data: initialValues, exists: false, savedAt: null };
  };

  const saved = loadSaved();
  const [draft, setDraft] = useState<T>(saved.data);
  const [hasSavedDraft, setHasSavedDraft] = useState(saved.exists);
  const [lastSaved, setLastSaved] = useState<Date | null>(saved.savedAt);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Persist to localStorage with debounce
  const persistDraft = useCallback(() => {
    try {
      const payload = JSON.stringify({ data: draftRef.current, savedAt: new Date().toISOString() });
      localStorage.setItem(storageKey, payload);
      setLastSaved(new Date());
      setHasSavedDraft(true);
    } catch {
      // localStorage might be full, ignore
    }
  }, [storageKey]);

  const updateDraft = useCallback(
    (patch: Partial<T>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        return next;
      });
      // Debounced save
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(persistDraft, debounceMs);
    },
    [persistDraft, debounceMs],
  );

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setDraft(initialValues);
    setHasSavedDraft(false);
    setLastSaved(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [storageKey, initialValues]);

  // Save on beforeunload (app closing / navigating away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        persistDraft();
      }
    };

    // Also save on visibilitychange (mobile: app going to background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistDraft();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [persistDraft]);

  return { draft, updateDraft, clearDraft, hasSavedDraft, lastSaved };
}

/** List all saved draft keys */
export function listDraftKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) {
      keys.push(k.slice(PREFIX.length));
    }
  }
  return keys;
}

/** Clear all saved drafts */
export function clearAllDrafts(): void {
  listDraftKeys().forEach((key) => localStorage.removeItem(PREFIX + key));
}
