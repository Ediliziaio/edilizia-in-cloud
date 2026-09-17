/**
 * Hook per mostrare file riservati (foto di cantiere, firme, documenti dei
 * subappaltatori, immagini dei modelli PDF) con link a scadenza. Vedi
 * src/lib/storage/fileRiservati.ts.
 *
 * Finche' i link firmati non sono pronti restituisce gli indirizzi di partenza:
 * niente riquadri vuoti mentre si aspetta. Un percorso nudo invece non e' un
 * indirizzo: al suo posto c'e' "" finche' non arriva il link.
 */
import { useEffect, useMemo, useState } from "react";
import { eRiferimentoNudo, linkFileRiservati, SCADENZA_PREDEFINITA } from "@/lib/storage/fileRiservati";
import {
  immaginiDelModello,
  sostituisciImmagini,
  type CampiImmagine,
} from "@/lib/storage/immaginiModelloPdf";

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

  const link = firmati?.chiave === chiave ? firmati.link : originali;
  // Un percorso nudo (in attesa, o la cui firma non e' riuscita) non va mai
  // usato come src: il browser lo cercherebbe tra le pagine dell'app.
  return useMemo(() => link.map((v) => (eRiferimentoNudo(v) ? "" : v)), [link]);
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

/**
 * Il modello PDF con le immagini firmate, per le anteprime che si ricompongono
 * a ogni modifica. Firma solo quando cambia l'elenco delle immagini, non a ogni
 * tasto; un percorso ancora senza link diventa null, cosi' l'anteprima non
 * prova a caricarlo. Vedi supabase/functions/_shared/immaginiModelloPdf.ts.
 */
export function useImmaginiModelloFirmate<T>(modello: T, campi: CampiImmagine): T {
  const valori = useMemo(() => immaginiDelModello(modello, campi), [modello, campi]);
  const link = useFileRiservati(valori);
  return useMemo(() => {
    const perValore = new Map<string, string>();
    valori.forEach((valore, i) => {
      if (link[i]) perValore.set(valore, link[i]);
    });
    return sostituisciImmagini(modello, campi, (valore) => perValore.get(valore) ?? null);
  }, [modello, campi, valori, link]);
}
