/**
 * Le righe del preventivo serramenti: i numeri scritti nei campi e i totali che
 * ne derivano sulla riga del preventivo.
 */
import { calcolaTotale } from "@/lib/serramenti/calcoli";
import type { SrProgettoDetail, SrProgettoRow } from "@/types/serramenti";

/**
 * Una misura in millimetri scritta nel campo: vuoto toglie la misura,
 * `undefined` vuol dire non valida (zero, negativa, non un numero) e non si
 * salva. I decimali si arrotondano: la colonna è in millimetri interi e un
 * decimale faceva fallire il salvataggio.
 */
export function misuraDaTesto(testo: string): number | null | undefined {
  if (testo.trim() === "") return null;
  const mm = Math.round(Number(testo));
  return Number.isFinite(mm) && mm > 0 ? mm : undefined;
}

/** I pezzi scritti nel campo: un intero da 1 in su, altrimenti `undefined` (non valida). */
export function quantitaDaTesto(testo: string): number | undefined {
  if (testo.trim() === "") return undefined;
  const pezzi = Number(testo);
  return Number.isInteger(pezzi) && pezzi >= 1 ? pezzi : undefined;
}

export interface TotaliPreventivo {
  totale_min: number;
  totale_max: number;
  totale_serramenti: number;
  totale_accessori: number;
  metri_quadri_totali: number;
}

const SOGLIA: Record<keyof TotaliPreventivo, number> = {
  // Mezzo euro: le differenze dei float sotto il centesimo non sono modifiche.
  totale_min: 0.5,
  totale_max: 0.5,
  totale_serramenti: 0,
  totale_accessori: 0,
  metri_quadri_totali: 0.005,
};

const centesimi = (valore: number) => Math.round((Number.isFinite(valore) ? valore : 0) * 100) / 100;

/**
 * I totali che il preventivo tiene sulla sua riga, calcolati dalle posizioni
 * come nel passo Economia: li leggono l'elenco dei preventivi, le opportunità,
 * la pagina del cliente e la commessa che nasce dal preventivo
 * (sr_converti_in_ordine prende totale_max). Il preventivo serramenti ha un
 * prezzo finale, quindi minimo e massimo coincidono.
 *
 * Col prezzo scritto a mano il totale parte da quello, non dalle posizioni:
 * senza, elenco e commessa avrebbero mostrato 0 € per le finestre senza prezzo.
 */
export function totaliDelPreventivo(
  detail: Pick<SrProgettoDetail, "serramenti" | "accessori"> & Partial<Pick<SrProgettoDetail, "servizi">>,
  economia: Pick<Partial<SrProgettoRow>, "iva_percentuale" | "sconto_percentuale" | "sconto_importo" | "prezzo_manuale">,
): TotaliPreventivo {
  const totale = calcolaTotale(
    detail.serramenti,
    detail.accessori,
    {
      iva_percentuale: economia.iva_percentuale ?? 10,
      sconto_percentuale: economia.sconto_percentuale ?? 0,
      sconto_importo: economia.sconto_importo ?? 0,
      prezzo_manuale: economia.prezzo_manuale ?? null,
    },
    detail.servizi ?? [],
  );
  const importo = centesimi(totale.totale_iva_inclusa);
  return {
    totale_min: importo,
    totale_max: importo,
    totale_serramenti: totale.num_serramenti,
    totale_accessori: totale.num_accessori,
    metri_quadri_totali: centesimi(totale.metri_quadri),
  };
}

/** I soli totali da riscrivere, perché diversi da quelli salvati. */
export function totaliCambiati(
  salvati: Partial<Record<keyof TotaliPreventivo, number | null>>,
  calcolati: TotaliPreventivo,
): Partial<TotaliPreventivo> {
  const cambiati: Partial<TotaliPreventivo> = {};
  for (const campo of Object.keys(calcolati) as Array<keyof TotaliPreventivo>) {
    if (Math.abs(Number(salvati[campo] ?? 0) - calcolati[campo]) > SOGLIA[campo]) {
      cambiati[campo] = calcolati[campo];
    }
  }
  return cambiati;
}
