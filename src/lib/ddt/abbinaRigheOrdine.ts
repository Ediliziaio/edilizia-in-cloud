/**
 * Quale riga dell'ordine consegna ogni riga della bolla. Regole fisse, nessuna AI: codice,
 * misure, parole della descrizione, quantità. Si abbina da solo solo ciò che è chiaro;
 * il resto lo sceglie una persona, ed è meglio una riga da scegliere che una sbagliata.
 */
import { misureNelTesto, parole } from "@/lib/arrivi/arrivoPosizioni";

export interface RigaBollaDaAbbinare {
  id: string;
  codice_articolo: string | null;
  descrizione: string;
  quantita: number | null;
  purchase_order_item_id?: string | null;
  abbinamento?: "auto" | "manuale" | null;
}

export interface RigaOrdine {
  id: string;
  description: string | null;
  sku: string | null;
  unit_of_measure: string | null;
  quantity: number;
  quantity_received: number | null;
  /** Una bolla può consegnare più ordini: ogni riga sa di quale è. */
  purchase_order_id?: string | null;
  oda_number?: string | null;
  riferimento?: string | null;
  misure?: Record<string, number> | null;
}

const SOGLIA = 5;
const STACCO = 2;

const pulito = (t: string | null | undefined) => (t ?? "").trim().toLowerCase();

export function punteggioAbbinamento(riga: RigaBollaDaAbbinare, ordine: RigaOrdine): number {
  let punti = 0;
  const codice = pulito(riga.codice_articolo);
  if (codice && codice === pulito(ordine.sku)) punti += 8;

  const lette = misureNelTesto(riga.descrizione);
  const l = ordine.misure?.larghezza ?? ordine.misure?.larghezza_mm;
  const h = ordine.misure?.altezza ?? ordine.misure?.altezza_mm;
  if (lette && l && h) punti += Math.abs(lette[0] - l) <= 5 && Math.abs(lette[1] - h) <= 5 ? 6 : -4;

  const rif = pulito(ordine.riferimento);
  const dellaRiga = parole(riga.descrizione);
  if (rif.length >= 3 && [...parole(rif)].every((p) => dellaRiga.has(p))) punti += 3;

  const dellOrdine = parole(ordine.description);
  const comuni = [...dellaRiga].filter((p) => dellOrdine.has(p)).length;
  const quota = comuni / Math.max(1, Math.min(dellaRiga.size, dellOrdine.size));
  if (comuni >= 2 && quota >= 0.75) punti += 5;
  else if (comuni >= 2 && quota >= 0.5) punti += 3;
  else if (comuni >= 1) punti += 1;

  if (riga.quantita != null && Number(riga.quantita) === Number(ordine.quantity)) punti += 1;
  return punti;
}

/**
 * Le righe abbinabili con certezza: rigaBolla → rigaOrdine. Non tocca chi è già abbinato né
 * chi una persona ha già deciso. Se due candidati si equivalgono non sceglie.
 */
export function abbinamentiCerti(righe: RigaBollaDaAbbinare[], ordine: RigaOrdine[]): Record<string, string> {
  const occupate = new Set(righe.map((r) => r.purchase_order_item_id).filter(Boolean));
  const libere = righe.filter((r) => !r.purchase_order_item_id && r.abbinamento !== "manuale");
  const disponibili = ordine.filter((o) => !occupate.has(o.id));
  const esito: Record<string, string> = {};

  const candidati = libere.flatMap((r) => {
    const classifica = disponibili
      .map((o) => ({ o: o.id, punti: punteggioAbbinamento(r, o) }))
      .sort((a, b) => b.punti - a.punti);
    const primo = classifica[0];
    if (!primo || primo.punti < SOGLIA) return [];
    if (classifica[1] && primo.punti - classifica[1].punti < STACCO) return [];
    return [{ r: r.id, o: primo.o, punti: primo.punti }];
  });

  // Due righe della bolla sulla stessa riga dell'ordine: si tiene la più sicura, se c'è.
  const usate = new Set<string>();
  candidati.sort((a, b) => b.punti - a.punti);
  candidati.forEach((c, i) => {
    if (usate.has(c.o)) return;
    const pari = candidati.find((x, j) => j !== i && x.o === c.o && x.punti === c.punti);
    usate.add(c.o);
    if (!pari) esito[c.r] = c.o;
  });
  return esito;
}

/**
 * Una bolla, più ordini. Prima l'ordine collegato alla bolla, poi gli altri aperti dello stesso
 * fornitore: lì lo stesso articolo su due ordini risulta pari e lo decide una persona.
 */
export function abbinamentiCertiPiuOrdini(
  righe: RigaBollaDaAbbinare[],
  ordine: RigaOrdine[],
  ordineDellaBolla: string | null | undefined,
): Record<string, string> {
  const principali = ordine.filter((o) => o.purchase_order_id === ordineDellaBolla);
  const primi = abbinamentiCerti(righe, principali);
  const dopo = righe.map((r) => (primi[r.id] ? { ...r, purchase_order_item_id: primi[r.id] } : r));
  // Se l'articolo sta anche nell'ordine della bolla ma non era chiaro, non si cerca altrove.
  const incerte = new Set(dopo.filter((r) => !r.purchase_order_item_id && principali.some((o) => punteggioAbbinamento(r, o) >= SOGLIA)).map((r) => r.id));
  const altri = ordine.filter((o) => o.purchase_order_id !== ordineDellaBolla);
  const secondi = abbinamentiCerti(dopo.filter((r) => !incerte.has(r.id)), altri);
  return { ...primi, ...secondi };
}

/** Gli ordini che questa bolla tocca: quello collegato e quelli delle righe abbinate. */
export function ordiniDellaBolla(
  righe: RigaBollaDaAbbinare[],
  ordine: RigaOrdine[],
  ordineDellaBolla: string | null | undefined,
): Array<{ id: string; numero: string | null }> {
  const collegate = new Set(righe.map((r) => r.purchase_order_item_id).filter(Boolean));
  const visti = new Map<string, string | null>();
  for (const o of ordine) {
    if (!o.purchase_order_id) continue;
    if (o.purchase_order_id === ordineDellaBolla || collegate.has(o.id)) visti.set(o.purchase_order_id, o.oda_number ?? null);
  }
  return [...visti].map(([id, numero]) => ({ id, numero }));
}

/** Le righe dell'ordine dalla più probabile: è l'ordine della tendina. */
export function righeOrdinePerRiga(riga: RigaBollaDaAbbinare, ordine: RigaOrdine[]): RigaOrdine[] {
  return [...ordine].sort((a, b) => punteggioAbbinamento(riga, b) - punteggioAbbinamento(riga, a));
}

/** Ciò che nell'ordine manca ancora e questa bolla non consegna: una consegna parziale è normale. */
export function ordinateNonInBolla(righe: RigaBollaDaAbbinare[], ordine: RigaOrdine[], ordineDellaBolla?: string | null): RigaOrdine[] {
  const inBolla = new Set(righe.map((r) => r.purchase_order_item_id).filter(Boolean));
  // Solo gli ordini che la bolla tocca: gli altri ordini aperti del fornitore non c'entrano.
  const toccati = new Set(ordine.filter((o) => inBolla.has(o.id)).map((o) => o.purchase_order_id));
  if (ordineDellaBolla) toccati.add(ordineDellaBolla);
  const senzaOrdini = ordine.every((o) => !o.purchase_order_id);
  return ordine.filter((o) => (senzaOrdini || toccati.has(o.purchase_order_id)) && !inBolla.has(o.id) && Number(o.quantity_received ?? 0) < Number(o.quantity));
}
