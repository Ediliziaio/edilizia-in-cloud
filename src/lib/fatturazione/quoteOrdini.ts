/**
 * Una fattura ricevuta divisa tra più ordini d'acquisto.
 *
 * Il fornitore che a fine mese fattura tutte le consegne manda una fattura
 * per più ordini. Ogni ordine prende la sua QUOTA dell'imponibile; quello che
 * avanza è un costo generale, non di commessa. Con un solo ordine la quota
 * non serve: tutta la fattura va su quello (come sempre).
 *
 * Le stesse regole le controlla collega_fattura_a_ordini() sul database:
 * qui servono per dire subito cosa non va, prima di premere «Collega».
 */

export interface QuotaOrdine {
  purchase_order_id: string;
  importo: number;
}

export interface EsitoQuote {
  /** Somma delle quote. */
  assegnato: number;
  /** Imponibile non assegnato a nessun ordine: costo generale. */
  resto: number;
  /** Il motivo per cui non si può collegare, o null. */
  errore: string | null;
}

const centesimi = (n: number) => Math.round(n * 100) / 100;

export function verificaQuote(imponibile: number | null, quote: QuotaOrdine[]): EsitoQuote {
  const assegnato = centesimi(quote.reduce((s, q) => s + (Number.isFinite(q.importo) ? q.importo : 0), 0));
  const base = imponibile != null ? Math.abs(imponibile) : null;
  const resto = base != null ? centesimi(base - assegnato) : 0;

  if (quote.length === 0) return { assegnato: 0, resto: base ?? 0, errore: "Scegli almeno un ordine." };
  if (quote.length === 1) return { assegnato: base ?? assegnato, resto: 0, errore: null };

  if (base == null || base <= 0) {
    return { assegnato, resto: 0, errore: "La fattura non ha l'imponibile: non si può dividere tra gli ordini." };
  }
  if (quote.some((q) => !Number.isFinite(q.importo) || q.importo <= 0)) {
    return { assegnato, resto, errore: "Ogni ordine scelto deve avere la sua quota, maggiore di zero." };
  }
  if (assegnato > base + 0.01) {
    return { assegnato, resto, errore: "Le quote superano l'imponibile della fattura." };
  }
  return { assegnato, resto: Math.max(0, resto), errore: null };
}

/**
 * La quota proposta quando si aggiunge un ordine: il suo imponibile, ma non
 * oltre quanto resta da assegnare della fattura.
 */
export function quotaProposta(imponibileOrdine: number | null, imponibileFattura: number | null, giaAssegnato: number): number {
  const ordine = imponibileOrdine != null && imponibileOrdine > 0 ? imponibileOrdine : 0;
  if (imponibileFattura == null) return centesimi(ordine);
  const disponibile = Math.max(0, Math.abs(imponibileFattura) - giaAssegnato);
  return centesimi(ordine > 0 ? Math.min(ordine, disponibile) : disponibile);
}

/**
 * La parte di una fattura divisa che tocca a un ordine, IVA compresa: la
 * scheda dell'ordine confronta il fatturato con il totale ordine (ivato).
 */
export function quotaIvata(quota: number, imponibileFattura: number | null, totaleFattura: number | null): number {
  if (!imponibileFattura || totaleFattura == null) return centesimi(quota);
  return centesimi(quota * (Math.abs(totaleFattura) / Math.abs(imponibileFattura)));
}

/** «1.234,56», «1234,56» e «1234.56» valgono tutti 1234,56. */
export function leggiImporto(testo: string): number {
  const t = testo.trim().replace(/\s|€/g, "");
  if (t === "") return NaN;
  const normale = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d+(\.\d+)?$/.test(normale) ? Number(normale) : NaN;
}
