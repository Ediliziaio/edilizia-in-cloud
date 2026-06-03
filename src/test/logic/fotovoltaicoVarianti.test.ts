import { describe, it, expect } from "vitest";
import {
  confrontaVarianti,
  calcolaKpiVariante,
  buildVariantiVicine,
  costruisciConfrontoVicino,
  applicaOverride,
  inputBaseDaContesto,
  type VarianteInput,
  type ContestoVariantiVicine,
} from "@/lib/fotovoltaico/varianti";
import {
  calcolaCassaCumulata,
  calcolaPayback,
  calcolaNPV,
  calcolaLCOE,
  type InputCassaCumulata,
} from "@/lib/fotovoltaico/finanziaria";

/**
 * Test del comparatore varianti FV (src/lib/fotovoltaico/varianti.ts).
 * Esercita il CODICE DI PRODUZIONE e verifica che i KPI esposti coincidano
 * con quelli del motore finanziario condiviso (niente matematica duplicata).
 */

const baseInput = (over: Partial<InputCassaCumulata> = {}): InputCassaCumulata => ({
  investimento_iniziale: 10000,
  produzione_anno_1_kwh: 8000,
  autoconsumo_pct: 0.5,
  costo_kwh_attuale: 0.32,
  prezzo_rid_kwh: 0.1,
  detrazione_annua_eur: 500,
  durata_detrazione_anni: 10,
  inflazione_energia_pct: 0.025,
  inflazione_rid_pct: 0.02,
  degradazione_pannelli_pct: 0.005,
  costo_manutenzione_anno_eur: 100,
  costo_sostituzione_inverter_eur: 1500,
  anno_sostituzione_inverter: 12,
  orizzonte_anni: 25,
  ...over,
});

const mkVariante = (
  id: string,
  label: string,
  cassa: InputCassaCumulata,
  extra: Partial<VarianteInput> = {},
): VarianteInput => ({
  id,
  label,
  potenza_kwp: 6,
  con_accumulo: false,
  cassa,
  ...extra,
});

describe("calcolaKpiVariante — coerenza col motore finanziario", () => {
  it("espone gli stessi numeri che produrrebbe calcolaCassaCumulata/payback/NPV", () => {
    const input = baseInput();
    const v = mkVariante("a", "Base", input);
    const kpi = calcolaKpiVariante(v);

    const cassaRef = calcolaCassaCumulata(input);
    const anno1 = cassaRef.find((f) => f.anno === 1)!;

    expect(kpi.risparmio_anno_1_eur).toBe(anno1.flusso);
    expect(kpi.payback_anni).toBe(calcolaPayback(cassaRef));
    expect(kpi.npv_eur).toBe(calcolaNPV(cassaRef, 0.04));
    expect(kpi.beneficio_totale_eur).toBe(cassaRef[cassaRef.length - 1].cumulato);
    expect(kpi.investimento_eur).toBe(10000);

    // LCOE deve coincidere col calcolo diretto sul medesimo input
    expect(kpi.lcoe_eur_kwh).toBe(
      calcolaLCOE({
        investimento_iniziale: input.investimento_iniziale,
        produzione_anno_1_kwh: input.produzione_anno_1_kwh,
        degradazione_pannelli_pct: input.degradazione_pannelli_pct,
        costo_manutenzione_anno_eur: input.costo_manutenzione_anno_eur,
        costo_sostituzione_inverter_eur: input.costo_sostituzione_inverter_eur,
        anno_sostituzione_inverter: input.anno_sostituzione_inverter,
        orizzonte_anni: input.orizzonte_anni,
        tasso_sconto: 0.04,
      }),
    );
    expect(kpi.lcoe_eur_kwh).toBeGreaterThan(0);
  });

  it("beneficio LORDO anno 1 = flusso netto + manutenzione (sostituzione inverter è all'anno 12)", () => {
    const kpi = calcolaKpiVariante(mkVariante("a", "Base", baseInput()));
    // lordo - netto deve essere esattamente la manutenzione annua (100)
    expect(
      Math.round((kpi.beneficio_lordo_anno_1_eur - kpi.risparmio_anno_1_eur) * 100) / 100,
    ).toBe(100);
    expect(kpi.beneficio_lordo_anno_1_eur).toBeGreaterThan(0);
  });

  it("rispetta il tasso_npv per-variante", () => {
    const input = baseInput();
    const kpiDefault = calcolaKpiVariante(mkVariante("a", "Base", input));
    const kpiTassoAlto = calcolaKpiVariante(
      mkVariante("a", "Base", input, { tasso_npv: 0.08 }),
    );
    // Tasso di sconto più alto ⇒ NPV più basso (flussi futuri valgono meno)
    expect(kpiTassoAlto.npv_eur).toBeLessThan(kpiDefault.npv_eur);
    expect(kpiTassoAlto.npv_eur).toBe(calcolaNPV(calcolaCassaCumulata(input), 0.08));
  });
});

describe("confrontaVarianti — badge e variante consigliata", () => {
  it("input vuoto → risultato vuoto, nessun id", () => {
    const out = confrontaVarianti([]);
    expect(out.varianti).toEqual([]);
    expect(out.best_payback_id).toBeNull();
    expect(out.best_npv_id).toBeNull();
    expect(out.consigliata_id).toBeNull();
  });

  it("variante singola con payback finito → riceve tutti i badge", () => {
    const out = confrontaVarianti([mkVariante("solo", "Unica", baseInput())]);
    expect(out.varianti).toHaveLength(1);
    const v = out.varianti[0];
    expect(v.is_best_payback).toBe(true);
    expect(v.is_best_npv).toBe(true);
    expect(v.is_consigliata).toBe(true);
    expect(out.consigliata_id).toBe("solo");
  });

  it("assegna best_npv e best_payback in modo coerente e preserva l'ordine di input", () => {
    // A: piccola/economica (payback rapido, NPV più basso)
    const a = mkVariante("a", "6 kWp", baseInput(), { potenza_kwp: 6 });
    // B: grande + accumulo (investe di più, autoconsuma di più → NPV più alto, payback più lungo)
    const b = mkVariante(
      "b",
      "8 kWp + accumulo",
      baseInput({
        investimento_iniziale: 17000,
        produzione_anno_1_kwh: 10800,
        autoconsumo_pct: 0.72,
        capacita_accumulo_kwh: 10,
      }),
      { potenza_kwp: 8, con_accumulo: true, capacita_accumulo_kwh: 10 },
    );

    const out = confrontaVarianti([a, b]);

    // ordine preservato
    expect(out.varianti.map((v) => v.id)).toEqual(["a", "b"]);

    // esattamente una best_npv e una best_payback (tra i payback finiti)
    expect(out.varianti.filter((v) => v.is_best_npv)).toHaveLength(1);
    expect(out.varianti.filter((v) => v.is_best_payback)).toHaveLength(1);
    expect(out.varianti.filter((v) => v.is_consigliata)).toHaveLength(1);

    // i badge puntano agli id dichiarati
    const bestNpv = out.varianti.find((v) => v.is_best_npv)!;
    const bestPb = out.varianti.find((v) => v.is_best_payback)!;
    expect(bestNpv.id).toBe(out.best_npv_id);
    expect(bestPb.id).toBe(out.best_payback_id);

    // sanity: B autoconsuma di più e produce di più ⇒ NPV di B ≥ NPV di A
    const kA = out.varianti.find((v) => v.id === "a")!;
    const kB = out.varianti.find((v) => v.id === "b")!;
    expect(kB.npv_eur).toBeGreaterThan(kA.npv_eur);
    expect(out.best_npv_id).toBe("b");
  });

  it("una variante che non rientra mai NON è best_payback; la consigliata cade sul miglior NPV con payback finito", () => {
    // buona: rientra
    const buona = mkVariante("buona", "Conveniente", baseInput());
    // pessima: investimento enorme vs produzione minima → payback null
    const pessima = mkVariante(
      "pessima",
      "Sovradimensionata",
      baseInput({
        investimento_iniziale: 200000,
        produzione_anno_1_kwh: 1000,
        autoconsumo_pct: 0.3,
        detrazione_annua_eur: 0,
      }),
    );

    const out = confrontaVarianti([pessima, buona]);

    const kPessima = out.varianti.find((v) => v.id === "pessima")!;
    const kBuona = out.varianti.find((v) => v.id === "buona")!;

    expect(kPessima.payback_anni).toBeNull();
    expect(kPessima.is_best_payback).toBe(false);
    expect(kBuona.payback_anni).not.toBeNull();
    expect(out.best_payback_id).toBe("buona");
    // consigliata = miglior NPV tra quelle con payback finito → "buona"
    expect(out.consigliata_id).toBe("buona");
    expect(kBuona.is_consigliata).toBe(true);
  });
});

describe("buildVariantiVicine — generazione varianti adiacenti", () => {
  const PROFILO = {
    autoconsumo_no_accumulo: 0.35,
    autoconsumo_accumulo_5kwh: 0.55,
    autoconsumo_accumulo_10kwh: 0.7,
    autoconsumo_accumulo_15kwh: 0.8,
  };

  const ctx = (over: Partial<ContestoVariantiVicine> = {}): ContestoVariantiVicine => ({
    potenza_kwp: 6,
    investimento_eur: 12000,
    produzione_anno_1_kwh: 8400, // 1400 kWh/kWp
    autoconsumo_pct: 0.35, // = profilo no-accumulo (non cap: 8400*0.35=2940 < 4500)
    consumo_annuo_kwh: 4500,
    costo_kwh_attuale: 0.32,
    prezzo_rid_kwh: 0.1,
    detrazione_annua_eur: 600,
    con_accumulo: false,
    capacita_accumulo_kwh: 0,
    costo_kwp_base: 1300,
    costo_accumulo_kwh: 600,
    profilo: PROFILO,
    ...over,
  });

  it("base senza accumulo + profilo → base + più potenza + con accumulo", () => {
    const vs = buildVariantiVicine(ctx());
    expect(vs.map((v) => v.id)).toEqual(["base", "piu_potenza", "con_accumulo"]);

    const base = vs.find((v) => v.id === "base")!;
    expect(base.cassa.investimento_iniziale).toBe(12000);
    expect(base.cassa.autoconsumo_pct).toBe(0.35);
    expect(base.cassa.produzione_anno_1_kwh).toBe(8400);
  });

  it("più potenza: +2 kWp scala produzione e investimento con costo marginale", () => {
    const v = buildVariantiVicine(ctx()).find((x) => x.id === "piu_potenza")!;
    expect(v.potenza_kwp).toBe(8);
    expect(v.cassa.produzione_anno_1_kwh).toBeCloseTo((8400 * 8) / 6, 4); // 11200
    expect(v.cassa.investimento_iniziale).toBe(12000 + 2 * 1300); // 14600
    // manutenzione scala con la potenza (8 kWp × 8 €/kWp = 64)
    expect(v.cassa.costo_manutenzione_anno_eur).toBe(64);
  });

  it("con accumulo: investe di più, alza l'autoconsumo MA è limitato al consumo (cap)", () => {
    const v = buildVariantiVicine(ctx()).find((x) => x.id === "con_accumulo")!;
    expect(v.con_accumulo).toBe(true);
    expect(v.capacita_accumulo_kwh).toBe(10);
    expect(v.cassa.investimento_iniziale).toBe(12000 + 10 * 600); // 18000
    // profilo a 10 kWh = 0.70 ⇒ 8400*0.70 = 5880 > consumo 4500 ⇒ cap a 4500/8400
    expect(v.cassa.autoconsumo_pct).toBeCloseTo(4500 / 8400, 4);
    expect(v.cassa.autoconsumo_pct).toBeLessThan(0.7);
  });

  it("senza profilo → niente varianti accumulo (solo base + più potenza)", () => {
    const vs = buildVariantiVicine(ctx({ profilo: null }));
    expect(vs.map((v) => v.id)).toEqual(["base", "piu_potenza"]);
  });

  it("senza costo €/kWp → niente variante 'più potenza'", () => {
    const vs = buildVariantiVicine(ctx({ costo_kwp_base: 0 }));
    expect(vs.map((v) => v.id)).toEqual(["base", "con_accumulo"]);
  });

  it("base CON accumulo → propone la variante 'senza accumulo' più economica", () => {
    const vs = buildVariantiVicine(
      ctx({ con_accumulo: true, capacita_accumulo_kwh: 10, investimento_eur: 18000, autoconsumo_pct: 0.5 }),
    );
    const senza = vs.find((v) => v.id === "senza_accumulo")!;
    expect(senza).toBeTruthy();
    expect(senza.con_accumulo).toBe(false);
    expect(senza.cassa.investimento_iniziale).toBe(18000 - 10 * 600); // 12000
  });

  it("costruisciConfrontoVicino → 3 varianti con badge ed esattamente una consigliata", () => {
    const out = costruisciConfrontoVicino(ctx());
    expect(out.varianti).toHaveLength(3);
    expect(out.varianti.filter((v) => v.is_consigliata)).toHaveLength(1);
    expect(out.consigliata_id).not.toBeNull();
    // la base deve riportare l'investimento autoritativo invariato
    const base = out.varianti.find((v) => v.id === "base")!;
    expect(base.investimento_eur).toBe(12000);
  });

  it("inputBaseDaContesto riflette la configurazione base del contesto", () => {
    const inp = inputBaseDaContesto(ctx({ investimento_eur: 12345, autoconsumo_pct: 0.42 }));
    expect(inp.investimento_iniziale).toBe(12345);
    expect(inp.produzione_anno_1_kwh).toBe(8400);
    expect(inp.autoconsumo_pct).toBe(0.42);
    expect(inp.costo_kwh_attuale).toBe(0.32);
  });
});

describe("applicaOverride — simulatore interattivo", () => {
  it("clampa autoconsumo in [0,1], prezzo ≥ 0.01, inflazione in [0,0.2]", () => {
    expect(applicaOverride(baseInput(), { autoconsumo_pct: 1.5 }).autoconsumo_pct).toBe(1);
    expect(applicaOverride(baseInput(), { autoconsumo_pct: -0.3 }).autoconsumo_pct).toBe(0);
    expect(applicaOverride(baseInput(), { costo_kwh_attuale: 0 }).costo_kwh_attuale).toBe(0.01);
    expect(applicaOverride(baseInput(), { inflazione_energia_pct: 0.9 }).inflazione_energia_pct).toBe(0.2);
  });

  it("i campi non specificati restano invariati", () => {
    const b = baseInput();
    const o = applicaOverride(b, { costo_kwh_attuale: 0.4 });
    expect(o.costo_kwh_attuale).toBe(0.4);
    expect(o.autoconsumo_pct).toBe(b.autoconsumo_pct);
    expect(o.inflazione_energia_pct).toBe(b.inflazione_energia_pct);
  });

  it("prezzo energia più alto ⇒ NPV più alto (ricalcolo via motore)", () => {
    const b = baseInput();
    const low = calcolaKpiVariante({
      id: "l",
      label: "l",
      potenza_kwp: 6,
      con_accumulo: false,
      cassa: applicaOverride(b, { costo_kwh_attuale: 0.25 }),
    });
    const high = calcolaKpiVariante({
      id: "h",
      label: "h",
      potenza_kwp: 6,
      con_accumulo: false,
      cassa: applicaOverride(b, { costo_kwh_attuale: 0.45 }),
    });
    expect(high.npv_eur).toBeGreaterThan(low.npv_eur);
  });
});
