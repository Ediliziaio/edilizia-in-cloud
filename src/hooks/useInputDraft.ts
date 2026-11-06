import { useEffect, useRef, useState } from "react";

/** Aggiorna i dati ricaricati dal server, conservando ciò che si sta ancora digitando. */
export function useInputDraft(source: string) {
  const [draft, setDraft] = useState(source);
  const previous = useRef(source);
  useEffect(() => {
    const old = previous.current;
    previous.current = source;
    setDraft((current) => (current === old ? source : current));
  }, [source]);
  return [draft, setDraft] as const;
}
