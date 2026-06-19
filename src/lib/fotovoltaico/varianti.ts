/**
 * Confronto varianti FV — affianca 2-N configurazioni dello stesso impianto
 * (es. "6 vs 8 kWp", "con/senza accumulo") e ne calcola i KPI con lo STESSO
 * motore finanziario di `finanziaria.ts`, così i numeri sono coerenti con il
 * resto del preventivo.
 *
 * Obiettivo commerciale (gap vs Reonic/Autarc): dare al cliente 2-3 scenari
 * affiancati e una variante "consigliata" trasparente → decide e firma prima.
 *
 * È pura logica: il chiamante costruisce l'`InputCassaCumulata` di ogni variante
 * (riusando gli helper esistenti del wizard/preventivatore) e questo modulo si
 * limita a calcolare e confrontare. Nessun side-effect, nessuna dipendenza UI.
 */

import {
  calcolaCassaCumulata,
  calcolaPayback,
  calcolaNPV,
  calcolaIRR,
  calcolaLCOE,
  type InputCassaCumulata,
} from "./finanziaria";
import { autoconsumoPctDaProfilo } from "./fisica";

/** Configurazione di una variante da confrontare. */
export interface VarianteInput {
  /** Id stabile (per React key e per indicare la variante scelta). */
  id: string;
  /** Etichetta breve mostrata in colonna (es. "Base 6 kWp"). */
  label: string;
  /** Descrizione opzionale (es. "8 kWp + 10 kWh accumulo + wallbox"). */
  descrizione?: string;
  /** Potenza di picco (kWp) — solo per display/ordinamento. */
  potenza_kwp: number;
  /** Se la variante include accumulo. */
  con_accumulo: boolean;
  /** Capacità accumulo (kWh), 0 se assente. */
  capacita_accumulo_kwh?: number;
  /** Input completo per il motore di cassa (investimento, produzione, autoconsumo…). */
  cassa: InputCassaCumulata;
  /** Tasso di sconto NPV per QUESTA variante (default 0.04). */
  tasso_npv?: number;
}

/** KPI calcolati per una variante. */
export interface VarianteKPI {
  id: string;
  label: string;
  descrizione?: string;
  potenza_kwp: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  /** Investimento netto iniziale (€). */
  investimento_eur: number;
  produzione_anno_1_kwh: number;
  autoconsumo_pct: number;
  /** Flusso NETTO anno 1 (risparmio bolletta + RID + detrazione − manutenzione). */
  risparmio_anno_1_eur: number;
  /** Beneficio LORDO anno 1 (senza manutenzione) — utile per messaggi "risparmi X/anno". */
  beneficio_lordo_anno_1_eur: number;
  payback_anni: number | null;
  npv_eur: number;
  irr_pct: number | null;
  /** Costo livellato dell'energia autoprodotta (€/kWh) — "produci a X €/kWh". */
  lcoe_eur_kwh: number;
  /** Guadagno netto cumulato sull'orizzonte (= benefici − investimento). */
  beneficio_totale_eur: number;
  /** Badge: payback più rapido tra le varianti. */
  is_best_payback: boolean;
  /** Badge: NPV più alto tra le varianti. */
  is_best_npv: boolean;
  /** Badge: variante consigliata (miglior compromesso, vedi euristica). */
  is_consigliata: boolean;
}

export interface ConfrontoVarianti {
  varianti: VarianteKPI[];
  best_payback_id: string | null;
  best_npv_id: string | null;
  /** Variante consigliata: miglior NPV tra quelle con payback finito; tie-break payback più basso. */
  consigliata_id: string | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcola i KPI di una singola variante usando il motore di cassa condiviso.
 * Esportata a parte così la UI può anche calcolare una variante alla volta.
 */
export function calcolaKpiVariante(v: VarianteInput): Omit<
  VarianteKPI,
  "is_best_payback" | "is_best_npv" | "is_consigliata"
> {
  const cassa = calcolaCassaCumulata(v.cassa);
  const tasso = v.tasso_npv ?? 0.04;

  const annoUno = cassa.find((f) => f.anno === 1);
  const ultimo = cassa[cassa.length - 1];

  const irr = calcolaIRR(cassa);

  return {
    id: v.id,
    label: v.label,
    descrizione: v.descrizione,
    potenza_kwp: round2(v.potenza_kwp),
    con_accumulo: v.con_accumulo,
    capacita_accumulo_kwh: round2(v.capacita_accumulo_kwh ?? 0),
    investimento_eur: round2(v.cassa.investimento_iniziale),
    produzione_anno_1_kwh: round2(v.cassa.produzione_anno_1_kwh),
    autoconsumo_pct: round2(v.cassa.autoconsumo_pct),
    risparmio_anno_1_eur: annoUno ? round2(annoUno.flusso) : 0,
    beneficio_lordo_anno_1_eur: annoUno
      ? round2(
          annoUno.risparmio_bolletta_eur +
            annoUno.ricavi_rid_eur +
            annoUno.detrazione_eur,
        )
      : 0,
    payback_anni: calcolaPayback(cassa),
    npv_eur: calcolaNPV(cassa, tasso),
    irr_pct: irr == null ? null : round1(irr * 100),
    lcoe_eur_kwh: calcolaLCOE({
      investimento_iniziale: v.cassa.investimento_iniziale,
      produzione_anno_1_kwh: v.cassa.produzione_anno_1_kwh,
      degradazione_pannelli_pct: v.cassa.degradazione_pannelli_pct,
      costo_manutenzione_anno_eur: v.cassa.costo_manutenzione_anno_eur,
      costo_sostituzione_inverter_eur: v.cassa.costo_sostituzione_inverter_eur,
      anno_sostituzione_inverter: v.cassa.anno_sostituzione_inverter,
      orizzonte_anni: v.cassa.orizzonte_anni,
      tasso_sconto: tasso,
    }),
    beneficio_totale_eur: ultimo ? round2(ultimo.cumulato) : 0,
  };
}

/**
 * Confronta N varianti (tipicamente 2-3) e assegna i badge:
 *  - best_payback: payback finito più basso
 *  - best_npv: NPV più alto
 *  - consigliata: euristica trasparente → miglior NPV tra le varianti con
 *    payback FINITO; a parità di NPV, payback più basso. Se nessuna ha payback
 *    finito, ricade sul NPV più alto in assoluto.
 *
 * Ritorna le varianti nello STESSO ordine di input (la UI decide il layout).
 */
export function confrontaVarianti(input: VarianteInput[]): ConfrontoVarianti {
  if (input.length === 0) {
    return { varianti: [], best_payback_id: null, best_npv_id: null, consigliata_id: null };
  }

  const base = input.map(calcolaKpiVariante);

  // Best payback: solo payback finiti (non null); il più basso vince.
  let bestPaybackId: string | null = null;
  let bestPaybackVal = Infinity;
  for (const k of base) {
    if (k.payback_anni != null && k.payback_anni < bestPaybackVal) {
      bestPaybackVal = k.payback_anni;
      bestPaybackId = k.id;
    }
  }

  // Best NPV: il più alto vince (sempre definito).
  let bestNpvId = base[0].id;
  let bestNpvVal = base[0].npv_eur;
  for (const k of base) {
    if (k.npv_eur > bestNpvVal) {
      bestNpvVal = k.npv_eur;
      bestNpvId = k.id;
    }
  }

  // Consigliata: miglior NPV tra quelle con payback finito; tie-break payback più basso.
  const conPayback = base.filter((k) => k.payback_anni != null);
  let consigliataId: string | null;
  if (conPayback.length > 0) {
    let best = conPayback[0];
    for (const k of conPayback) {
      if (
        k.npv_eur > best.npv_eur ||
        (k.npv_eur === best.npv_eur &&
          (k.payback_anni as number) < (best.payback_anni as number))
      ) {
        best = k;
      }
    }
    consigliataId = best.id;
  } else {
    consigliataId = bestNpvId;
  }

  const varianti: VarianteKPI[] = base.map((k) => ({
    ...k,
    is_best_payback: k.id === bestPaybackId,
    is_best_npv: k.id === bestNpvId,
    is_consigliata: k.id === consigliataId,
  }));

  return {
    varianti,
    best_payback_id: bestPaybackId,
    best_npv_id: bestNpvId,
    consigliata_id: consigliataId,
  };
}

// ─── Generazione varianti "vicine" alla configurazione corrente ──────────────
//
// Helper per la UI: data la config autoritativa corrente (numeri dal server) +
// i COSTI MARGINALI del template (€/kWp e €/kWh accumulo, gli stessi usati dal
// motore server) genera 2-3 configurazioni adiacenti da affiancare al cliente:
//   • base (configurazione scelta)
//   • più potenza (+step kWp)
//   • con/senza accumulo
// È una STIMA INDICATIVA lato client (come i what-if già presenti nel wizard):
// il numero definitivo resta quello ricalcolato dal server sulla config scelta.

/** Profilo di autoconsumo (sottoinsieme dei campi usati per il delta accumulo). */
export interface ProfiloAutoconsumoLite {
  autoconsumo_no_accumulo: number;
  autoconsumo_accumulo_5kwh: number;
  autoconsumo_accumulo_10kwh: number;
  autoconsumo_accumulo_15kwh: number;
}

export interface ContestoVariantiVicine {
  potenza_kwp: number;
  /** Investimento (prezzo di vendita IVA inclusa) della config base. */
  investimento_eur: number;
  produzione_anno_1_kwh: number;
  /** Autoconsumo EFFETTIVO della base (già limitato al consumo dal server). */
  autoconsumo_pct: number;
  consumo_annuo_kwh: number;
  costo_kwh_attuale: number;
  prezzo_rid_kwh: number;
  detrazione_annua_eur: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  /** Costo marginale €/kWp (template). Se ≤0 la variante "più potenza" è omessa. */
  costo_kwp_base: number;
  /** Costo marginale €/kWh accumulo (template). Se ≤0 le varianti accumulo sono omesse. */
  costo_accumulo_kwh: number;
  /** Profilo autoconsumo: necessario per stimare il delta delle varianti accumulo. */
  profilo?: ProfiloAutoconsumoLite | null;
  // override opzionali (default coerenti col server)
  durata_detrazione_anni?: number;
  inflazione_energia_pct?: number;
  inflazione_rid_pct?: number;
  degradazione_pannelli_pct?: number;
  costo_manutenzione_per_kwp_anno?: number;
  costo_sostituzione_inverter_eur?: number;
  orizzonte_anni?: number;
  tasso_npv?: number;
  /** Incremento potenza per la variante "più potenza" (default +2 kWp). */
  step_potenza_kwp?: number;
  /** Taglia accumulo proposta quando la base non ce l'ha (default 10 kWh). */
  accumulo_default_kwh?: number;
}

/** Autoconsumo effettivo = min(produzione·raw, consumo) / produzione (cap server). */
function autoconsumoEffettivo(rawPct: number, produzione: number, consumo: number): number {
  if (produzione <= 0) return 0;
  const autoconsumata = Math.min(produzione * rawPct, consumo);
  return autoconsumata / produzione;
}

function buildInput(
  ctx: ContestoVariantiVicine,
  potenza_kwp: number,
  investimento_eur: number,
  produzione_anno_1_kwh: number,
  autoconsumo_pct: number,
): InputCassaCumulata {
  // La detrazione scala con l'investimento (è una % del costo ammissibile).
  const ratio = ctx.investimento_eur > 0 ? investimento_eur / ctx.investimento_eur : 1;
  return {
    investimento_iniziale: investimento_eur,
    produzione_anno_1_kwh,
    autoconsumo_pct,
    // Cap fisico: l'autoconsumo non può superare il consumo annuo. `autoconsumo_pct`
    // qui è già la quota EFFETTIVA anno-1 (post-cap, via autoconsumoEffettivo), quindi
    // il cap è una rete di sicurezza coerente col motore server: non altera i numeri
    // ma garantisce che nessuna variante auto-consumi più del consumo.
    consumo_annuo_kwh: ctx.consumo_annuo_kwh,
    costo_kwh_attuale: ctx.costo_kwh_attuale,
    prezzo_rid_kwh: ctx.prezzo_rid_kwh,
    detrazione_annua_eur: ctx.detrazione_annua_eur * ratio,
    durata_detrazione_anni: ctx.durata_detrazione_anni ?? 10,
    inflazione_energia_pct: ctx.inflazione_energia_pct ?? 0.025,
    inflazione_rid_pct: ctx.inflazione_rid_pct ?? 0.02,
    degradazione_pannelli_pct: ctx.degradazione_pannelli_pct ?? 0.005,
    costo_manutenzione_anno_eur: (ctx.costo_manutenzione_per_kwp_anno ?? 8) * potenza_kwp,
    costo_sostituzione_inverter_eur: ctx.costo_sostituzione_inverter_eur ?? 1500,
    anno_sostituzione_inverter: 12,
    orizzonte_anni: ctx.orizzonte_anni ?? 25,
  };
}

/**
 * Costruisce le `VarianteInput` adiacenti alla config corrente (base + fino a 2
 * alternative). Le varianti accumulo richiedono `ctx.profilo` per stimare il
 * delta di autoconsumo; in sua assenza vengono omesse.
 */
export function buildVariantiVicine(ctx: ContestoVariantiVicine): VarianteInput[] {
  const tasso = ctx.tasso_npv;
  const stepKwp = ctx.step_potenza_kwp ?? 2;
  const accDefault = ctx.accumulo_default_kwh ?? 10;
  const out: VarianteInput[] = [];

  // 1) BASE — usa direttamente i numeri autoritativi correnti.
  out.push({
    id: "base",
    label: "Configurazione scelta",
    descrizione: `${round1(ctx.potenza_kwp)} kWp${
      ctx.con_accumulo ? ` + ${round1(ctx.capacita_accumulo_kwh)} kWh` : " · senza accumulo"
    }`,
    potenza_kwp: ctx.potenza_kwp,
    con_accumulo: ctx.con_accumulo,
    capacita_accumulo_kwh: ctx.capacita_accumulo_kwh,
    cassa: buildInput(
      ctx,
      ctx.potenza_kwp,
      ctx.investimento_eur,
      ctx.produzione_anno_1_kwh,
      ctx.autoconsumo_pct,
    ),
    tasso_npv: tasso,
  });

  // 2) PIÙ POTENZA (+step kWp, stessa batteria) — se ho il costo marginale.
  if (ctx.costo_kwp_base > 0 && ctx.potenza_kwp > 0) {
    const newKwp = ctx.potenza_kwp + stepKwp;
    const newProd = (ctx.produzione_anno_1_kwh * newKwp) / ctx.potenza_kwp;
    const newInvest = ctx.investimento_eur + stepKwp * ctx.costo_kwp_base;
    // raw % di autoconsumo: dal profilo alla taglia accumulo attuale, oppure
    // ripiego sul raw implicito della base.
    const rawPct = ctx.profilo
      ? autoconsumoPctDaProfilo(ctx.profilo, ctx.capacita_accumulo_kwh)
      : ctx.autoconsumo_pct;
    const newAuto = autoconsumoEffettivo(rawPct, newProd, ctx.consumo_annuo_kwh);
    out.push({
      id: "piu_potenza",
      label: `Più potenza (+${stepKwp} kWp)`,
      descrizione: `${round1(newKwp)} kWp${
        ctx.con_accumulo ? ` + ${round1(ctx.capacita_accumulo_kwh)} kWh` : ""
      } · più autoproduzione`,
      potenza_kwp: newKwp,
      con_accumulo: ctx.con_accumulo,
      capacita_accumulo_kwh: ctx.capacita_accumulo_kwh,
      cassa: buildInput(ctx, newKwp, newInvest, newProd, newAuto),
      tasso_npv: tasso,
    });
  }

  // 3) ACCUMULO (toggle) — richiede il profilo per stimare il delta autoconsumo.
  if (ctx.costo_accumulo_kwh > 0 && ctx.profilo) {
    if (!ctx.con_accumulo) {
      // Aggiungi accumulo
      const kwh = accDefault;
      const newInvest = ctx.investimento_eur + kwh * ctx.costo_accumulo_kwh;
      const rawPct = autoconsumoPctDaProfilo(ctx.profilo, kwh);
      const newAuto = autoconsumoEffettivo(rawPct, ctx.produzione_anno_1_kwh, ctx.consumo_annuo_kwh);
      out.push({
        id: "con_accumulo",
        label: `Con accumulo ${kwh} kWh`,
        descrizione: `${round1(ctx.potenza_kwp)} kWp + ${kwh} kWh · più indipendenza`,
        potenza_kwp: ctx.potenza_kwp,
        con_accumulo: true,
        capacita_accumulo_kwh: kwh,
        cassa: buildInput(ctx, ctx.potenza_kwp, newInvest, ctx.produzione_anno_1_kwh, newAuto),
        tasso_npv: tasso,
      });
    } else {
      // Rimuovi accumulo
      const newInvest = Math.max(
        0,
        ctx.investimento_eur - ctx.capacita_accumulo_kwh * ctx.costo_accumulo_kwh,
      );
      const rawPct = autoconsumoPctDaProfilo(ctx.profilo, 0);
      const newAuto = autoconsumoEffettivo(rawPct, ctx.produzione_anno_1_kwh, ctx.consumo_annuo_kwh);
      out.push({
        id: "senza_accumulo",
        label: "Senza accumulo",
        descrizione: `${round1(ctx.potenza_kwp)} kWp · investimento più basso`,
        potenza_kwp: ctx.potenza_kwp,
        con_accumulo: false,
        capacita_accumulo_kwh: 0,
        cassa: buildInput(ctx, ctx.potenza_kwp, newInvest, ctx.produzione_anno_1_kwh, newAuto),
        tasso_npv: tasso,
      });
    }
  }

  return out;
}

/** Convenience: costruisce le varianti vicine e le confronta in un colpo solo. */
export function costruisciConfrontoVicino(ctx: ContestoVariantiVicine): ConfrontoVarianti {
  return confrontaVarianti(buildVariantiVicine(ctx));
}

// ─── Simulatore interattivo (override lato cliente) ─────────────────────────

/** InputCassaCumulata della configurazione BASE corrente (per il simulatore). */
export function inputBaseDaContesto(ctx: ContestoVariantiVicine): InputCassaCumulata {
  return buildInput(
    ctx,
    ctx.potenza_kwp,
    ctx.investimento_eur,
    ctx.produzione_anno_1_kwh,
    ctx.autoconsumo_pct,
  );
}

/** Parametri che il cliente può muovere senza ri-prezzare l'hardware. */
export interface OverrideSimulazione {
  costo_kwh_attuale?: number;
  autoconsumo_pct?: number;
  inflazione_energia_pct?: number;
}

/**
 * Applica gli override del simulatore alla cassa base, con clamp di sicurezza
 * (autoconsumo 0–100%, prezzo ≥ 0.01, inflazione 0–20%). Puro.
 */
export function applicaOverride(
  base: InputCassaCumulata,
  o: OverrideSimulazione,
): InputCassaCumulata {
  return {
    ...base,
    costo_kwh_attuale:
      o.costo_kwh_attuale != null
        ? Math.max(0.01, o.costo_kwh_attuale)
        : base.costo_kwh_attuale,
    autoconsumo_pct:
      o.autoconsumo_pct != null
        ? Math.min(1, Math.max(0, o.autoconsumo_pct))
        : base.autoconsumo_pct,
    inflazione_energia_pct:
      o.inflazione_energia_pct != null
        ? Math.min(0.2, Math.max(0, o.inflazione_energia_pct))
        : base.inflazione_energia_pct,
  };
}
