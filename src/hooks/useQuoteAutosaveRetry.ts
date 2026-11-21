import { useEffect, useRef } from "react";

const ATTESE = [2_000, 4_000, 8_000];

export function erroreSalvataggioTemporaneo(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, status } = error as { code?: string; message?: string; status?: number };
  if ([408, 429, 502, 503, 504].includes(status ?? 0) || /^(08|40|PGRST00[0-3])/.test(code ?? "")) return true;
  return !code && /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(message ?? "");
}

/** Riprende la stessa coda e legge i valori correnti al momento del tentativo. */
export function useQuoteAutosaveRetry(tentativo: number | null, enabled: boolean, save: () => void, scope: string) {
  const latest = useRef(save);
  useEffect(() => { latest.current = save; }, [save]);
  useEffect(() => {
    if (!enabled || tentativo === null || tentativo >= ATTESE.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ferma = () => clearTimeout(timer);
    const pianifica = (attesa: number) => {
      ferma();
      if (navigator.onLine) timer = setTimeout(() => {
        if (navigator.onLine) latest.current();
      }, attesa);
    };
    const online = () => pianifica(0);
    pianifica(ATTESE[tentativo]);
    window.addEventListener("online", online);
    window.addEventListener("offline", ferma);
    return () => {
      ferma();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", ferma);
    };
  }, [tentativo, enabled, scope]);
}
