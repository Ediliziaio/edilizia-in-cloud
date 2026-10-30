import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

/**
 * Su desktop e tablet scorre il documento, ma fra l'editor e la pagina ci sono contenitori con `overflow` (main e due involucri
 * del layout): un elemento `sticky` si ancora al contenitore più vicino con overflow, anche se non scorre, e così non resta mai
 * fermo. Finché l'editor è aperto, quei contenitori passano a `overflow: clip` (taglia come `hidden` ma non è un contenitore di
 * scorrimento). Lo si fa solo se il documento scorre e nessuno di loro scorre davvero: a telefono scorre `main` e lo `sticky`
 * funziona da solo. Senza supporto per `clip` non cambia nulla.
 */
export function useStickyNelDocumento(radice: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const partenza = radice.current;
    if (!partenza || typeof CSS === "undefined" || typeof CSS.supports !== "function" || !CSS.supports("overflow", "clip")) return;
    const contenitori = (): HTMLElement[] => {
      const out: HTMLElement[] = [];
      for (let n = partenza.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") out.push(n);
      }
      return out;
    };
    const modificati = new Map<HTMLElement, string>();
    const valuta = () => {
      const lista = contenitori();
      const scorreDavvero = (e: HTMLElement) => e.scrollHeight > e.clientHeight + 2;
      if (modificati.size) {
        // Se uno dei contenitori è tornato a scorrere (rotazione, finestra ridimensionata) si rimette tutto com'era.
        if ([...modificati.keys()].some(scorreDavvero)) { modificati.forEach((prima, e) => { e.style.overflow = prima; }); modificati.clear(); }
        return;
      }
      const documentoScorre = document.documentElement.scrollHeight > window.innerHeight + 40;
      if (!documentoScorre || lista.some((e) => getComputedStyle(e).overflowY !== "clip" && scorreDavvero(e))) return;
      for (const e of lista) { modificati.set(e, e.style.overflow); e.style.overflow = "clip"; }
    };
    const frame = requestAnimationFrame(valuta);
    window.addEventListener("resize", valuta);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", valuta); modificati.forEach((prima, e) => { e.style.overflow = prima; }); modificati.clear(); };
  }, [radice]);
}

/**
 * Quali sezioni dell'editor sono aperte. Alla prima apertura restano aperte solo quelle con voci da completare: chi riprende un
 * POS quasi finito vede subito cosa manca. Da lì decide chi usa l'editor: una sezione non si chiude da sola mentre ci si scrive.
 */
export function useSezioniApertePos(ids: readonly string[], inizialmenteAperta: (id: string) => boolean) {
  const [stato, setStato] = useState<Record<string, boolean>>(() => Object.fromEntries(ids.map((id) => [id, inizialmenteAperta(id)])));
  const aperta = useCallback((id: string) => stato[id] ?? true, [stato]);
  const alterna = useCallback((id: string) => setStato((s) => ({ ...s, [id]: !(s[id] ?? true) })), []);
  const apri = useCallback((id: string) => setStato((s) => (s[id] === false ? { ...s, [id]: true } : s)), []);
  const comprimiComplete = useCallback((mancanti: (id: string) => number) => setStato(Object.fromEntries(ids.map((id) => [id, mancanti(id) > 0]))), [ids]);
  const espandiTutto = useCallback(() => setStato(Object.fromEntries(ids.map((id) => [id, true]))), [ids]);
  return useMemo(() => ({ aperta, alterna, apri, comprimiComplete, espandiTutto }), [aperta, alterna, apri, comprimiComplete, espandiTutto]);
}
