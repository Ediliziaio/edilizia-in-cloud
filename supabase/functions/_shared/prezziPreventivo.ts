/**
 * I numeri del riepilogo economico del preventivo generico (25/09/2026).
 *
 * Quanto costava a listino, quanto è stato scontato, quanto risparmia il
 * cliente IVA inclusa, quanto valgono le voci opzionali e le agevolazioni
 * fiscali scelte nel costruttore. Prima il PDF mostrava solo «Sconto 5%», e i
 * bonus edilizi inseriti nel preventivo non uscivano affatto.
 *
 * Solo i preset delle detrazioni come import: lo usano la funzione e i test.
 */
import { DETRAZIONI_EDILIZIE } from "./detrazioniEdilizie.ts";

/** Una riga del preventivo, con i soli campi che servono ai conti. */
export type RigaPrezzo = {
  item_category?: string | null;
  is_optional?: boolean | null;
  quantity?: unknown;
  unit_price?: unknown;
  line_total?: unknown;
  discount_percent?: unknown;
  vat_rate?: unknown;
};

const numero = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const centesimi = (x: number): number => Math.round(x * 100) / 100;

const eUnaVoce = (r: RigaPrezzo) => !["nota", "subtotale"].includes(String(r.item_category || "prodotto"));
/** L'importo della riga: quello salvato, se c'è (uno 0 legittimo resta 0); se no q × prezzo − sconto. */
const importoDi = (r: RigaPrezzo): number =>
  r.line_total != null && r.line_total !== ""
    ? numero(r.line_total)
    : numero(r.quantity) * numero(r.unit_price) * (1 - numero(r.discount_percent) / 100);

export type RiepilogoPrezzi = {
  /** Le voci comprese a prezzo pieno (q × prezzo), senza le righe di sconto in negativo. */
  listino: number;
  /** Gli sconti scritti sulle voci: le percentuali di riga e le righe in negativo. */
  scontiVoci: number;
  /** Quanto costerebbe il preventivo senza nessuno sconto, IVA inclusa. */
  pieno: number;
  /** Prezzo pieno meno il totale del preventivo: quanto risparmia il cliente, IVA inclusa. */
  risparmio: number;
  /** Il risparmio in percentuale del prezzo pieno. */
  risparmioPct: number;
  /** Le voci opzionali, IVA inclusa: stanno in tabella ma fuori dal totale. */
  opzionali: number;
  /**
   * Le righe tornano col subtotale salvato. Se no (prezzo scritto a mano, righe
   * cambiate dopo il salvataggio) listino e risparmio non si mostrano: un conto
   * che non torna in un contratto è peggio di nessun conto.
   */
  coerente: boolean;
};

export function riepilogoPrezzi(
  righe: RigaPrezzo[],
  totali: { subtotal: unknown; total: unknown },
): RiepilogoPrezzi {
  const voci = righe.filter(eUnaVoce);
  const comprese = voci.filter((r) => r.is_optional !== true);
  const positive = comprese.filter((r) => importoDi(r) >= 0 && numero(r.unit_price) >= 0);
  const listino = centesimi(positive.reduce((s, r) => s + numero(r.quantity) * numero(r.unit_price), 0));
  const netto = centesimi(comprese.reduce((s, r) => s + importoDi(r), 0));
  const pieno = centesimi(positive.reduce((s, r) => s + numero(r.quantity) * numero(r.unit_price) * (1 + numero(r.vat_rate) / 100), 0));
  const opzionali = centesimi(
    voci.filter((r) => r.is_optional === true).reduce((s, r) => s + importoDi(r) * (1 + numero(r.vat_rate) / 100), 0),
  );
  const subtotale = centesimi(numero(totali.subtotal));
  const totale = centesimi(numero(totali.total));
  const coerente = positive.length > 0
    && Math.abs(netto - subtotale) <= 0.05
    && listino + 0.005 >= netto
    && pieno + 0.005 >= totale;
  const scontiVoci = coerente ? Math.max(0, centesimi(listino - netto)) : 0;
  const risparmio = coerente ? Math.max(0, centesimi(pieno - totale)) : 0;
  return {
    listino,
    scontiVoci,
    pieno,
    risparmio,
    risparmioPct: pieno > 0 ? (risparmio / pieno) * 100 : 0,
    opzionali,
    coerente,
  };
}

/** Un'agevolazione del preventivo, con la detrazione stimata. */
export type Agevolazione = {
  etichetta: string;
  /** Aliquota di detrazione (50, 65, 75…), non l'IVA. */
  aliquota: number;
  /** La spesa assegnata a questo bonus, IVA inclusa. */
  spesa: number;
  /** Detrazione stimata: sulla spesa IVA inclusa, entro il tetto del bonus. */
  detrazione: number;
  /** La spesa supera il tetto per unità immobiliare: la detrazione si ferma lì. */
  oltreTetto: boolean;
  /** Il bonus vuole il bonifico «parlante» (tutti tranne mobili e verde). */
  bonificoParlante: boolean;
};

export type AgevolazioniPreventivo = {
  voci: Agevolazione[];
  detrazione: number;
  /** Il totale del preventivo meno le detrazioni stimate. */
  costoDopo: number;
  bonificoParlante: boolean;
};

/**
 * Le agevolazioni scelte nel costruttore (quotes.bonus_lines), con gli stessi
 * conti della sua scheda «Bonus edilizi» (src/lib/orders/bonusFiscali.ts): la
 * quota di imponibile di ogni bonus si porta a IVA inclusa con l'IVA media del
 * preventivo, la detrazione si ferma al tetto del preset. È una stima
 * commerciale, e il PDF lo dice.
 */
export function agevolazioniPreventivo(
  bonusLines: unknown,
  totali: { imponibile: number; totale: number },
): AgevolazioniPreventivo | null {
  if (!Array.isArray(bonusLines) || bonusLines.length === 0) return null;
  const fattoreIva = totali.imponibile > 0 ? totali.totale / totali.imponibile : 1;
  const voci = bonusLines
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .sort((a, b) => numero(a.position) - numero(b.position))
    .map((r): Agevolazione => {
      const preset = DETRAZIONI_EDILIZIE.find((p) => p.id === r.preset_id) ?? null;
      const aliquota = numero(r.aliquota_detrazione);
      const spesa = centesimi(numero(r.imponibile) * fattoreIva);
      const tetto = preset?.tettoSpesa;
      const base = tetto != null ? Math.min(spesa, tetto) : spesa;
      return {
        etichetta: String(r.label || preset?.label || "Agevolazione"),
        aliquota,
        spesa,
        detrazione: aliquota > 0 ? centesimi(base * (aliquota / 100)) : 0,
        oltreTetto: tetto != null && spesa > tetto + 0.01,
        bonificoParlante: preset ? preset.richiedeBonificoParlante !== false : true,
      };
    })
    .filter((v) => v.spesa > 0);
  if (voci.length === 0) return null;
  const detrazione = centesimi(voci.reduce((s, v) => s + v.detrazione, 0));
  return {
    voci,
    detrazione,
    costoDopo: centesimi(totali.totale - detrazione),
    bonificoParlante: voci.some((v) => v.bonificoParlante && v.detrazione > 0),
  };
}
