/**
 * Cosa mostra il pannello di destra: il PDF vero (di serie dal 07/11/2026, Florin: «vorrei vedere l'anteprima
 * proprio del PDF che si va a generare») o l'anteprima veloce. La scelta è della persona e vale per tutti i
 * preventivatori, in questo browser; senza memoria vale per la visita.
 */
import { useCallback, useEffect, useState } from "react";
import type { ModalitaAnteprima } from "./PannelloAnteprima";

const CHIAVE = "preventivatore_anteprima_modalita";

/** Di serie il PDF vero. Le prove (jsdom non disegna PDF) partono dalla veloce: vedi src/test/setup.ts. */
const DI_SERIE = (): ModalitaAnteprima =>
  (globalThis as typeof globalThis & { __anteprimaDiSerie?: ModalitaAnteprima }).__anteprimaDiSerie ?? "pdf";

export function useModalitaAnteprima(): readonly [ModalitaAnteprima, (m: ModalitaAnteprima) => void] {
  const [modalita, setModalita] = useState<ModalitaAnteprima>(() => {
    try {
      const scelta = localStorage.getItem(CHIAVE);
      if (scelta === "veloce" || scelta === "pdf") return scelta;
    } catch { /* senza memoria vale la scelta di serie */ }
    return DI_SERIE();
  });
  const imposta = useCallback((m: ModalitaAnteprima) => {
    setModalita(m);
    try { localStorage.setItem(CHIAVE, m); } catch { /* senza memoria vale per questa visita */ }
  }, []);
  return [modalita, imposta] as const;
}

/**
 * La colonna di destra si vede? Nei preventivatori c'è da 1280 px in su (`xl`), nel preventivo classico da
 * 1024 (`lg`): sotto, il PDF vero non si prepara.
 */
export function useColonnaAnteprimaVisibile(larghezzaMinima = 1280): boolean {
  const query = `(min-width: ${larghezzaMinima}px)`;
  const [visibile, setVisibile] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const cambia = () => setVisibile(mq.matches);
    cambia();
    mq.addEventListener?.("change", cambia);
    return () => mq.removeEventListener?.("change", cambia);
  }, [query]);
  return visibile;
}
