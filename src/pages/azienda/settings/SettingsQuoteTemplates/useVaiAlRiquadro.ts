/**
 * L'indice dell'editor del preventivo generico: porta a un riquadro e lo evidenzia per un attimo.
 *
 * Fa quello che fa `useVaiASezione` (Prezzo e margini), ma NON scrive nell'indirizzo. Qui non serve e
 * farebbe danno: l'editor non si apre da un indirizzo (è uno stato della pagina, come «Modifica» su una
 * scheda) e `navigate({ hash })` butta via il resto dell'indirizzo, cioè `?tab=…&modulo=…`, che è
 * ciò che decide quale scheda della pagina è aperta.
 *
 * Scorre solo il contenitore che scorre da solo (su computer: la colonna dei campi, con l'indice in cima).
 * `scrollIntoView` scorrerebbe anche la pagina per portare il riquadro in cima alla finestra, e l'indice
 * finirebbe sotto la barra. Dove nessun contenitore scorre da solo (telefono) si usa `scrollIntoView`,
 * che tiene conto del margine `scroll-mt-16` del riquadro.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const DURATA_EVIDENZIA_MS = 2500;

/** Il contenitore più vicino al riquadro che ha davvero da scorrere (altezza propria e contenuto più alto). */
function contenitoreCheScorre(riquadro: HTMLElement): HTMLElement | null {
  for (let nodo = riquadro.parentElement; nodo && nodo !== document.body && nodo !== document.documentElement; nodo = nodo.parentElement) {
    const { overflowY } = window.getComputedStyle(nodo);
    if ((overflowY === "auto" || overflowY === "scroll") && nodo.scrollHeight > nodo.clientHeight) return nodo;
  }
  return null;
}

export function useVaiAlRiquadro() {
  const [evidenziato, setEvidenziato] = useState<string | null>(null);
  const spegni = useRef<number | null>(null);

  useEffect(() => () => {
    if (spegni.current !== null) window.clearTimeout(spegni.current);
  }, []);

  const vai = useCallback((id: string) => {
    const ridotto = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = ridotto ? "auto" : "smooth";
    const riquadro = document.getElementById(id);
    const contenitore = riquadro ? contenitoreCheScorre(riquadro) : null;
    if (riquadro && contenitore && typeof contenitore.scrollTo === "function") {
      const margine = parseFloat(window.getComputedStyle(riquadro).scrollMarginTop) || 0;
      const distanza = riquadro.getBoundingClientRect().top - contenitore.getBoundingClientRect().top;
      contenitore.scrollTo({ top: contenitore.scrollTop + distanza - margine, behavior });
    } else {
      riquadro?.scrollIntoView?.({ block: "start", behavior });
    }
    setEvidenziato(id);
    if (spegni.current !== null) window.clearTimeout(spegni.current);
    spegni.current = window.setTimeout(() => setEvidenziato(null), DURATA_EVIDENZIA_MS);
  }, []);

  return { evidenziato, vai };
}
