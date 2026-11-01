/**
 * Il pagamento di una fattura ricevuta, da mostrare (01/11/2026): rate con scadenza e metodo, e le
 * voci che cambiano quanto si paga al fornitore — ritenuta d'acconto (si versa con F24), trattenuta a
 * garanzia (si paga allo svincolo) — più cassa previdenziale e bollo. Le colonne le riempie il database
 * dall'XML, o l'import da Fatture in Cloud.
 */

const METODI: Record<string, string> = {
  MP01: "Contanti", MP02: "Assegno", MP03: "Assegno circolare", MP04: "Contanti presso Tesoreria",
  MP05: "Bonifico", MP06: "Vaglia cambiario", MP07: "Bollettino bancario", MP08: "Carta di pagamento",
  MP09: "RID", MP10: "RID utenze", MP11: "RID veloce", MP12: "RiBa", MP13: "MAV",
  MP14: "Quietanza erario", MP15: "Giroconto", MP16: "Domiciliazione bancaria", MP17: "Domiciliazione postale",
  MP18: "Bollettino postale", MP19: "SEPA Direct Debit", MP20: "SEPA Direct Debit CORE", MP21: "SEPA Direct Debit B2B",
  MP22: "Trattenuta su somme già riscosse", MP23: "PagoPA",
};
export const etichettaModalitaPagamento = (mp: unknown): string | null =>
  typeof mp === "string" && mp ? METODI[mp] ?? mp : null;

const CONDIZIONI: Record<string, string> = { TP01: "a rate", TP02: "pagamento completo", TP03: "anticipo" };

export interface RataDaMostrare { scadenza: string | null; importo: number | null; metodo: string | null; pagataIl: string | null }
export interface PagamentoDaMostrare {
  rate: RataDaMostrare[];
  condizioni: string | null;
  ritenuta: { importo: number; aliquota: number | null } | null;
  cassa: number | null;
  bollo: number | null;
  garanzia: number | null;
  netto: number | null;
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function pagamentoDaMostrare(f: Record<string, unknown> | null | undefined): PagamentoDaMostrare | null {
  if (!f) return null;
  const piano = Array.isArray(f.piano_pagamento) ? (f.piano_pagamento as Record<string, unknown>[]) : [];
  const rate = piano.map((r) => ({
    scadenza: typeof r.scadenza === "string" ? r.scadenza : null,
    importo: num(r.importo),
    metodo: etichettaModalitaPagamento(r.modalita),
    pagataIl: typeof r.pagata_il === "string" ? r.pagata_il : null,
  }));
  const ritenuta = num(f.ritenuta_importo);
  const out: PagamentoDaMostrare = {
    rate,
    condizioni: typeof f.condizioni_pagamento === "string" ? CONDIZIONI[f.condizioni_pagamento] ?? null : null,
    ritenuta: ritenuta && ritenuta > 0 ? { importo: ritenuta, aliquota: num(f.ritenuta_aliquota) } : null,
    cassa: num(f.cassa_previdenziale),
    bollo: num(f.bollo_importo),
    garanzia: num(f.trattenuta_garanzia),
    netto: num(f.netto_a_pagare),
  };
  const vuoto = !rate.length && !out.ritenuta && !out.cassa && !out.bollo && !out.garanzia;
  return vuoto ? null : out;
}
