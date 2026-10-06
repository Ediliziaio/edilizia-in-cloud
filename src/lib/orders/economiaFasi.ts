/**
 * Economia delle lavorazioni di una commessa (06/10/2026).
 *
 * Per ogni fase tre numeri, come li ragiona un'impresa edile:
 * - VENDUTO: quanto paga il cliente per quella lavorazione. È l'importo
 *   scritto sulla fase dall'ufficio (importo_venduto); se manca, le righe del
 *   contratto collegate alla fase (order_items.phase_id) con un prezzo:
 *   prezzo × quantità, meno lo sconto di riga. Nelle commesse vere le righe
 *   collegate sono spesso materiali senza prezzo di vendita: senza l'importo
 *   sulla fase il venduto di una lavorazione non si potrebbe dire.
 * - COSTO PREVISTO: manodopera e ditte previste (cost_preventivo delle
 *   assegnazioni) più il costo d'acquisto delle righe collegate
 *   (purchase_price, altrimenti standard_cost).
 * - COSTO CONSUNTIVO: quello sostenuto. Manodopera e ditte registrate
 *   (total_cost, la fonte del conto economico) più acquisti e scarichi di
 *   magazzino delle righe della fase, con la regola di v_ordine_marginalita:
 *   lo scarico di una riga già coperta da un ordine d'acquisto non si conta
 *   due volte.
 * Quello che non sta in una fase (righe e persone senza fase) va in
 * `senzaFase`; provvigioni, errori, costi diretti e rimborsi restano del conto
 * economico della commessa.
 */

export interface RigaContrattoFase {
  id: string;
  phase_id: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  purchase_price: number | null;
  standard_cost: number | null;
}

export interface AssegnazioneFase {
  phase_id: string | null;
  /** employee = persona interna (order_employees), team = ditta (order_external_teams). */
  source: "employee" | "team";
  cost_preventivo: number;
  cost_consuntivo: number;
}

/** Riga di un ordine d'acquisto della commessa già emesso (inviato, confermato, parziale, ricevuto). */
export interface RigaAcquisto {
  order_item_id: string | null;
  line_total: number | null;
}

/** Movimento di magazzino della commessa, col suo costo unitario. */
export interface MovimentoMagazzino {
  order_item_id: string | null;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
}

export interface VociCosto {
  manodopera: number;
  ditte: number;
  materiali: number;
}

/** Da dove viene il venduto: scritto sulla fase, dalle righe del contratto, o non c'è. */
export type FonteVenduto = "fase" | "righe" | null;

export interface EconomiaFase {
  venduto: number;
  fonteVenduto: FonteVenduto;
  /** Venduto delle righe del contratto collegate, anche quando sulla fase è scritto un altro importo. */
  vendutoRighe: number;
  costoPrevisto: number;
  costoConsuntivo: number;
  previsto: VociCosto;
  consuntivo: VociCosto;
  /** Consuntivo meno previsto: sopra zero il costo ha sforato. */
  scostamento: number;
  /** Margine % sul venduto; null senza venduto. */
  marginePrevistoPct: number | null;
  margineConsuntivoPct: number | null;
  /** Righe del contratto collegate alla fase, con o senza prezzo di vendita. */
  righe: number;
}

export interface EconomiaFasi {
  perFase: Map<string, EconomiaFase>;
  /** Righe e assegnazioni della commessa che non stanno in nessuna fase. */
  senzaFase: EconomiaFase;
  /** Somma delle fasi, senza `senzaFase`. */
  totaleFasi: EconomiaFase;
  /** Fasi senza venduto: né scritto sulla fase né dalle righe del contratto. */
  fasiSenzaVenduto: number;
}

const numero = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const centesimi = (v: number) => Math.round(v * 100) / 100;

interface Somme {
  /** Venduto scritto sulla fase; null = dalle righe. */
  importo: number | null;
  vendutoRighe: number;
  righePrezzate: number;
  previsto: VociCosto;
  consuntivo: VociCosto;
  righe: number;
}

const vuote = (importo: number | null = null): Somme => ({
  importo,
  vendutoRighe: 0,
  righePrezzate: 0,
  previsto: { manodopera: 0, ditte: 0, materiali: 0 },
  consuntivo: { manodopera: 0, ditte: 0, materiali: 0 },
  righe: 0,
});

/** L'importo scritto sulla fase, se è un numero valido (mai sotto zero). */
const importoFase = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
};

function vendutoDi(s: Somme): { venduto: number; fonte: FonteVenduto } {
  if (s.importo != null) return { venduto: s.importo, fonte: "fase" };
  return { venduto: s.vendutoRighe, fonte: s.righePrezzate > 0 ? "righe" : null };
}

const VOCI = ["manodopera", "ditte", "materiali"] as const;

/** Prezzo di vendita della riga del contratto, sconto di riga compreso. */
export function vendutoRiga(r: Pick<RigaContrattoFase, "quantity" | "unit_price" | "discount_percent">): number {
  const sconto = Math.min(100, Math.max(0, numero(r.discount_percent)));
  return numero(r.quantity) * numero(r.unit_price) * (1 - sconto / 100);
}

/** Costo previsto della riga: costo d'acquisto, altrimenti costo standard. */
export function costoPrevistoRiga(r: Pick<RigaContrattoFase, "quantity" | "purchase_price" | "standard_cost">): number {
  const unitario = numero(r.purchase_price) > 0 ? numero(r.purchase_price) : numero(r.standard_cost);
  return numero(r.quantity) * unitario;
}

/**
 * Costo sostenuto per ogni riga del contratto: le righe degli ordini
 * d'acquisto emessi, più gli scarichi di magazzino (meno i resi, mai sotto
 * zero) delle righe che nessun acquisto copre, come in v_ordine_marginalita.
 */
export function costoConsuntivoRighe(
  acquisti: ReadonlyArray<RigaAcquisto>,
  movimenti: ReadonlyArray<MovimentoMagazzino>,
): Map<string, number> {
  const costo = new Map<string, number>();
  const coperte = new Set<string>();
  for (const a of acquisti) {
    if (!a.order_item_id) continue;
    coperte.add(a.order_item_id);
    costo.set(a.order_item_id, (costo.get(a.order_item_id) ?? 0) + numero(a.line_total));
  }
  const magazzino = new Map<string, number>();
  for (const m of movimenti) {
    if (!m.order_item_id || coperte.has(m.order_item_id)) continue;
    const valore = numero(m.quantity) * numero(m.unit_cost);
    const delta = m.movement_type === "scarico" ? valore : m.movement_type === "carico" ? -valore : 0;
    magazzino.set(m.order_item_id, (magazzino.get(m.order_item_id) ?? 0) + delta);
  }
  for (const [id, valore] of magazzino) costo.set(id, (costo.get(id) ?? 0) + Math.max(0, valore));
  return costo;
}

function chiudi(s: Somme, { venduto: lordo, fonte }: { venduto: number; fonte: FonteVenduto }): EconomiaFase {
  const previsto = { manodopera: centesimi(s.previsto.manodopera), ditte: centesimi(s.previsto.ditte), materiali: centesimi(s.previsto.materiali) };
  const consuntivo = { manodopera: centesimi(s.consuntivo.manodopera), ditte: centesimi(s.consuntivo.ditte), materiali: centesimi(s.consuntivo.materiali) };
  const costoPrevisto = centesimi(s.previsto.manodopera + s.previsto.ditte + s.previsto.materiali);
  const costoConsuntivo = centesimi(s.consuntivo.manodopera + s.consuntivo.ditte + s.consuntivo.materiali);
  const venduto = centesimi(lordo);
  const margine = (costo: number) => (venduto > 0 ? Math.round(((venduto - costo) / venduto) * 1000) / 10 : null);
  return {
    venduto,
    fonteVenduto: fonte,
    vendutoRighe: centesimi(s.vendutoRighe),
    costoPrevisto,
    costoConsuntivo,
    previsto,
    consuntivo,
    scostamento: centesimi(costoConsuntivo - costoPrevisto),
    marginePrevistoPct: margine(costoPrevisto),
    margineConsuntivoPct: margine(costoConsuntivo),
    righe: s.righe,
  };
}

export function economiaFasi(input: {
  fasi: ReadonlyArray<{ id: string; importo_venduto?: number | null }>;
  righe: ReadonlyArray<RigaContrattoFase>;
  assegnazioni: ReadonlyArray<AssegnazioneFase>;
  acquisti?: ReadonlyArray<RigaAcquisto>;
  movimenti?: ReadonlyArray<MovimentoMagazzino>;
}): EconomiaFasi {
  const somme = new Map<string, Somme>();
  for (const f of input.fasi) somme.set(f.id, vuote(importoFase(f.importo_venduto)));
  const fuori = vuote();
  const di = (faseId: string | null) => (faseId && somme.get(faseId)) || fuori;

  const consuntivoRighe = costoConsuntivoRighe(input.acquisti ?? [], input.movimenti ?? []);
  for (const r of input.righe) {
    const s = di(r.phase_id);
    const prezzo = vendutoRiga(r);
    s.vendutoRighe += prezzo;
    if (prezzo > 0) s.righePrezzate += 1;
    s.previsto.materiali += costoPrevistoRiga(r);
    s.consuntivo.materiali += consuntivoRighe.get(r.id) ?? 0;
    s.righe += 1;
  }
  for (const a of input.assegnazioni) {
    const s = di(a.phase_id);
    const voce = a.source === "team" ? "ditte" : "manodopera";
    s.previsto[voce] += numero(a.cost_preventivo);
    s.consuntivo[voce] += numero(a.cost_consuntivo);
  }

  const perFase = new Map<string, EconomiaFase>();
  const totale = vuote();
  let vendutoTotale = 0;
  const fonti = new Set<FonteVenduto>();
  let fasiSenzaVenduto = 0;
  for (const [id, s] of somme) {
    const v = vendutoDi(s);
    perFase.set(id, chiudi(s, v));
    vendutoTotale += v.venduto;
    fonti.add(v.fonte);
    if (v.fonte === null) fasiSenzaVenduto += 1;
    totale.vendutoRighe += s.vendutoRighe;
    totale.righePrezzate += s.righePrezzate;
    totale.righe += s.righe;
    for (const voce of VOCI) {
      totale.previsto[voce] += s.previsto[voce];
      totale.consuntivo[voce] += s.consuntivo[voce];
    }
  }
  const fonteTotale: FonteVenduto = fonti.has("fase") ? "fase" : fonti.has("righe") ? "righe" : null;
  return {
    perFase,
    senzaFase: chiudi(fuori, vendutoDi(fuori)),
    totaleFasi: chiudi(totale, { venduto: vendutoTotale, fonte: fonteTotale }),
    fasiSenzaVenduto,
  };
}
