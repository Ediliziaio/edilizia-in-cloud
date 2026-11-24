/**
 * «Aggiungi costo alla commessa»: dalla ricevuta letta dall'AI (ai-fattura-ricevuta-ocr, senza creare la fattura)
 * al modulo del costo. Si compila solo ciò che l'AI ha letto davvero: i campi vuoti restano come sono.
 */
import type { FormCostoCommessa } from "./costoCommessa";

export interface RicevutaLetta {
  numero_fattura?: string | null;
  data_fattura?: string | null;
  data_scadenza?: string | null;
  cedente?: { ragione_sociale?: string | null; piva?: string | null } | null;
  imponibile_totale?: number | null;
  iva_totale?: number | null;
  totale_documento?: number | null;
  righe?: Array<{ descrizione?: string | null }> | null;
  riepilogo_iva?: Array<{ aliquota?: number | null; imponibile?: number | null }> | null;
}

const ALIQUOTE = [0, 4, 5, 10, 22];
const data = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
export const importoIt = (n: number) => n.toFixed(2).replace(".", ",");

/** L'aliquota della ricevuta: quella con più imponibile nel riepilogo, oppure dedotta da imponibile e IVA. */
export function aliquotaLetta(r: RicevutaLetta): string | null {
  const righe = (r.riepilogo_iva ?? []).filter((x) => x && Number.isFinite(Number(x.aliquota)));
  if (righe.length > 0) {
    const prima = [...righe].sort((a, b) => Number(b.imponibile ?? 0) - Number(a.imponibile ?? 0))[0];
    return String(Number(prima.aliquota));
  }
  const imp = Number(r.imponibile_totale), iva = Number(r.iva_totale);
  if (imp > 0 && Number.isFinite(iva)) {
    const pct = (iva / imp) * 100;
    const vicina = ALIQUOTE.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a));
    if (Math.abs(vicina - pct) < 1) return String(vicina);
  }
  return null;
}

/** I campi del modulo che la lettura sa riempire. `fornitoreId` lo decide chi chiama (per partita IVA). */
export function formDaRicevuta(r: RicevutaLetta): Partial<FormCostoCommessa> {
  const out: Partial<FormCostoCommessa> = {};
  const fornitore = r.cedente?.ragione_sociale?.trim();
  const riga = r.righe?.find((x) => x?.descrizione?.trim())?.descrizione?.trim();
  const descrizione = riga && (r.righe?.length ?? 0) === 1 ? riga : fornitore ? `${riga ? `${riga} – ` : ""}${fornitore}` : riga;
  if (descrizione) out.descrizione = descrizione.slice(0, 200);
  const totale = Number(r.totale_documento);
  if (Number.isFinite(totale) && totale > 0) out.importo = importoIt(Math.abs(totale));
  const aliquota = aliquotaLetta(r);
  if (aliquota != null) out.aliquotaIva = aliquota;
  const d = data(r.data_fattura);
  if (d) out.data = d;
  const s = data(r.data_scadenza);
  if (s) out.scadenza = s;
  // Un numero di fattura e una partita IVA: è una fattura vera, quindi non «senza fattura».
  if (r.numero_fattura && r.cedente?.piva) out.senzaFattura = false;
  const note = [r.numero_fattura ? `Documento n. ${r.numero_fattura}` : null, fornitore].filter(Boolean).join(" · ");
  if (note) out.note = note.slice(0, 200);
  return out;
}

/** Importo scritto con IVA esclusa → lordo da salvare (il modulo ragiona sempre IVA compresa). */
export function lordoDaNetto(netto: number, aliquota: number): number {
  return Math.round(netto * (1 + aliquota / 100) * 100) / 100;
}

/** Partita IVA confrontabile: senza prefisso paese e spazi. */
export const pivaPulita = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/^IT/, "").replace(/\s+/g, "");
