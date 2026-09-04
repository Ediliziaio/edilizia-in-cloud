/**
 * Hook per mostrare file riservati (foto di cantiere, firme, documenti dei
 * subappaltatori) con link a scadenza. Vedi src/lib/storage/fileRiservati.ts.
 *
 * Finche' i link firmati non sono pronti restituisce gli indirizzi di partenza:
 * niente riquadri vuoti mentre si aspetta.
 */
import { useEffect, useMemo, useState } from "react";
import { linkFileRiservati, SCADENZA_PREDEFINITA } from "@/lib/storage/fileRiservati";

export function useFileRiservati(
  valori: (string | null | undefined)[] | null | undefined,
  scadenza = SCADENZA_PREDEFINITA,
): string[] {
  const originali = useMemo(
    () => (valori ?? []).map((v) => String(v ?? "").trim()).filter(Boolean),
    [valori],
  );
  const chiave = originali.join("|");
  // Si tiene anche la chiave: se la lista cambia, i link vecchi non valgono piu'
  // e si torna agli indirizzi di partenza finche' non arrivano i nuovi.
  const [firmati, setFirmati] = useState<{ chiave: string; link: string[] } | null>(null);

  useEffect(() => {
    if (!chiave) return;
    let vivo = true;
    void linkFileRiservati(originali, scadenza).then((link) => {
      if (vivo) setFirmati({ chiave, link });
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, scadenza]);

  return firmati?.chiave === chiave ? firmati.link : originali;
}

/** Variante per un solo file. */
export function useFileRiservato(
  valore: string | null | undefined,
  scadenza = SCADENZA_PREDEFINITA,
): string | null {
  const lista = useMemo(() => (valore ? [valore] : []), [valore]);
  const link = useFileRiservati(lista, scadenza);
  return link[0] ?? null;
}
