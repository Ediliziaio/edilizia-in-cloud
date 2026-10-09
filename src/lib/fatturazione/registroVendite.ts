/** Un'unica base per storico importato e documenti nativi. Nessun incasso dedotto dall'XML. */
export interface RigaVendite {
  id: string;
  origine: "nativa" | "importata";
  numero: string;
  data_emissione: string;
  tipo: string;
  stato: string;
  anagrafica_id?: string | null;
  cliente_snapshot: { ragione_sociale?: string; nome?: string; cognome?: string; partita_iva?: string; codice_fiscale?: string };
  imponibile_totale: number;
  iva_totale: number;
  totale_documento: number;
  importo_pagato: number;
  data_scadenza?: string | null;
}

const CREDITI = new Set(["TD04", "TD08", "nota_credito", "credit_note"]);
const VENDITE = new Set(["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "acconto_fattura", "acconto_parcella", "fattura_riepilogativa", "fattura_differita_b", "nota_debito", "invoice", "debit_note", "TD01", "TD02", "TD03", "TD05", "TD06", "TD07", "TD09", "TD24", "TD25"]);
export const isNotaCredito = (tipo: string | null | undefined) => CREDITI.has(tipo ?? "");
export const isTipoVendita = (tipo: string | null | undefined) => VENDITE.has(tipo ?? "") || isNotaCredito(tipo);
export const isDocumentoEmesso = (stato: string | null | undefined) => !!stato && !["bozza", "draft", "annullata", "annullato", "cancelled", "canceled", "void", "deleted"].includes(stato);
export const valoreNumerico = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
export const importoConSegno = (tipo: string | null | undefined, value: unknown) => isNotaCredito(tipo) ? -Math.abs(valoreNumerico(value)) : valoreNumerico(value);
export const nomeIntestatario = (s: RigaVendite["cliente_snapshot"]) => s.ragione_sociale?.trim() || [s.nome, s.cognome].filter(Boolean).join(" ").trim() || "Sconosciuto";
export const documentoNelRegistro = (d: RigaVendite) => isTipoVendita(d.tipo) && isDocumentoEmesso(d.stato);
const normalizza = (value?: string | null) => value?.replace(/\s/g, "").toUpperCase() || "";
export const chiaveClienteVendite = (d: RigaVendite) => {
  const s = d.cliente_snapshot;
  return normalizza(s.codice_fiscale) || normalizza(s.partita_iva) || d.anagrafica_id || `${d.origine}:${d.id}`;
};

/** Deduplica SOLO copie fiscalmente identiche: niente accorpamenti per cliente o importo. */
export function unisciRegistroVendite(native: RigaVendite[], importate: RigaVendite[]): RigaVendite[] {
  const identity = (d: RigaVendite) => {
    const cf = normalizza(d.cliente_snapshot.codice_fiscale);
    const iva = normalizza(d.cliente_snapshot.partita_iva);
    if ((!cf && !iva) || !d.numero || !d.data_emissione || !documentoNelRegistro(d)) return null;
    return JSON.stringify([normalizza(d.numero), d.data_emissione, isNotaCredito(d.tipo), cf, iva,
      ...[d.imponibile_totale, d.iva_totale, d.totale_documento].map(v => Math.round(v * 100))]);
  };
  const keys = new Set(native.map(identity).filter(Boolean));
  return [...native, ...importate.filter(d => { const key = identity(d); return !key || !keys.has(key); })];
}

/** Stabile anche quando molte righe hanno la stessa data; nessun limite silenzioso a 1000. */
export async function tutteLePagine<T>(carica: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await carica(from, from + size - 1);
    if (error) throw error;
    const rows = data ?? [];
    result.push(...rows);
    if (rows.length < size) return result;
  }
}

export function totaliVendite(docs: readonly RigaVendite[]) {
  return docs.filter(documentoNelRegistro).reduce((s, d) => ({
    imponibile: s.imponibile + Math.round(d.imponibile_totale * 100),
    iva: s.iva + Math.round(d.iva_totale * 100),
    totale: s.totale + Math.round(d.totale_documento * 100),
  }), { imponibile: 0, iva: 0, totale: 0 });
}
