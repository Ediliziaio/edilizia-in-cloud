import { useEffect, useRef, useState } from "react";

/**
 * useAnimatedText — rivela progressivamente un testo (effetto "typewriter")
 * spezzandolo per `separator` ("" = carattere per carattere, " " = parola,
 * "\n\n" = paragrafo). `speed` = caratteri/tick (default 2). Quando `text`
 * cambia e CONTIENE il testo già mostrato (streaming), continua da dove era;
 * altrimenti riparte. Usato per animare le risposte di Silvio AI.
 */
export function useAnimatedText(text: string, separator = "", speed = 2): string {
  const [shown, setShown] = useState("");
  const shownRef = useRef("");
  // Mirror "latest" del valore mostrato, aggiornato DOPO il render (non durante),
  // così l'effetto può leggerlo senza dipendere da `shown` (evita restart continui).
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    // Streaming: se il nuovo testo estende quello già mostrato, riparti da lì.
    const startFrom = text.startsWith(shownRef.current) ? shownRef.current : "";
    const parts =
      separator === "" ? Array.from(text) : text.split(separator);
    const shownParts =
      separator === "" ? Array.from(startFrom) : startFrom ? startFrom.split(separator) : [];
    let i = shownParts.length;

    if (i >= parts.length) {
      setShown(text);
      return;
    }

    const id = window.setInterval(() => {
      i = Math.min(parts.length, i + Math.max(1, speed));
      setShown(parts.slice(0, i).join(separator));
      if (i >= parts.length) window.clearInterval(id);
    }, 16);

    return () => window.clearInterval(id);
  }, [text, separator, speed]);

  return shown;
}

export default useAnimatedText;
