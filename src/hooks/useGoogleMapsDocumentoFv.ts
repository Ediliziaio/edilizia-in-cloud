import { useCallback, useEffect, useRef, useState } from "react";
import { preparaMappeDocumentoFv } from "@/lib/fotovoltaico/googleMapsDocumento";

export function useGoogleMapsDocumentoFv(html: string | null | undefined) {
  const cleanup = useRef<(() => void) | null>(null);
  const [caricando, setCaricando] = useState(false), [errore, setErrore] = useState("");
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => { if (!html) cleanup.current?.(); }, [html]);
  const carica = useCallback((doc: Document | null | undefined) => {
    if (!doc) return;
    cleanup.current?.();
    const controller = new AbortController();
    let pulisci: (() => void) | undefined;
    cleanup.current = () => { controller.abort(); pulisci?.(); };
    setErrore(""); setCaricando(!!doc.querySelector("[data-fv-google-pdf]"));
    void preparaMappeDocumentoFv(doc, controller.signal).then(fn => {
      pulisci = fn; if (controller.signal.aborted) fn(); else setCaricando(false);
    }).catch(e => { if (!controller.signal.aborted) { setCaricando(false); setErrore(e instanceof Error ? e.message : "Mappa non disponibile."); } });
  }, []);
  return { carica, caricando, errore };
}
