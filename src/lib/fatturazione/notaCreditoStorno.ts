/**
 * Quale fattura storna una nota di credito ricevuta (04/11/2026, caso F di docs/flussi-acquisti-pagamenti.md).
 *
 * Qui si PROPONE soltanto: il collegamento lo conferma sempre una persona (nota_credito_collega). Una fattura si
 * propone solo se il riferimento dell'XML ne indica una e una sola dello stesso fornitore; negli altri casi resta
 * da scegliere a mano, e si dice perché. Mai una fattura incerta già selezionata.
 */
import { leggiFatturaRicevuta, type RiferimentoFattura } from "../../../supabase/functions/_shared/fatturaRicevutaXml";
import type { LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

export interface FatturaCandidata {
  id: string;
  numero_fattura: string | null;
  data_fattura: string | null;
  totale_documento: number | string | null;
  stato?: string | null;
  storico_esterno?: boolean | null;
  company_cost_id?: string | null;
  /** Rate ancora aperte. */
  aperto?: number | string | null;
  /** Già stornato da altre note. */
  stornato?: number | string | null;
}

export interface Proposta {
  fatturaId: string;
  importo: number;
}

export interface RiferimentoIrrisolto {
  riferimento: RiferimentoFattura;
  motivo: "non_trovata" | "piu_fatture";
  /** Con «piu_fatture»: tra quali scegliere. */
  candidati: string[];
}

const cent = (v: number | string | null | undefined) => Math.round(Math.abs(Number(v) || 0) * 100);

/** I riferimenti scritti nell'XML della nota, oppure nessuno se il file manca o non si legge. */
export function riferimentiDaXml(xml: string | null | undefined, parser: LettoreXml, indiceCorpo = 0): RiferimentoFattura[] {
  if (!xml) return [];
  return leggiFatturaRicevuta(xml, parser, indiceCorpo)?.fatture_collegate ?? [];
}

/**
 * Il numero com'è, senza quello che cambia solo la grafia: spazi e maiuscole, e le parole davanti che alcuni
 * programmi scrivono nel campo («FATTURA nr. 20/2026»). Gli zeri restano: 0012 e 12 possono essere fatture diverse.
 */
export function numeroNormalizzato(numero: string | null | undefined): string {
  return (numero ?? "")
    .toUpperCase()
    .replace(/^\s*(?:FATTURA|FATT\.?|FT\.?)?\s*(?:N(?:R|UM|UMERO)?\s*[.°:]?)?\s+(?=\S)/, "")
    .replace(/\s+/g, "");
}

/** Quanto si può ancora stornare su questa fattura. */
export function capienza(f: FatturaCandidata): number {
  return Math.max(0, cent(f.totale_documento) - cent(f.stornato)) / 100;
}

/**
 * Da riferimenti e candidate alle proposte. Stesso numero e, se ce n'è più d'una, stessa data. La data della nota
 * esclude le fatture successive: una nota non storna ciò che non esiste ancora. Gli importi coprono la nota nell'ordine
 * dei riferimenti, fino a quanto ogni fattura può ricevere.
 */
export function proponiStorno(
  riferimenti: RiferimentoFattura[],
  candidate: FatturaCandidata[],
  nota: { importo: number; data?: string | null },
): { proposte: Proposta[]; irrisolti: RiferimentoIrrisolto[] } {
  const proposte: Proposta[] = [];
  const irrisolti: RiferimentoIrrisolto[] = [];
  let resto = Math.round(Math.abs(nota.importo) * 100);
  const prese = new Set<string>();
  for (const riferimento of riferimenti) {
    const chiave = numeroNormalizzato(riferimento.numero);
    let trovate = candidate.filter((c) => chiave !== "" && numeroNormalizzato(c.numero_fattura) === chiave && !prese.has(c.id));
    if (trovate.length > 1 && nota.data) {
      const prima = trovate.filter((c) => !c.data_fattura || c.data_fattura <= nota.data!);
      if (prima.length > 0) trovate = prima;
    }
    if (trovate.length > 1 && riferimento.data) {
      const stessaData = trovate.filter((c) => c.data_fattura === riferimento.data);
      if (stessaData.length > 0) trovate = stessaData;
    }
    if (trovate.length === 0) {
      irrisolti.push({ riferimento, motivo: "non_trovata", candidati: [] });
      continue;
    }
    if (trovate.length > 1) {
      irrisolti.push({ riferimento, motivo: "piu_fatture", candidati: trovate.map((c) => c.id) });
      continue;
    }
    const f = trovate[0];
    prese.add(f.id);
    const quota = Math.min(resto, Math.round(capienza(f) * 100));
    if (quota <= 0) continue;
    proposte.push({ fatturaId: f.id, importo: quota / 100 });
    resto -= quota;
  }
  return { proposte, irrisolti };
}

/** Il primo importo quando si sceglie a mano: quanto manca a coprire la nota, fino a quanto la fattura può ricevere. */
export function quotaIniziale(f: FatturaCandidata, importoNota: number, giaAssegnato: number): number {
  const manca = Math.max(0, Math.round((Math.abs(importoNota) - giaAssegnato) * 100));
  return Math.min(manca, Math.round(capienza(f) * 100)) / 100;
}

/** Perché le quote non si possono salvare, oppure null. Il database ricontrolla. */
export function problemaQuote(quote: { importo: number; capienza: number }[], importoNota: number): string | null {
  if (quote.length === 0) return "Scegli almeno una fattura.";
  if (quote.some((q) => !(q.importo > 0))) return "Ogni fattura ha bisogno di un importo.";
  if (quote.some((q) => Math.round(q.importo * 100) > Math.round(q.capienza * 100) + 1)) return "Un importo supera quanto resta da stornare su quella fattura.";
  const somma = quote.reduce((s, q) => s + Math.round(q.importo * 100), 0);
  if (somma > Math.round(Math.abs(importoNota) * 100) + 1) return "Gli importi superano la nota di credito.";
  return null;
}

/** Quanto vale la nota con qualunque segno: lo stesso conto di nota_credito_importo nel database. */
export function importoNotaCredito(n: { totale_documento?: number | string | null; imponibile_totale?: number | string | null; iva_totale?: number | string | null; ritenuta_importo?: number | string | null }): number {
  const base = cent(n.totale_documento) || cent(n.imponibile_totale) + cent(n.iva_totale);
  return Math.max(0, base - cent(n.ritenuta_importo)) / 100;
}

export interface StornoRiga {
  nota_id: string;
  fattura_id: string;
  importo: number | string;
  credito_residuo: number | string;
}

/** Riepilogo per le righe della pagina: cosa storna ogni nota, cosa riceve ogni fattura. */
export function riassumiStorni(righe: StornoRiga[]) {
  const perNota = new Map<string, { fatture: string[]; importo: number; credito: number }>();
  const perFattura = new Map<string, { note: string[]; importo: number }>();
  for (const r of righe) {
    const n = perNota.get(r.nota_id) ?? { fatture: [], importo: 0, credito: 0 };
    n.fatture.push(r.fattura_id);
    n.importo = (cent(n.importo) + cent(r.importo)) / 100;
    n.credito = (cent(n.credito) + cent(r.credito_residuo)) / 100;
    perNota.set(r.nota_id, n);
    const f = perFattura.get(r.fattura_id) ?? { note: [], importo: 0 };
    f.note.push(r.nota_id);
    f.importo = (cent(f.importo) + cent(r.importo)) / 100;
    perFattura.set(r.fattura_id, f);
  }
  return { perNota, perFattura };
}
