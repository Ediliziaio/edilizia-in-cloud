/**
 * Dalla pianta al preventivo: i lavori del prima e dopo (lavoriDaPianta) diventano righe di un
 * preventivo nuovo, stanza per stanza. Funzioni pure: il dialogo fa gli insert (stessi passi di
 * QuoteBuilder e del simulatore: generate_quote_number, insert quotes, save_quote_items_atomic).
 */
import type { GenereLavoro, RiepilogoLavori } from "./primaEDopo";

export interface RigaProposta {
  chiave: string;
  stanza: string;
  genere: GenereLavoro;
  nome: string;
  quantita: number;
  unita: "mq" | "ml" | "pz";
  prezzo: number;
  /** Arredi e cambi d'uso non hanno un prezzo: di serie restano fuori. */
  inclusa: boolean;
}

/** Le righe proposte, con la quantità a due decimali (come la colonna di quote_items). */
export function righeDaLavori(l: RiepilogoLavori): RigaProposta[] {
  return l.stanze.flatMap((s) => s.lavori.map((x, i): RigaProposta => ({
    chiave: `${s.stanza}:${i}`,
    stanza: s.stanza,
    genere: x.genere,
    nome: x.descrizione,
    quantita: Math.round(x.quantita * 100) / 100,
    unita: x.unita === "n" ? "pz" : x.unita,
    prezzo: x.prezzo ?? 0,
    inclusa: x.prezzo != null && x.genere !== "uso",
  })));
}

/** Il payload di save_quote_items_atomic: una riga per lavoro, il nome con la stanza davanti. */
export function itemsPreventivo(righe: RigaProposta[], ivaPercento: number) {
  return righe.filter((r) => r.inclusa && r.quantita > 0).map((r, i) => {
    const opera = r.genere === "demolizione" || r.genere === "costruzione" || r.genere === "serramenti";
    return {
      name: `${r.stanza} — ${r.nome}`.slice(0, 250),
      description: `Dalla pianta: ${r.stanza}`,
      quantity: r.quantita,
      unit_price: Math.round(r.prezzo * 100) / 100,
      vat_rate: ivaPercento,
      unit_of_measure: r.unita,
      item_category: opera ? ("posa" as const) : ("prodotto" as const),
      item_type: opera ? "labor" : "product",
      tariffa_id: null,
      prezzo_acquisto: 0,
      sort_order: i,
    };
  });
}

export const totaleRighe = (righe: RigaProposta[]) => Math.round(righe.filter((r) => r.inclusa).reduce((t, r) => t + r.quantita * r.prezzo, 0) * 100) / 100;
