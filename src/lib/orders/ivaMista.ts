import {parseDecimalIT, parseDecimalITStrict, formatDecimalIT} from "@/lib/parseDecimalIT";

export const IVA_MISTA = "mixed";
export type ModalitaQuoteIva = "net" | "gross";
export interface QuoteIvaMista { mode: ModalitaQuoteIva; amount10: string; amount22: string; }
export interface IvaMistaSalvata { version: 1; input_mode: ModalitaQuoteIva; quota_10: number; quota_22: number; }
export interface QuotaIva { rate: 10 | 22; entered: number; net: number; vat: number; gross: number; rounding: number; }
const euro = (cents: number) => cents / 100;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export const quoteIvaVuote = (mode: ModalitaQuoteIva = "net"): QuoteIvaMista => ({mode, amount10: "", amount22: ""});

export function leggiImportoQuota(raw: string): {value: number; error: string | null} {
  if (!raw.trim()) return {value: 0, error: "Inserisci entrambe le quote; usa 0 se un’aliquota non si applica."};
  const value = parseDecimalITStrict(raw);
  if (!/^[\d\s.,]+$/.test(raw.trim()) || !/\d/.test(raw) || !Number.isFinite(value) || value < 0 || value > 99_999_999.99) return {value: 0, error: "Inserisci importi validi e non negativi."};
  if (Math.abs(value - euro(cents(value))) > 0.000001) return {value, error: "Gli importi possono avere al massimo due decimali."};
  return {value, error: null};
}

export function calcolaQuoteIva(draft: QuoteIvaMista) {
  const amounts = [leggiImportoQuota(draft.amount10), leggiImportoQuota(draft.amount22)];
  const rows: QuotaIva[] = ([10, 22] as const).map((rate, index) => {
    const entered = cents(amounts[index].value);
    const net = draft.mode === "gross" ? Math.round(entered * 100 / (100 + rate)) : entered;
    const vat = Math.round(net * rate / 100);
    const rounding = draft.mode === "gross" ? entered - net - vat : 0;
    return {rate, entered: euro(entered), net: euro(net), vat: euro(vat), rounding: euro(rounding), gross: euro(net + vat + rounding)};
  });
  const sum = (key: "net" | "vat" | "gross" | "rounding") => euro(rows.reduce((total, row) => total + cents(row[key]), 0));
  const net = sum("net"), vat = sum("vat"), gross = sum("gross"), rounding = sum("rounding");
  const error = (draft.mode !== "net" && draft.mode !== "gross" ? "Scegli IVA esclusa o IVA inclusa." : null) ?? amounts.find(amount => amount.error)?.error ?? (net <= 0 ? "La somma delle quote deve essere maggiore di zero." : net > 99_999_999.99 ? "L’imponibile totale supera il limite del contratto." : null);
  return {rows, net, vat, gross, rounding, error, effectiveRate: net > 0 ? (gross - net) * 100 / net : 0};
}

export function calcolaIvaContratto(total: string | number, rate: string | number, draft?: QuoteIvaMista | null) {
  const net = typeof total === "number" ? total : parseDecimalIT(total);
  if (String(rate) !== IVA_MISTA) {
    const percentage = typeof rate === "number" ? rate : parseDecimalIT(rate);
    const vat = euro(cents(net * percentage / 100));
    return {net, vat, gross: euro(cents(net) + cents(vat)), rounding: 0, effectiveRate: percentage, error: null as string | null, split: null as ReturnType<typeof calcolaQuoteIva> | null};
  }
  const split = calcolaQuoteIva(draft ?? quoteIvaVuote());
  const difference = cents(net) - cents(split.net);
  const error = split.error ?? (difference !== 0 ? `La ripartizione non coincide con l’imponibile del contratto: ${difference > 0 ? "restano da assegnare" : "hai assegnato in più"} ${formatDecimalIT(Math.abs(euro(difference)))} €.` : null);
  return {net, vat: split.vat, gross: euro(cents(net) + cents(split.vat) + cents(split.rounding)), rounding: split.rounding, effectiveRate: split.effectiveRate, error, split};
}

export function cambiaModalitaQuote(draft: QuoteIvaMista, mode: ModalitaQuoteIva): QuoteIvaMista {
  if (draft.mode === mode) return draft;
  const result = calcolaQuoteIva(draft);
  return {mode, amount10: !leggiImportoQuota(draft.amount10).error ? formatDecimalIT(result.rows[0][mode === "gross" ? "gross" : "net"]) : draft.amount10, amount22: !leggiImportoQuota(draft.amount22).error ? formatDecimalIT(result.rows[1][mode === "gross" ? "gross" : "net"]) : draft.amount22};
}

export function serializzaIvaMista(draft: QuoteIvaMista): IvaMistaSalvata {
  const result = calcolaQuoteIva(draft);
  if (result.error) throw new Error(result.error);
  return {version: 1, input_mode: draft.mode, quota_10: result.rows[0].entered, quota_22: result.rows[1].entered};
}

export function leggiIvaMista(value: unknown): QuoteIvaMista | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1 || (obj.input_mode !== "net" && obj.input_mode !== "gross") || typeof obj.quota_10 !== "number" || typeof obj.quota_22 !== "number") return null;
  if (![obj.quota_10, obj.quota_22].every(n => Number.isFinite(n) && n >= 0 && n <= 99_999_999.99 && Math.abs(n * 100 - Math.round(n * 100)) < 0.000001)) return null;
  const draft: QuoteIvaMista = {mode: obj.input_mode as ModalitaQuoteIva, amount10: formatDecimalIT(obj.quota_10), amount22: formatDecimalIT(obj.quota_22)};
  return calcolaQuoteIva(draft).error ? null : draft;
}

export function ivaMistaDaOrdine(order: unknown): QuoteIvaMista | null {
  return order && typeof order === "object" && "vat_breakdown" in order ? leggiIvaMista(order.vat_breakdown) : null;
}

/** Suggerimento per una rata: ripartizione proporzionale, modificabile sulle righe della fattura. */
export function ripartisciLordoIva(draft: QuoteIvaMista, gross: number) {
  const original = calcolaQuoteIva(draft);
  if (original.error || !Number.isFinite(gross) || gross < 0) throw new Error(original.error ?? "Importo della rata non valido.");
  if (cents(gross) === cents(original.gross)) return original;
  const first = Math.round(cents(gross) * cents(original.rows[0].gross) / cents(original.gross));
  return calcolaQuoteIva({mode:"gross", amount10:formatDecimalIT(euro(first)), amount22:formatDecimalIT(euro(cents(gross)-first))});
}
