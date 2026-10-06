/**
 * Le righe del preventivo serramenti: i numeri scritti nei campi e i totali che
 * ne derivano sulla riga del preventivo.
 */
import { calcolaTotale } from "@/lib/serramenti/calcoli";
import { calcolaEcobonus } from "@/lib/serramenti/ecobonus";
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
  // Mezzo centesimo: le differenze dei float sotto il centesimo non sono modifiche, un centesimo sì. Era mezzo
  // euro: un totale salvato fino a 49 centesimi indietro restava com'era, e l'elenco, l'opportunità e la
  // commessa (sr_converti_in_ordine prende totale_max) leggevano una cifra diversa da quella del PDF.
  totale_min: 0.005,
  totale_max: 0.005,
  totale_serramenti: 0,
  totale_accessori: 0,
  metri_quadri_totali: 0.005,
};

const centesimi = (valore: number) => Math.round((Number.isFinite(valore) ? valore : 0) * 100) / 100;

type DettaglioPerITotali = Pick<SrProgettoDetail, "serramenti" | "accessori"> & Partial<Pick<SrProgettoDetail, "servizi">>;
type EconomiaPerITotali = Pick<Partial<SrProgettoRow>, "iva_percentuale" | "sconto_percentuale" | "sconto_importo" | "prezzo_manuale">;

/** Il conto del preventivo dalle posizioni e dai campi dell'economia: lo stesso del passo Economia e del PDF. */
function calcoloDelPreventivo(detail: DettaglioPerITotali, economia: EconomiaPerITotali) {
  return calcolaTotale(
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
}

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
  detail: DettaglioPerITotali,
  economia: EconomiaPerITotali,
): TotaliPreventivo {
  const totale = calcoloDelPreventivo(detail, economia);
  const importo = centesimi(totale.totale_iva_inclusa);
  return {
    totale_min: importo,
    totale_max: importo,
    totale_serramenti: totale.num_serramenti,
    totale_accessori: totale.num_accessori,
    metri_quadri_totali: centesimi(totale.metri_quadri),
  };
}

/**
 * Imponibile, IVA e totale come li riceve il cliente nel documento di firma («Invia per firma»), dalle posizioni e
 * con lo stesso conto del PDF: al centesimo e con la somma che torna. Il totale è quello del preventivo,
 * l'imponibile quello dopo lo sconto, l'IVA la differenza (con l'IVA mista, la somma delle quote al 10% e al 22%).
 * Prima si ricavavano dal solo totale dividendo per `1 + aliquota`: con l'IVA mista (aliquota -1, cioè «0,99»)
 * l'imponibile veniva più alto del totale e l'IVA negativa.
 */
export function importiDelPreventivo(
  detail: DettaglioPerITotali,
  economia: EconomiaPerITotali,
): { imponibile: number; iva: number; totale: number } {
  const t = calcoloDelPreventivo(detail, economia);
  const totale = centesimi(t.totale_iva_inclusa);
  const imponibile = centesimi(t.imponibile_netto);
  return { imponibile, iva: centesimi(totale - imponibile), totale };
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

export interface DetrazionePreventivo {
  detrazione_eur_totale: number;
  detrazione_eur_anno: number;
}

/**
 * La detrazione che il preventivo deve avere scritta per il totale di adesso: totale IVA inclusa col massimale,
 * all'aliquota scelta (la detrazione si salva solo mentre è aperto il passo Economia, e dopo una modifica delle
 * posizioni da un altro passo restava sul totale di prima). Senza aliquota (vuota o 0 = esclusa) non c'è niente
 * da tenere allineato: null.
 */
export function detrazioneDelPreventivo(aliquota: number | string | null | undefined, totale: number): DetrazionePreventivo | null {
  const pct = Number(aliquota);
  if (!(pct > 0)) return null;
  const e = calcolaEcobonus({ imponibile_eur: Number.isFinite(totale) && totale > 0 ? totale : 0, aliquota: pct });
  return { detrazione_eur_totale: e.detrazione_totale, detrazione_eur_anno: e.rata_annuale };
}

/** I soli campi della detrazione da riscrivere, perché diversi di almeno un centesimo da quelli salvati. */
export function detrazioneCambiata(
  salvata: Partial<Record<keyof DetrazionePreventivo, number | string | null>>,
  calcolata: DetrazionePreventivo,
): Partial<DetrazionePreventivo> {
  const cambiata: Partial<DetrazionePreventivo> = {};
  for (const campo of Object.keys(calcolata) as Array<keyof DetrazionePreventivo>) {
    if (centesimiInteri(salvata[campo]) !== centesimiInteri(calcolata[campo])) cambiata[campo] = calcolata[campo];
  }
  return cambiata;
}

const centesimiInteri = (valore: unknown) => Math.round((Number.isFinite(Number(valore)) ? Number(valore) : 0) * 100);
