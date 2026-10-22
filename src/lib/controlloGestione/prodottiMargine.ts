/**
 * Prodotti & categorie del Controllo di gestione: margine sui materiali e
 * controllo costi, raggruppati per fase di lavoro, fornitore, prodotto o
 * categoria scritta sull'articolo.
 *
 * Regole:
 *  - ricavo della riga = prezzo di vendita × quantità, meno lo sconto di riga;
 *  - una riga senza prezzo di vendita NON fa margine negativo: il suo costo
 *    va in «costi senza prezzo di vendita», a parte;
 *  - le righe delle commesse cancellate non contano.
 */
export type DimensioneProdotti = "fase" | "fornitore" | "prodotto" | "categoria";

export interface RigaProdotto {
  order_item_id: string;
  name: string;
  categoria: string;
  fase: string | null;
  fornitore: string | null;
  article_template_id: string | null;
  costo_standard: number;
  costo_reale: number;
  fonte_costo: string;
  ha_baseline_listino: boolean;
  /** Prezzo di vendita della riga (netto sconto). 0 = nessun prezzo. */
  ricavo: number;
}

export interface AggregatoProdotti {
  key: string;
  label: string;
  n_righe: number;
  con_baseline: number;
  costo_standard: number;
  costo_reale: number;
  scostamento: number;
  scostamento_perc: number | null;
  /** Solo righe con un prezzo di vendita. */
  ricavo: number;
  costo_con_ricavo: number;
  margine: number;
  margine_perc: number | null;
  /** Costi delle righe senza prezzo di vendita: da collegare a un preventivo. */
  costo_senza_ricavo: number;
  righe_senza_ricavo: number;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function ricavoRiga(unitPrice: unknown, quantity: unknown, discountPercent: unknown): number {
  const prezzo = Number(unitPrice);
  const qta = Number(quantity);
  const sconto = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  if (!Number.isFinite(prezzo) || !Number.isFinite(qta) || prezzo <= 0 || qta <= 0) return 0;
  return cent(prezzo * qta * (1 - sconto / 100));
}

function chiave(r: RigaProdotto, dim: DimensioneProdotti): [string, string] {
  switch (dim) {
    case "fase":
      return [`fase:${r.fase ?? ""}`, r.fase || "Senza fase"];
    case "fornitore":
      return [`forn:${r.fornitore ?? ""}`, r.fornitore || "Senza fornitore"];
    case "prodotto":
      return [r.article_template_id ?? `name:${r.name}`, r.name || "Articolo senza nome"];
    default:
      return [`cat:${r.categoria}`, r.categoria || "Senza categoria"];
  }
}

export function aggregaProdotti(righe: RigaProdotto[], dim: DimensioneProdotti): AggregatoProdotti[] {
  const map = new Map<string, AggregatoProdotti>();
  // Costo reale delle sole righe con un costo di listino: lo scostamento ha senso solo lì.
  const realeConListino = new Map<string, number>();
  for (const r of righe) {
    const [key, label] = chiave(r, dim);
    const a = map.get(key) ?? {
      key, label, n_righe: 0, con_baseline: 0, costo_standard: 0, costo_reale: 0, scostamento: 0,
      scostamento_perc: null, ricavo: 0, costo_con_ricavo: 0, margine: 0, margine_perc: null,
      costo_senza_ricavo: 0, righe_senza_ricavo: 0,
    };
    a.n_righe += 1;
    a.con_baseline += r.ha_baseline_listino ? 1 : 0;
    a.costo_reale += r.costo_reale;
    if (r.ha_baseline_listino) {
      a.costo_standard += r.costo_standard;
      realeConListino.set(key, (realeConListino.get(key) ?? 0) + r.costo_reale);
    }
    if (r.ricavo > 0) {
      a.ricavo += r.ricavo;
      a.costo_con_ricavo += r.costo_reale;
    } else if (r.costo_reale > 0) {
      a.costo_senza_ricavo += r.costo_reale;
      a.righe_senza_ricavo += 1;
    }
    map.set(key, a);
  }
  return [...map.values()].map((a) => {
    const scost = a.con_baseline > 0 ? cent((realeConListino.get(a.key) ?? 0) - a.costo_standard) : 0;
    const margine = cent(a.ricavo - a.costo_con_ricavo);
    return {
      ...a,
      costo_standard: cent(a.costo_standard),
      costo_reale: cent(a.costo_reale),
      ricavo: cent(a.ricavo),
      costo_con_ricavo: cent(a.costo_con_ricavo),
      costo_senza_ricavo: cent(a.costo_senza_ricavo),
      scostamento: scost,
      scostamento_perc: a.costo_standard > 0 ? (scost / a.costo_standard) * 100 : null,
      margine,
      margine_perc: a.ricavo > 0 ? (margine / a.ricavo) * 100 : null,
    };
  });
}

export function totaliProdotti(righe: RigaProdotto[]) {
  const conRicavo = righe.filter((r) => r.ricavo > 0);
  const senzaRicavo = righe.filter((r) => r.ricavo <= 0 && r.costo_reale > 0);
  const ricavo = cent(conRicavo.reduce((s, r) => s + r.ricavo, 0));
  const costoConRicavo = cent(conRicavo.reduce((s, r) => s + r.costo_reale, 0));
  const conListino = righe.filter((r) => r.ha_baseline_listino);
  const costoStandard = cent(conListino.reduce((s, r) => s + r.costo_standard, 0));
  const costoRealeListino = cent(conListino.reduce((s, r) => s + r.costo_reale, 0));
  return {
    righe: righe.length,
    ricavo,
    costo_reale: cent(righe.reduce((s, r) => s + r.costo_reale, 0)),
    costo_con_ricavo: costoConRicavo,
    margine: cent(ricavo - costoConRicavo),
    margine_perc: ricavo > 0 ? ((ricavo - costoConRicavo) / ricavo) * 100 : null,
    costo_senza_ricavo: cent(senzaRicavo.reduce((s, r) => s + r.costo_reale, 0)),
    righe_senza_ricavo: senzaRicavo.length,
    con_baseline: conListino.length,
    costo_standard: costoStandard,
    scostamento: cent(costoRealeListino - costoStandard),
    scostamento_perc: costoStandard > 0 ? ((costoRealeListino - costoStandard) / costoStandard) * 100 : null,
  };
}
