import { parseDecimalITStrict } from "@/lib/parseDecimalIT";
import type { OrderItem } from "@/components/orders/OrderItemsList";

export type ModoPrezzo = "unitario" | "totale";
export interface PrezzoPreparazione {
  versione: 1;
  modo: ModoPrezzo;
  ivato: boolean;
  valore: string;
  ripartizione?: { id: string; totale: string; ivato: boolean; criterio: "valore" | "uguale" };
}
export interface RigaPreparazione {
  chiave: string;
  articolo: OrderItem;
  quantita: string;
  aliquota: string;
  prezzo: PrezzoPreparazione;
}
export interface CalcoloPreparazione {
  errore: string | null;
  daDefinire: boolean;
  prezzoNetto: number;
  netto: number;
  iva: number;
  lordo: number;
}
export const numeroCampo = (n: number) => n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const round12 = (n: number) => Number(n.toFixed(12));
const vuoto: CalcoloPreparazione = { errore: null, daDefinire: true, prezzoNetto: 0, netto: 0, iva: 0, lordo: 0 };

export function nuovaRigaPreparazione(articolo: OrderItem, chiave: string): RigaPreparazione {
  const prezzo = articolo.preparazione_prezzo;
  return { chiave, articolo, quantita: numeroCampo(articolo.quantity), aliquota: numeroCampo(articolo.vat_rate ?? 22),
    prezzo: prezzo ?? { versione: 1, modo: "unitario", ivato: false, valore: articolo.prezzo_da_definire || (articolo.purchase_price == null || (articolo.purchase_price === 0 && !articolo.prezzo_fonte)) ? "" : numeroCampo(articolo.purchase_price) } };
}

/** Le due colonne IVA dell'ODA arrotondano separatamente, come il modello SQL. */
function importi(prezzo: number, q: number, aliquota: number) {
  const netto = cents(prezzo * q);
  const iva = cents(prezzo * q * aliquota / 100);
  return { netto: netto / 100, iva: iva / 100, lordo: (netto + iva) / 100 };
}

export function calcolaPreparazione(r: RigaPreparazione): CalcoloPreparazione {
  const q = parseDecimalITStrict(r.quantita), rate = parseDecimalITStrict(r.aliquota);
  const fail = (errore: string): CalcoloPreparazione => ({ ...vuoto, errore });
  if (!Number.isFinite(q) || q <= 0 || q > 1e9 || Math.abs(q * 1e4 - Math.round(q * 1e4)) > 1e-5) return fail("Quantità positiva, con al massimo quattro decimali.");
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return fail("IVA compresa tra 0 e 100.");
  if (!r.prezzo.valore.trim()) return { ...vuoto };
  const value = parseDecimalITStrict(r.prezzo.valore);
  if (!Number.isFinite(value) || value < 0 || value > 1e9) return fail("Inserisci un prezzo valido, non negativo.");
  let prezzo = r.prezzo.modo === "unitario" ? value : value / q;
  if (r.prezzo.ivato) prezzo /= 1 + rate / 100;
  prezzo = round12(prezzo);
  // Un totale ivato deve restare esatto anche con gli arrotondamenti di riga.
  if (r.prezzo.modo === "totale" && r.prezzo.ivato && cents(importi(prezzo, q, rate).lordo) !== cents(value)) {
    let basso = Math.max(0, value / (1 + rate / 100) - 0.03), alto = value / (1 + rate / 100) + 0.03;
    let trovato = false;
    for (let i = 0; i < 60; i++) {
      const medio = (basso + alto) / 2, candidato = round12(medio / q);
      const got = cents(importi(candidato, q, rate).lordo);
      if (got === cents(value)) { prezzo = candidato; trovato = true; break; }
      if (got < cents(value)) basso = medio; else alto = medio;
    }
    if (!trovato) return fail("Questo totale ivato non è rappresentabile con l’aliquota scelta: verifica l’importo o la ripartizione.");
  }
  const totali = importi(prezzo, q, rate);
  if (r.prezzo.modo === "totale" && !r.prezzo.ivato && cents(totali.netto) !== cents(value)) return fail("La quantità richiede una precisione superiore: verifica il totale.");
  return { ...totali, prezzoNetto: prezzo, errore: null, daDefinire: false };
}

export function cambiaBaseIva(r: RigaPreparazione, ivato: boolean): RigaPreparazione {
  const c = calcolaPreparazione(r);
  if (c.errore) throw new Error(c.errore);
  if (c.daDefinire) return { ...r, prezzo: { ...r.prezzo, ivato } };
  const valore = r.prezzo.modo === "totale" ? (ivato ? c.lordo : c.netto) : c.prezzoNetto * (ivato ? 1 + parseDecimalITStrict(r.aliquota) / 100 : 1);
  return { ...r, prezzo: { ...r.prezzo, ivato, valore: numeroCampo(valore) } };
}

/** Ripartisce centesimi e assegna i resti in modo stabile. Nessuna somma fra kg e pezzi. */
export function ripartisciPreparazione(righe: RigaPreparazione[], totale: string, ivato: boolean, criterio: "valore" | "uguale", id: string): RigaPreparazione[] {
  const value = parseDecimalITStrict(totale);
  if (!righe.length || !Number.isFinite(value) || value < 0 || value > 1e9) throw new Error("Scrivi un totale fornitura valido.");
  const calcoli = righe.map(calcolaPreparazione);
  if (calcoli.some(c => c.errore)) throw new Error("Correggi quantità, IVA e prezzi prima della ripartizione.");
  const pesi = criterio === "valore" ? calcoli.map(c => ivato ? c.lordo : c.netto) : righe.map(() => 1);
  if (criterio === "valore" && (calcoli.some(c => c.daDefinire) || pesi.some(p => p <= 0))) throw new Error("Per ripartire in proporzione servono prezzi conosciuti e positivi su tutte le righe. Puoi scegliere quote uguali per riga.");
  const somma = pesi.reduce((a,b) => a+b,0), target = cents(value);
  const quote = pesi.map((peso, indice) => ({ indice, quota: Math.floor(target * peso / somma), resto: target * peso / somma % 1 }));
  let mancanti = target - quote.reduce((n,r) => n+r.quota,0);
  for (const r of [...quote].sort((a,b) => b.resto-a.resto || a.indice-b.indice)) { if (mancanti-- <= 0) break; r.quota++; }
  return righe.map((r,i) => {
    const dopo: RigaPreparazione = { ...r, prezzo: { versione: 1, modo: "totale", ivato, valore: numeroCampo(quote[i].quota / 100), ripartizione: { id, totale, ivato, criterio } } };
    const c = calcolaPreparazione(dopo);
    if (c.errore) throw new Error(`${r.articolo.name}: ${c.errore}`);
    return dopo;
  });
}

export function articoloDaPreparazione(r: RigaPreparazione): OrderItem {
  const c = calcolaPreparazione(r);
  if (!r.articolo.name.trim()) throw new Error("Scrivi il nome di ogni articolo.");
  if (c.errore) throw new Error(`${r.articolo.name}: ${c.errore}`);
  return { ...r.articolo, name: r.articolo.name.trim(), quantity: parseDecimalITStrict(r.quantita), vat_rate: parseDecimalITStrict(r.aliquota),
    purchase_price: c.prezzoNetto, costo_stimato_iniziale: c.daDefinire ? null : c.prezzoNetto,
    prezzo_da_definire: c.daDefinire, prezzo_fonte: c.daDefinire ? null : r.prezzo.ripartizione ? "manuale" : r.articolo.prezzo_fonte ?? "manuale",
    origine_materiale: "manuale", preparazione_prezzo: r.prezzo,
  };
}

export function fontePrezzoArticolo(a: Pick<OrderItem, "stock_item_id" | "ddt_riga_origine_id" | "prezzo_fonte">): string {
  if (a.ddt_riga_origine_id) return "DDT / fattura collegata";
  if (a.stock_item_id) return "Magazzino";
  if (a.prezzo_fonte === "ordine") return "ODA";
  if (a.prezzo_fonte === "offerta") return "Offerta aggiudicata";
  return a.prezzo_fonte === "listino" ? "Stima da listino" : a.prezzo_fonte === "ultimo_acquisto" ? "Ultimo acquisto" : "Stima di preparazione";
}

/** Il formato ODA corrente salva quattro decimali: mai perdere centesimi in silenzio. */
export function errorePrecisioneOda(prezzo: number, quantita: number, iva: number): string | null {
  if (Math.abs(quantita * 1e3 - Math.round(quantita * 1e3)) > 1e-6) return "La quantità richiede più dei tre decimali previsti dall’ODA attuale: verifica la quantità prima di creare l’ordine.";
  if (Math.abs(iva * 100 - Math.round(iva * 100)) > 1e-6) return "L’aliquota richiede più dei due decimali previsti dall’ODA attuale: verifica l’IVA prima di creare l’ordine.";
  const salvato = Math.round(prezzo * 1e4) / 1e4;
  const a = importi(prezzo,quantita,iva), b = importi(salvato,quantita,iva);
  return a.netto !== b.netto || a.iva !== b.iva ? "Il prezzo richiede più dei quattro decimali previsti dall’ODA attuale: verifica la valorizzazione prima di creare l’ordine." : null;
}
