/**
 * Quanto di ogni articolo della commessa è stato posato, e su quali fasi.
 *
 * L'articolo è l'acquisto (10 sacchi di cemento, una riga d'ordine); le fasi
 * su cui si usa le dice il cantiere, nei rapportini: ogni materiale usato
 * porta l'articolo (`order_item_id`) e la fase (`fase_id`). Così lo stesso
 * articolo si usa su più fasi senza dividere la riga, e il costo va a ogni
 * fase per la parte che ha consumato.
 *
 * Una riga «a corpo» (Cementi, malte e rasanti) raccoglie spesso più prodotti
 * di magazzino: ogni materiale del rapportino porta anche il suo
 * `stock_item_id`. Cemento, malta e rasante non si sommano tra loro: conta
 * come posato dell'articolo solo il materiale senza prodotto o con lo stesso
 * prodotto dell'articolo; gli altri sono i suoi componenti, uno per uno.
 *
 * Contano solo i rapportini approvati. Le quantità si confrontano con quella
 * dell'articolo solo nella stessa unità: un articolo «a corpo» posato a sacchi
 * dice quanti sacchi, non «8 di 10». Quello che non è stato posato si rimanda
 * in magazzino (rientro della commessa) e non pesa sul costo.
 */
import { normalizzaUnita } from "./generaDistinta";

export interface RapportinoConMateriali {
  stato: string | null;
  materiali_usati: unknown;
}

export interface ConsumoArticolo {
  /** Posati nell'unità dell'articolo (solo le righe nella stessa unità). */
  posati: number;
  /** Posati per fase (null = senza fase), nell'unità dell'articolo. */
  perFase: Map<string | null, number>;
  /** Righe in un'unità diversa da quella dell'articolo: si mostrano, non si confrontano. */
  altreUnita: Map<string, number>;
  /** Prodotti di magazzino diversi raccolti sotto l'articolo: nome → quantità e unità. */
  componenti: Map<string, { quantita: number; unita: string }>;
  /** Quanti rapportini approvati lo citano. */
  rapportini: number;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !/^\s*\d+(?:[.,]\d+)?\s*$/.test(v)) return null;
  return Number(v.replace(",", "."));
};

const arrotonda = (n: number) => Math.round(n * 10000) / 10000;

/** Le unità di confezione che il campo scrive al plurale: «sacchi» è «sacco». */
const SINGOLARE: Record<string, string> = { sacchi: "sacco", confezioni: "confezione", rotoli: "rotolo", secchi: "secchio", bancali: "bancale", "m²": "mq", "m³": "mc" };
const unita = (u: string | null | undefined) => { const n = normalizzaUnita(u); return normalizzaUnita(SINGOLARE[n] ?? n); };

/** «a corpo» non si misura: con quella unità non c'è una quantità da confrontare. */
const misurabile = (u: string) => u !== "a corpo";

export interface ArticoloPerConsumi {
  unita: string | null | undefined;
  /** Il prodotto di magazzino dell'articolo, se ne ha uno. */
  stock?: string | null;
}

export function consumiPerArticolo(
  rapportini: RapportinoConMateriali[],
  articoli: Map<string, string | null | undefined | ArticoloPerConsumi>,
): Map<string, ConsumoArticolo> {
  const art = (id: string): ArticoloPerConsumi => {
    const a = articoli.get(id);
    return a && typeof a === "object" ? a : { unita: a as string | null | undefined };
  };
  const out = new Map<string, ConsumoArticolo>();
  for (const r of rapportini) {
    if (r.stato !== "approvato" || !Array.isArray(r.materiali_usati)) continue;
    const citati = new Set<string>();
    for (const e of r.materiali_usati as Record<string, unknown>[]) {
      const id = typeof e?.order_item_id === "string" ? e.order_item_id : null;
      const q = numero(e?.quantita);
      if (!id || !articoli.has(id) || q == null || q <= 0) continue;
      let c = out.get(id);
      if (!c) { c = { posati: 0, perFase: new Map(), altreUnita: new Map(), componenti: new Map(), rapportini: 0 }; out.set(id, c); }
      citati.add(id);
      const a = art(id);
      const ua = unita(a.unita);
      const ur = typeof e.unita === "string" && e.unita.trim() ? unita(e.unita) : ua;
      const prodotto = typeof e.stock_item_id === "string" && e.stock_item_id ? e.stock_item_id : null;
      if (prodotto && prodotto !== (a.stock ?? null)) {
        const nome = typeof e.nome === "string" && e.nome.trim() ? e.nome.replace(/^DEMO · /, "").trim() : "Altro materiale";
        const k = `${nome}|${ur}`;
        const prima = c.componenti.get(k);
        c.componenti.set(k, { quantita: arrotonda((prima?.quantita ?? 0) + q), unita: ur });
        continue;
      }
      if (ur === ua && misurabile(ua)) {
        const fase = typeof e.fase_id === "string" && e.fase_id ? e.fase_id : null;
        c.posati = arrotonda(c.posati + q);
        c.perFase.set(fase, arrotonda((c.perFase.get(fase) ?? 0) + q));
      } else {
        c.altreUnita.set(ur, arrotonda((c.altreUnita.get(ur) ?? 0) + q));
      }
    }
    for (const id of citati) out.get(id)!.rapportini++;
  }
  return out;
}

/**
 * Il punto dell'articolo in cantiere: posati su previsti, quello che avanza
 * (né posato né già rientrato) e se è tutto posato.
 */
export function bilancioPosa(quantita: number, unitaRiga: string | null | undefined, posati: number, rientrati: number) {
  const confrontabile = misurabile(normalizzaUnita(unitaRiga)) && quantita > 0;
  const avanzano = confrontabile ? Math.max(0, arrotonda(quantita - posati - rientrati)) : 0;
  return {
    confrontabile,
    avanzano,
    tuttoPosato: confrontabile && posati > 0 && posati + rientrati >= quantita,
    oltre: confrontabile && posati > quantita,
  };
}

/** Il posato di ogni riga per fase, per dividere il costo tra le fasi (economiaFasi). */
export function posaPerFaseDi(
  rapportini: RapportinoConMateriali[] | undefined,
  righe: ReadonlyArray<{ id: string; unita_misura?: string | null; stock_item_id?: string | null }>,
): Map<string, Map<string | null, number>> {
  const consumi = consumiPerArticolo(rapportini ?? [], new Map(righe.map((r) => [r.id, { unita: r.unita_misura, stock: r.stock_item_id }])));
  return new Map([...consumi].map(([id, c]) => [id, c.perFase]));
}
