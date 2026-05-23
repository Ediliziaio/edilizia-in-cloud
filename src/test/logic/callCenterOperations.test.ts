import { describe, expect, it } from "vitest";

import { buildCallCenterOperationalDiagnosis } from "@/lib/reporting/callCenterOperations";

describe("call center operational diagnosis", () => {
  it("prioritizes backlog, no-answer leads and slow speed-to-lead", () => {
    const diagnosis = buildCallCenterOperationalDiagnosis({
      lead_assegnati: 50,
      lead_lavorati: 35,
      pct_lead_lavorati: 70,
      lead_contattati: 14,
      tasso_contatto: 40,
      tentativi_totali: 42,
      tentativi_per_contatto: 3,
      avg_speed_to_lead_min: 95,
      median_speed_to_lead_min: 80,
      pct_entro_5min: 8,
      pct_entro_1ora: 35,
      pct_oltre_24ore: 32,
      appuntamenti_fissati: 1,
      tasso_app_su_contattati: 7.1,
      tasso_app_su_assegnati: 2,
      show_up_count: 0,
      tasso_show_up: 0,
      durata_media_min: 2.5,
      chiamate_per_giorno: 18,
      giorni_lavorati: 5,
    });

    expect(diagnosis.unworkedLeads).toBe(15);
    expect(diagnosis.workedNoAnswerLeads).toBe(21);
    expect(diagnosis.healthLabel).toBe("Critico");
    expect(diagnosis.actions.map((action) => action.key)).toEqual(
      expect.arrayContaining(["recover-unworked", "speed-sla", "no-answer", "script"]),
    );
    expect(diagnosis.primaryRisk).toContain("15 lead non lavorati");
  });

  it("recognizes a healthy call center when SLA and conversion are strong", () => {
    const diagnosis = buildCallCenterOperationalDiagnosis({
      lead_assegnati: 40,
      lead_lavorati: 39,
      pct_lead_lavorati: 97.5,
      lead_contattati: 28,
      tasso_contatto: 71.8,
      tentativi_totali: 72,
      tentativi_per_contatto: 2.57,
      avg_speed_to_lead_min: 4,
      median_speed_to_lead_min: 3,
      pct_entro_5min: 82,
      pct_entro_1ora: 95,
      pct_oltre_24ore: 0,
      appuntamenti_fissati: 9,
      tasso_app_su_contattati: 32.1,
      tasso_app_su_assegnati: 22.5,
      show_up_count: 8,
      tasso_show_up: 88.9,
      durata_media_min: 5.8,
      chiamate_per_giorno: 58,
      giorni_lavorati: 6,
    });

    expect(diagnosis.unworkedLeads).toBe(1);
    expect(diagnosis.healthLabel).toBe("In controllo");
    expect(diagnosis.actions[0]?.key).toBe("protect-system");
    expect(diagnosis.healthScore).toBeGreaterThanOrEqual(85);
  });
});
