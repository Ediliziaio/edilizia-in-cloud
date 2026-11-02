/**
 * Dossier economico della commessa: tutto quello che serve per stamparne
 * l'economia (Economia → «Scarica conto economico» e il Riepilogo commessa),
 * con gli STESSI calcoli delle schermate, così i numeri sono uguali ovunque:
 * - conto per macro-voci: contoEconomicoCommessa, sul consuntivo di
 *   v_ordine_marginalita e sul previsto delle lavorazioni;
 * - fasi: economiaFasi (venduto, previsto, consuntivo), come Lavorazioni.
 *   Senza la posa per fase dei rapportini: un articolo usato su più fasi
 *   resta tutto sulla fase della sua riga;
 * - incassi e pagamenti: commessa_quadro_pagamenti, come Incassi e pagamenti.
 * Una lettura sola, al click: nessun peso sulla pagina.
 */
import { canonicalOrderEconomics, ORDER_ECONOMICS_COLUMNS } from "@/lib/orders/economics";
import { economiaFasi, type AssegnazioneFase, type EconomiaFase, type RigaContrattoFase } from "@/lib/orders/economiaFasi";
import { contoEconomicoCommessa, type ContoEconomico } from "@/lib/orders/contoEconomicoCommessa";
import { normalizzaQuadro, totaliQuadro, type QuadroPagamenti, type TotaliQuadro } from "@/lib/orders/quadroPagamenti";
import { mesiApertura } from "@/lib/controlloGestione/tempoCommessa";
import { quotaCostoDiretto } from "@/hooks/useCostiDirettiPerTipo";

const STATI_EMESSI = ["inviato", "confermato", "parziale", "ricevuto"];

export interface FaseDossier {
  id: string;
  nome: string;
  stato: string;
  percentuale: number;
  inizio: string | null;
  fine: string | null;
  economia: EconomiaFase;
}

export interface DossierEconomico {
  ordine: { codice: string | null; descrizione: string | null; avanzamento: number | null; inizio: string | null; fine: string | null };
  conto: ContoEconomico;
  margineDiretto: { importo: number; pct: number };
  fasi: FaseDossier[];
  senzaFase: EconomiaFase;
  quadro: QuadroPagamenti | null;
  totaliQuadro: TotaliQuadro | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function righe<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function caricaDossierEconomico(db: Db, orderId: string, opzioni: { strutturaMensile?: number | null; conUscite?: boolean } = {}): Promise<DossierEconomico> {
  const conUscite = opzioni.conUscite !== false;
  const campiCosto = "id, order_id, amount, allocations, purchase_order_id, order_external_team_id, suppliers(tipo)";
  const [ordine, marg, persone, ditte, fasi, materiali, voci, acquisti, movimenti, costiDiretti, costiRipartiti, quadroRaw] = await Promise.all([
    db.from("orders").select("order_code, description, percentuale_avanzamento, work_start_date, work_end_date").eq("id", orderId).maybeSingle(),
    db.from("v_ordine_marginalita").select(ORDER_ECONOMICS_COLUMNS).eq("id", orderId).maybeSingle(),
    righe<Record<string, unknown>>(db.from("order_employees").select("phase_id, total_cost, cost_preventivo").eq("order_id", orderId)),
    righe<Record<string, unknown>>(db.from("order_external_teams").select("phase_id, total_cost, cost_preventivo, vat_rate").eq("order_id", orderId)),
    righe<Record<string, unknown>>(db.from("order_work_phases").select("id, name, position, status, percentuale, start_date, end_date, importo_venduto").eq("order_id", orderId).order("position")),
    righe<Record<string, unknown>>(db.from("order_items").select("id, phase_id, quantity, unit_price, discount_percent, purchase_price, standard_cost").filter("natura_riga", "eq", "materiale").eq("order_id", orderId)),
    righe<Record<string, unknown>>(db.from("order_work_phase_voci").select("phase_id, quantita, costo_manodopera, costo_materiali").eq("order_id", orderId)).catch((): Record<string, unknown>[] => []),
    righe<Record<string, unknown>>(db.from("purchase_order_items").select("order_item_id, quantity, line_total, purchase_orders!inner(status, order_id)")
      .eq("purchase_orders.order_id", orderId).in("purchase_orders.status", STATI_EMESSI).not("order_item_id", "is", null)).catch((): Record<string, unknown>[] => []),
    righe<Record<string, unknown>>(db.from("warehouse_movements").select("order_item_id, movement_type, quantity, unit_cost, rientro_commessa, notes")
      .eq("order_id", orderId).in("movement_type", ["carico", "scarico"])).catch((): Record<string, unknown>[] => []),
    righe<Record<string, unknown>>(db.from("company_costs").select(campiCosto).eq("order_id", orderId)).catch((): Record<string, unknown>[] => []),
    righe<Record<string, unknown>>(db.from("company_costs").select(campiCosto).contains("allocations", JSON.stringify([{ order_id: orderId }]))).catch((): Record<string, unknown>[] => []),
    conUscite ? db.rpc("commessa_quadro_pagamenti", { p_order_id: orderId }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (ordine.error) throw ordine.error;
  if (marg.error) throw marg.error;
  const o = (ordine.data ?? {}) as Record<string, unknown>;
  const actual = canonicalOrderEconomics(marg.data ?? null);

  const assegnazioni: AssegnazioneFase[] = [
    ...persone.map((e) => ({ phase_id: (e.phase_id as string) ?? null, source: "employee" as const, cost_preventivo: n(e.cost_preventivo), cost_consuntivo: n(e.total_cost) })),
    ...ditte.map((t) => ({ phase_id: (t.phase_id as string) ?? null, source: "team" as const, cost_preventivo: n(t.cost_preventivo), cost_consuntivo: n(t.total_cost), vat_rate: t.vat_rate == null ? null : n(t.vat_rate) })),
  ];
  const economia = economiaFasi({
    fasi: fasi.map((f) => ({ id: f.id as string, importo_venduto: f.importo_venduto == null ? null : n(f.importo_venduto) })),
    righe: materiali.map((r) => ({
      id: r.id as string, phase_id: (r.phase_id as string) ?? null, quantity: n(r.quantity),
      unit_price: r.unit_price == null ? null : n(r.unit_price), discount_percent: r.discount_percent == null ? null : n(r.discount_percent),
      purchase_price: r.purchase_price == null ? null : n(r.purchase_price), standard_cost: r.standard_cost == null ? null : n(r.standard_cost),
    })) as RigaContrattoFase[],
    assegnazioni,
    acquisti: acquisti.map((a) => ({ order_item_id: (a.order_item_id as string) ?? null, quantity: n(a.quantity), line_total: a.line_total == null ? null : n(a.line_total) })),
    movimenti: movimenti.map((m) => ({ order_item_id: (m.order_item_id as string) ?? null, movement_type: String(m.movement_type), quantity: n(m.quantity),
      unit_cost: m.unit_cost == null ? null : n(m.unit_cost), rientro_commessa: (m.rientro_commessa as boolean) ?? null, notes: (m.notes as string) ?? null })),
    vociPreviste: voci.map((v) => ({ phase_id: v.phase_id as string, quantita: n(v.quantita), costo_manodopera: n(v.costo_manodopera), costo_materiali: n(v.costo_materiali) })),
  });

  // Costi diretti per tipo di fornitore, con la regola della vista del margine.
  const direttiPerTipo: Record<string, number> = {};
  const visti = new Map([...costiDiretti, ...costiRipartiti].map((c) => [c.id as string, c]));
  for (const c of visti.values()) {
    const q = quotaCostoDiretto(c as Parameters<typeof quotaCostoDiretto>[0], orderId);
    if (q === 0) continue;
    const tipo = (c.suppliers as { tipo?: string | null } | null)?.tipo ?? "nessuno";
    direttiPerTipo[tipo] = (direttiPerTipo[tipo] ?? 0) + q;
  }

  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const inizio = (o.work_start_date as string) ?? null;
  const fine = (o.work_end_date as string) ?? null;
  const avanzamento = o.percentuale_avanzamento == null ? null : n(o.percentuale_avanzamento);
  const mensile = opzioni.strutturaMensile ?? null;
  const conto = contoEconomicoCommessa({
    ricavi: actual.revenue,
    avanzamentoPct: avanzamento,
    consuntivo: {
      acquisti: actual.purchases, magazzino: actual.warehouseMaterials, manodopera: actual.labor,
      persone: persone.reduce((s, e) => s + n(e.total_cost), 0),
      provvigioni: actual.commissions, rimborsi: actual.mileageReimbursements, errori: actual.errors,
      diretti: actual.directCosts, direttiPerTipo,
    },
    previsto: {
      materiali: economia.totaleFasi.previsto.materiali + economia.senzaFase.previsto.materiali,
      manodopera: economia.totaleFasi.previsto.manodopera + economia.senzaFase.previsto.manodopera,
      ditte: economia.totaleFasi.previsto.ditte + economia.senzaFase.previsto.ditte,
    },
    struttura: {
      mensile,
      mesiPrevisti: inizio && fine ? mesiApertura(inizio, fine, fine) : null,
      mesiMaturati: inizio ? mesiApertura(inizio, avanzamento != null && avanzamento >= 100 ? fine : null, oggi) : null,
    },
  });

  const quadro = quadroRaw?.error ? null : normalizzaQuadro(quadroRaw?.data);
  return {
    ordine: { codice: (o.order_code as string) ?? null, descrizione: (o.description as string) ?? null, avanzamento, inizio, fine },
    conto,
    margineDiretto: { importo: actual.margin, pct: actual.marginPct },
    fasi: fasi.map((f) => ({
      id: f.id as string, nome: (f.name as string) ?? "Fase", stato: (f.status as string) ?? "da_iniziare",
      percentuale: n(f.percentuale), inizio: (f.start_date as string) ?? null, fine: (f.end_date as string) ?? null,
      economia: economia.perFase.get(f.id as string)!,
    })).filter((f) => !!f.economia),
    senzaFase: economia.senzaFase,
    quadro,
    totaliQuadro: quadro ? totaliQuadro(quadro) : null,
  };
}
