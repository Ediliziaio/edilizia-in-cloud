/**
 * Un movimento della Prima Nota diviso in quote (23/11/2026): un bonifico che incassa più
 * fatture emesse, una RiBa che paga più fatture di un fornitore, una spesa su più commesse.
 * Qui solo i conti: somme, residui, la combinazione che fa l'importo esatto. Il salvataggio
 * è uno solo, tutto o niente: prima_nota_registra_divisa.
 */

import { ritenutaSuLordo } from "@/lib/orders/bonusFiscali";

export type TipoDocumentoAperto = "fattura_ricevuta" | "documento" | "invoice" | "nota_credito";

/** Una riga di prima_nota_documenti_aperti. */
export interface DocumentoAperto {
  tipo: TipoDocumentoAperto;
  id: string;
  numero: string | null;
  data: string | null;
  controparte: string | null;
  totale: number | null;
  residuo: number;
  order_id: string | null;
  order_code: string | null;
}

/** Una riga di prima_nota_dipendenti: chi pagare quel mese e quanto proporre. */
export interface DipendenteDaPagare {
  id: string;
  nome: string;
  /** Netto del cedolino del mese, altrimenti della scheda; null a chi non vede le paghe. */
  netto_proposto: number | null;
  origine: "cedolino" | "scheda" | null;
  cedolino_id: string | null;
  pagato_il: string | null;
}

export type Quota =
  | {
    chiave: string; tipo: Exclude<TipoDocumentoAperto, "nota_credito">; documento: DocumentoAperto; importo: string;
    /** Bonifico parlante (solo fatture fatte con l'app): in banca arriva il netto, la fattura si salda per il lordo. */
    ritenuta?: boolean; lordo?: string;
  }
  /** Una nota di credito del fornitore che riduce una fattura pagata con lo stesso movimento: non è denaro. */
  | { chiave: string; tipo: "nota_credito"; documento: DocumentoAperto; fatturaChiave: string | null; importo: string }
  | { chiave: string; tipo: "dipendente"; dipendente: Pick<DipendenteDaPagare, "id" | "nome" | "origine">; anno: number; mese: number; importo: string }
  /** Una riga dell'F24 del mese (il versamento con la quietanza si registra nel modulo F24). */
  | { chiave: string; tipo: "f24"; f24: { id: string; descrizione: string }; importo: string }
  | { chiave: string; tipo: "libera"; categoria: string; orderId: string | null; descrizione: string; importo: string };

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Il mese degli stipendi che si pagano oggi: quello prima (lo stipendio di ottobre si paga a novembre). */
export function meseStipendi(oggi: Date = new Date()): { anno: number; mese: number } {
  const m = oggi.getMonth(); // 0 = gennaio
  return m === 0 ? { anno: oggi.getFullYear() - 1, mese: 12 } : { anno: oggi.getFullYear(), mese: m };
}

export const centesimi = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const daCentesimi = (c: number) => (c / 100).toFixed(2);

export function chiaveDocumento(d: Pick<DocumentoAperto, "tipo" | "id">) { return `${d.tipo}:${d.id}`; }

/** La ritenuta dell'11% su un bonifico parlante di quel lordo, e il netto che arriva in banca. */
export function nettoBonificoParlante(lordo: string | number) {
  const l = centesimi(lordo) / 100;
  const ritenuta = ritenutaSuLordo(l);
  return { ritenuta, netto: Math.round((l - ritenuta) * 100) / 100 };
}

/** Quanto è stato assegnato e quanto manca (in centesimi; negativo = assegnato troppo). Le note di credito non sono denaro. */
export function bilancio(totale: string | number, quote: Quota[]) {
  const assegnato = quote.reduce((s, q) => s + (q.tipo === "nota_credito" ? 0 : centesimi(q.importo)), 0);
  return { totale: centesimi(totale), assegnato, mancano: centesimi(totale) - assegnato };
}

/** L'importo che una quota nuova propone: il residuo, o quello che manca se è meno (un acconto). */
export function importoProposto(residuo: number, mancano: number): string {
  const r = centesimi(residuo);
  return daCentesimi(mancano > 0 && mancano < r ? mancano : r);
}

/** Il primo problema che impedisce di salvare, detto in parole; null se si può salvare. */
export function problemaQuote(totale: string | number, quote: Quota[]): string | null {
  if (!quote.length) return "Aggiungi almeno una fattura o una voce.";
  for (const q of quote) {
    const c = centesimi(q.importo);
    const nome = q.tipo === "libera" ? (q.descrizione.trim() || "una voce senza fattura")
      : q.tipo === "dipendente" ? `lo stipendio di ${q.dipendente.nome}`
      : q.tipo === "f24" ? `l'F24 ${q.f24.descrizione}`
      : q.tipo === "nota_credito" ? `la nota di credito ${q.documento.numero ?? ""}`.trim()
      : `la fattura ${q.documento.numero ?? ""}`.trim();
    if (c <= 0) return `Manca l'importo per ${nome}.`;
    if (q.tipo === "nota_credito") {
      if (!q.fatturaChiave || !quote.some(x => x.chiave === q.fatturaChiave)) return `Scegli la fattura su cui va ${nome}.`;
      if (c > centesimi(q.documento.residuo)) return `Per ${nome} l'importo supera la nota.`;
      continue;
    }
    if ((q.tipo === "documento" || q.tipo === "invoice" || q.tipo === "fattura_ricevuta") && q.ritenuta) {
      if (centesimi(q.lordo) <= c) return `Per ${nome} indica il lordo saldato.`;
      if (centesimi(q.lordo) > centesimi(q.documento.residuo)) return `Per ${nome} il lordo supera il residuo.`;
      continue;
    }
    if (q.tipo === "f24") continue;
    if (q.tipo !== "libera" && q.tipo !== "dipendente" && c > centesimi(q.documento.residuo)) return `Per ${nome} l'importo supera il residuo.`;
    if (q.tipo === "libera" && !q.categoria) return `Scegli la categoria per ${nome}.`;
  }
  const { mancano } = bilancio(totale, quote);
  if (mancano > 0) return `Mancano ${euro(mancano / 100)} da assegnare.`;
  if (mancano < 0) return `Le quote superano il movimento di ${euro(-mancano / 100)}.`;
  return null;
}

export const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

/** Cerca per controparte o numero, ignorando maiuscole e accenti. */
export function filtraDocumenti(documenti: DocumentoAperto[], testo: string, esclusi: Set<string>, limite = 30): DocumentoAperto[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const parole = norm(testo).split(/\s+/).filter(Boolean);
  return documenti
    .filter(d => !esclusi.has(chiaveDocumento(d)))
    .filter(d => { const t = norm(`${d.controparte ?? ""} ${d.numero ?? ""} ${d.order_code ?? ""}`); return parole.every(p => t.includes(p)); })
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
    .slice(0, limite);
}

/**
 * Fatture della stessa controparte che insieme fanno esattamente l'importo, col residuo pieno.
 * Si cerca per controparte (è il caso vero: un cliente paga più fatture con un bonifico) e solo
 * fra le controparti con al massimo 20 fatture aperte; al massimo 3 proposte, la più vecchia prima.
 */
export function combinazioniEsatte(documenti: DocumentoAperto[], importo: string | number, esclusi: Set<string> = new Set()): DocumentoAperto[][] {
  const obiettivo = centesimi(importo);
  if (obiettivo <= 0) return [];
  const perControparte = new Map<string, DocumentoAperto[]>();
  for (const d of documenti) {
    if (d.tipo === "nota_credito" || esclusi.has(chiaveDocumento(d)) || centesimi(d.residuo) <= 0) continue;
    const k = (d.controparte ?? "").trim().toLowerCase();
    if (!k) continue;
    perControparte.set(k, [...(perControparte.get(k) ?? []), d]);
  }
  const trovate: DocumentoAperto[][] = [];
  for (const gruppo of perControparte.values()) {
    if (gruppo.length > 20) continue;
    const ordinati = [...gruppo].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
    const valori = ordinati.map(d => centesimi(d.residuo));
    // Somme rimaste dopo ogni posizione: taglia i rami che non possono più arrivare.
    const coda = valori.map((_, i) => valori.slice(i).reduce((s, v) => s + v, 0));
    let soluzione: number[] | null = null;
    let passi = 0;
    const cerca = (i: number, somma: number, scelti: number[]) => {
      if (soluzione || ++passi > 200_000) return;
      if (somma === obiettivo) { soluzione = [...scelti]; return; }
      if (i >= valori.length || somma > obiettivo || somma + coda[i] < obiettivo) return;
      scelti.push(i); cerca(i + 1, somma + valori[i], scelti); scelti.pop();
      cerca(i + 1, somma, scelti);
    };
    cerca(0, 0, []);
    if (soluzione) trovate.push((soluzione as number[]).map(i => ordinati[i]));
    if (trovate.length >= 3) break;
  }
  // Prima le proposte con meno fatture: sono quelle più probabili.
  return trovate.sort((a, b) => a.length - b.length);
}

/** Il corpo per prima_nota_registra_divisa. */
export function quotePerServer(quote: Quota[]) {
  return quote.map(q => {
    const importo = Number(daCentesimi(centesimi(q.importo)));
    if (q.tipo === "libera") return { tipo: "libera", importo, categoria: q.categoria, order_id: q.orderId, descrizione: q.descrizione.trim() || null };
    if (q.tipo === "dipendente") return { tipo: "dipendente", id: q.dipendente.id, anno: q.anno, mese: q.mese, importo };
    if (q.tipo === "f24") return { tipo: "f24", id: q.f24.id, importo };
    if (q.tipo === "nota_credito") {
      const fattura = quote.find(x => x.chiave === q.fatturaChiave);
      return { tipo: "nota_credito", id: q.documento.id, fattura_id: fattura && "documento" in fattura ? fattura.documento.id : null, importo };
    }
    if (q.ritenuta) return { tipo: q.tipo, id: q.documento.id, importo, ritenuta: true, lordo: Number(daCentesimi(centesimi(q.lordo))) };
    return { tipo: q.tipo, id: q.documento.id, importo };
  });
}

export const ETICHETTA_TIPO: Record<TipoDocumentoAperto, string> = {
  fattura_ricevuta: "Fattura ricevuta",
  documento: "Fattura emessa",
  invoice: "Fattura emessa",
  nota_credito: "Nota di credito",
};
