import { createContext, useContext, useEffect, type MouseEvent } from "react";

export const ContestoSchedaCommessa = createContext<{
  torna: () => void;
  setModifiche: (valore: boolean) => void;
  setOperazioneInCorso: (valore: boolean) => void;
} | null>(null);

/** L'editor conserva il proprio salvataggio; il contenitore protegge l'uscita. */
export function useModificheSchedaCommessa(
  modificato: boolean,
  inCorso = false,
) {
  const contesto = useContext(ContestoSchedaCommessa);
  const setModifiche = contesto?.setModifiche;
  const setOperazioneInCorso = contesto?.setOperazioneInCorso;
  useEffect(() => {
    setOperazioneInCorso?.(inCorso);
    return () => setOperazioneInCorso?.(false);
  }, [inCorso, setOperazioneInCorso]);
  useEffect(() => {
    setModifiche?.(modificato);
    return () => setModifiche?.(false);
  }, [modificato, setModifiche]);
}

export type DestinazioneScheda = { to: string; state?: unknown };

/** Anche gli anchor HTML dei moduli storici restano nel contesto della commessa. */
export function intercettaScheda(
  e: MouseEvent,
  apri: (d: DestinazioneScheda) => void,
) {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  )
    return;
  const link = (e.target as Element).closest?.("a[href]");
  if (!link || link.hasAttribute("download")) return;
  const url = new URL(link.getAttribute("href")!, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/azienda/")
  )
    return;
  e.preventDefault();
  e.stopPropagation();
  apri({ to: url.pathname + url.search + url.hash });
}
