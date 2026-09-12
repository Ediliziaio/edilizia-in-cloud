import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { VendorKPI } from "@/hooks/useVendorReport";
import {
  aggregateTeamKPI,
  giorniTesto,
  periodoPrecedente,
  semaforoVenditori,
  tassoTesto,
} from "@/lib/reporting/venditoriRegole";
import { buildVendorOperationalDiagnosis } from "@/lib/reporting/vendorOperations";

function riga(p: Partial<VendorKPI>): VendorKPI {
  return {
    agent_id: "a",
    nome_agente: "A",
    email_agente: "",
    opp_totali: 0,
    opp_vinte: 0,
    opp_perse: 0,
    opp_aperte: 0,
    tasso_chiusura: null,
    tasso_conversione: null,
    fatturato_generato: 0,
    importo_medio_chiusura: 0,
    pipeline_valore: 0,
    fatturato_perso: 0,
    appuntamenti_fissati: 0,
    appuntamenti_effettuati: 0,
    appuntamenti_no_show: 0,
    tasso_show_up: null,
    tasso_app_to_opp: null,
    tasso_app_to_close: null,
    avg_giorni_chiusura: 0,
    avg_giorni_chiusura_perse: 0,
    min_giorni_chiusura: 0,
    max_giorni_chiusura: 0,
    nuovi_contatti: 0,
    ...p,
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("totale del team", () => {
  // Marco: 80 appuntamenti con esito, 60 fatti. Luca: 1 con esito, fatto.
  const marco = riga({
    agent_id: "marco", opp_totali: 20, opp_vinte: 6, opp_perse: 14, tasso_chiusura: 30, tasso_conversione: 25,
    fatturato_generato: 60_000, appuntamenti_effettuati: 60, appuntamenti_no_show: 20, tasso_show_up: 75,
    tasso_app_to_opp: 50, tasso_app_to_close: 10, avg_giorni_chiusura: 40, min_giorni_chiusura: 10, max_giorni_chiusura: 90,
    avg_giorni_chiusura_perse: 20,
  });
  const luca = riga({
    agent_id: "luca", opp_totali: 2, opp_vinte: 1, opp_perse: 0, tasso_chiusura: 100, tasso_conversione: 50,
    fatturato_generato: 5_000, appuntamenti_effettuati: 1, appuntamenti_no_show: 0, tasso_show_up: 100,
    tasso_app_to_opp: 100, tasso_app_to_close: 100, avg_giorni_chiusura: 5, min_giorni_chiusura: 5, max_giorni_chiusura: 5,
  });
  const senzaVendite = riga({ agent_id: "nuovo", opp_totali: 3, opp_perse: 1, tasso_chiusura: 0, tasso_conversione: 0 });

  it("ricompone i tassi dai conteggi, non come media dei tassi", () => {
    const t = aggregateTeamKPI([marco, luca])!;
    expect(t.tasso_chiusura).toBe(33.3); // 7 su 21, non (30 + 100) / 2
    expect(t.tasso_show_up).toBe(75.3); // 61 su 81
    expect(t.tasso_app_to_close).toBe(11.5); // (6 + 1) su 61
    expect(t.tasso_app_to_opp).toBe(50.8); // (30 + 1) su 61
    expect(t.tasso_conversione).toBe(27.3); // (5 + 1) su 22
    expect(t.importo_medio_chiusura).toBe(9_286); // 65.000 su 7 vinte
  });

  it("pesa il ciclo sulle vendite e ignora chi non ne ha", () => {
    const t = aggregateTeamKPI([marco, luca, senzaVendite])!;
    expect(t.avg_giorni_chiusura).toBe(35); // (6×40 + 1×5) / 7
    expect(t.min_giorni_chiusura).toBe(5);
    expect(t.max_giorni_chiusura).toBe(90);
    expect(t.avg_giorni_chiusura_perse).toBe(18.7); // (14×20 + 1×0) / 15
  });

  it("lascia «—» quando il tasso non si può calcolare", () => {
    const t = aggregateTeamKPI([riga({ opp_totali: 4 })])!;
    expect(t.tasso_chiusura).toBeNull();
    expect(t.tasso_show_up).toBeNull();
    expect(tassoTesto(t.tasso_chiusura)).toBe("—");
    expect(giorniTesto(t.avg_giorni_chiusura, t.opp_vinte > 0)).toBe("—");
    expect(aggregateTeamKPI([])).toBeNull();
  });
});

describe("soglie comuni", () => {
  it("un numero, un colore", () => {
    expect(semaforoVenditori("tasso_chiusura", 35)).toBe("buono");
    expect(semaforoVenditori("tasso_chiusura", 20)).toBe("medio");
    expect(semaforoVenditori("tasso_chiusura", 19.9)).toBe("critico");
    expect(semaforoVenditori("tasso_show_up", null)).toBeNull();
    expect(semaforoVenditori("avg_giorni_chiusura", 29)).toBe("buono");
    expect(semaforoVenditori("avg_giorni_chiusura", 45)).toBe("medio");
    expect(semaforoVenditori("avg_giorni_chiusura", 60)).toBe("critico");
    expect(semaforoVenditori("avg_giorni_chiusura", 0)).toBeNull();
  });

  it("scrive i tassi all'italiana", () => {
    expect(tassoTesto(33.3)).toBe("33,3%");
    expect(giorniTesto(12.5)).toBe("12,5 gg");
  });
});

describe("periodo di confronto", () => {
  const oggi = new Date(2026, 8, 11, 15, 0);

  it("il mese in corso si confronta con gli stessi giorni del mese prima", () => {
    const p = periodoPrecedente(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59), 1, oggi);
    expect([iso(p.inizio), iso(p.fine)]).toEqual(["2026-08-01", "2026-08-11"]);
  });

  it("un mese finito con il mese intero prima, anche se ha più giorni", () => {
    const p = periodoPrecedente(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59), 1, new Date(2026, 9, 5));
    expect([iso(p.inizio), iso(p.fine)]).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("l'anno in corso con lo stesso tratto dell'anno scorso", () => {
    const p = periodoPrecedente(new Date(2026, 0, 1), new Date(2026, 11, 31, 23, 59, 59), 12, oggi);
    expect([iso(p.inizio), iso(p.fine)]).toEqual(["2025-01-01", "2025-09-11"]);
  });

  it("il trimestre (luglio–settembre) con aprile–giugno fino allo stesso giorno", () => {
    const p = periodoPrecedente(new Date(2026, 6, 1), new Date(2026, 8, 30, 23, 59, 59), 3, oggi);
    expect([iso(p.inizio), iso(p.fine)]).toEqual(["2026-04-01", "2026-06-11"]);
  });

  it("un periodo libero con altrettanti giorni subito prima", () => {
    const p = periodoPrecedente(new Date(2026, 7, 10), new Date(2026, 7, 19, 23, 59, 59), null, oggi);
    expect([iso(p.inizio), iso(p.fine)]).toEqual(["2026-07-31", "2026-08-09"]);
  });
});

describe("diagnosi con le definizioni nuove", () => {
  it("chi ha chiuso contratti nati prima del periodo non è «senza opportunità»", () => {
    const d = buildVendorOperationalDiagnosis(
      riga({ opp_totali: 0, opp_vinte: 2, opp_perse: 1, tasso_chiusura: 66.7, fatturato_generato: 20_000, importo_medio_chiusura: 10_000, pipeline_valore: 80_000 }),
    );
    expect(d.primaryRisk).not.toBe("Nessuna opportunità venditore nel periodo selezionato.");
    expect(d.healthScore).toBeGreaterThan(0);
  });

  it("appuntamenti senza esito non diventano un 0% di show-up", () => {
    const d = buildVendorOperationalDiagnosis(
      riga({ opp_totali: 5, opp_aperte: 5, appuntamenti_fissati: 12, tasso_show_up: null }),
    );
    expect(d.actions.map((a) => a.key)).not.toContain("reduce-no-show");
  });
});

describe("controllo del CRM", () => {
  it("si conta nel database, non con letture che si fermano a mille righe", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useVendorReport.ts"), "utf8");
    expect(hook).toContain('rpc("vendite_controllo_crm"');
    // niente più letture dirette: gli esiti stanno nello stato, non nella spunta is_completed
    expect(hook).not.toContain('.from("appointments")');
    expect(hook).not.toContain('.from("marketing_contacts")');
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280915410006_vendite_controllo_crm.sql"), "utf8");
    expect(sql).toContain("public.vendite_appuntamenti(p_company, p_da, p_a, null)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.vendite_controllo_crm(uuid, date, date, uuid) from public, anon");
  });
});

describe("filtro per pipeline", () => {
  it("il report passa la pipeline scelta a tutte le funzioni, e il clic la porta nelle opportunità", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useVendorReport.ts"), "utf8");
    expect(hook.match(/p_pipeline_id: pipelineId \?\? null/g)?.length).toBe(3); // KPI, andamento, fasi
    expect(hook).toContain("p_pipeline: pipelineId ?? null"); // controllo del CRM
    const report = readFileSync(
      resolve(process.cwd(), "src/components/reporting/venditori/VenditoriPerformanceReport.tsx"),
      "utf8",
    );
    expect(report).toContain('pipelineId: { key: "pipeline", defaultValue: "tutte" }');
    expect(report).toContain("&pipeline=${pipelineId}");
  });

  it("nel grafico delle fonti i moduli hanno il nome, e il clic filtra con la fonte vera", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/pages/azienda/marketing/SalesOSDashboard.tsx"), "utf8");
    expect(pagina).toContain("goSource(origine)");
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280915410007_venditori_per_pipeline.sql"), "utf8");
    expect(sql).toContain("'Modulo: ' || nullif(btrim(lf.name), '')");
  });
});

describe("dashboard marketing", () => {
  it("conta con le regole comuni e restringe chi vede solo i propri lead", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20280915410009_dashboard_marketing_sulle_regole_comuni.sql"),
      "utf8",
    );
    // vinte e perse datate come ovunque, cancellate fuori, niente is_completed
    expect(sql).toContain("mo.won_at >= v_date_from AND mo.won_at <= v_date_to");
    expect(sql).toContain("mo.lost_at >= v_date_from AND mo.lost_at <= v_date_to");
    expect(sql).not.toMatch(/\w\.is_completed/);
    expect(sql).toContain("IF public.solo_assegnati_attivo() THEN");
    expect(sql).toContain("p_assigned_user_ids IS NULL OR p.id = ANY(p_assigned_user_ids)");
    const kpi = readFileSync(
      resolve(process.cwd(), "src/components/marketing/dashboard/DashboardStrategicKPI.tsx"),
      "utf8",
    );
    expect(kpi).toContain("Vinte ÷ (vinte + perse)");
    expect(kpi).toContain("Effettuati ÷ (effettuati + no-show)");
  });
});
