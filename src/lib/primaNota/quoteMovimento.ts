/**
 * Un movimento della Prima Nota diviso in quote (23/11/2026): un bonifico che incassa più
 * fatture emesse, una RiBa che paga più fatture di un fornitore, una spesa su più commesse.
 * Qui solo i conti: somme, residui, la combinazione che fa l'importo esatto. Il salvataggio
 * è uno solo, tutto o niente: prima_nota_registra_divisa.
 */

export type TipoDocumentoAperto = "fattura_ricevuta" | "documento" | "invoice";

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

export type Quota =
  | { chiave: string; tipo: TipoDocumentoAperto; documento: DocumentoAperto; importo: string }
  | { chiave: string; tipo: "libera"; categoria: string; orderId: string | null; descrizione: string; importo: string };

export const centesimi = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const daCentesimi = (c: number) => (c / 100).toFixed(2);

export function chiaveDocumento(d: Pick<DocumentoAperto, "tipo" | "id">) { return `${d.tipo}:${d.id}`; }

/** Quanto è stato assegnato e quanto manca (in centesimi; negativo = assegnato troppo). */
export function bilancio(totale: string | number, quote: Quota[]) {
  const assegnato = quote.reduce((s, q) => s + centesimi(q.importo), 0);
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
    const nome = q.tipo === "libera" ? (q.descrizione.trim() || "una voce senza fattura") : `la fattura ${q.documento.numero ?? ""}`.trim();
    if (c <= 0) return `Manca l'importo per ${nome}.`;
    if (q.tipo !== "libera" && c > centesimi(q.documento.residuo)) return `Per ${nome} l'importo supera il residuo.`;
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
    if (esclusi.has(chiaveDocumento(d)) || centesimi(d.residuo) <= 0) continue;
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
  return quote.map(q => q.tipo === "libera"
    ? { tipo: "libera", importo: Number(daCentesimi(centesimi(q.importo))), categoria: q.categoria, order_id: q.orderId, descrizione: q.descrizione.trim() || null }
    : { tipo: q.tipo, id: q.documento.id, importo: Number(daCentesimi(centesimi(q.importo))) });
}

export const ETICHETTA_TIPO: Record<TipoDocumentoAperto, string> = {
  fattura_ricevuta: "Fattura ricevuta",
  documento: "Fattura emessa",
  invoice: "Fattura emessa",
};
