/**
 * useFitScale — adatta un documento a larghezza fissa (un foglio A4) alla
 * larghezza reale del pannello che lo contiene.
 *
 * Nasce dal bug dell'anteprima Fotovoltaico: il foglio è largo 794px (210mm),
 * il pannello ~400 → senza adattamento si vedeva metà pagina tagliata, e il
 * bottone "Adatta" non adattava nulla. Serramenti aveva già la sua versione di
 * questo calcolo, il Fotovoltaico no: la logica ora sta in UN posto solo, così
 * il prossimo vertical la eredita invece di reinventarla (o dimenticarla).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Larghezza di una pagina A4 a 96dpi: 210mm. È la misura dei nostri PDF. */
export const LARGHEZZA_A4_PX = 794;

export interface FitScale {
  /** Da mettere sul contenitore che dà la larghezza disponibile. */
  ref: React.RefObject<HTMLDivElement>;
  /** Fattore per far entrare il documento nel pannello (≤ 1). */
  fitScale: number;
  /** Zoom scelto dall'utente: 1 = "adattato". */
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  /** Scala finale da applicare: fitScale × zoom. */
  scala: number;
  /** Percentuale reale mostrata all'utente (non un 100% che non significa nulla). */
  percentuale: number;
  aumenta: () => void;
  riduci: () => void;
  adatta: () => void;
  puoAumentare: boolean;
  puoRidurre: boolean;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

export function useFitScale(larghezzaDocumento = LARGHEZZA_A4_PX): FitScale {
  const ref = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calcola = () => {
      const disponibile = el.clientWidth;
      // Mai ingrandire oltre il naturale: un A4 stirato su un monitor largo
      // sarebbe sfocato e diverso dal PDF finale.
      if (disponibile > 0) setFitScale(Math.min(1, disponibile / larghezzaDocumento));
    };
    calcola();
    const ro = new ResizeObserver(calcola);
    ro.observe(el);
    return () => ro.disconnect();
  }, [larghezzaDocumento]);

  // Callback stabili (setState funzionale): non cambiano identità ad ogni
  // render, così i pannelli che le passano a bottoni memoizzati non si
  // ridisegnano a vuoto durante la digitazione nell'editor.
  const aumenta = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))), []);
  const riduci = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))), []);
  const adatta = useCallback(() => setZoom(1), []);

  const scala = fitScale * zoom;
  return useMemo(
    () => ({
      ref,
      fitScale,
      zoom,
      setZoom,
      scala,
      percentuale: Math.round(scala * 100),
      aumenta,
      riduci,
      adatta,
      puoAumentare: zoom < ZOOM_MAX,
      puoRidurre: zoom > ZOOM_MIN,
    }),
    [fitScale, zoom, scala, aumenta, riduci, adatta],
  );
}
