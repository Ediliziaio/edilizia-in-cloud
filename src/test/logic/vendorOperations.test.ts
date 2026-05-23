import { describe, expect, it } from "vitest";

import { buildVendorOperationalDiagnosis } from "@/lib/reporting/vendorOperations";

describe("vendor operational diagnosis", () => {
  it("prioritizes missing CRM links, stale pipeline and unresolved appointments", () => {
    const diagnosis = buildVendorOperationalDiagnosis(
      {
        agent_id: "team",
        nome_agente: "Team completo",
        email_agente: "",
        opp_totali: 38,
        opp_vinte: 2,
        opp_perse: 12,
        opp_aperte: 24,
        tasso_chiusura: 14.3,
        tasso_conversione: 5.3,
        fatturato_generato: 18_000,
        importo_medio_chiusura: 9_000,
        pipeline_valore: 32_000,
        fatturato_perso: 96_000,
        appuntamenti_fissati: 31,
        appuntamenti_effettuati: 12,
        appuntamenti_no_show: 9,
        tasso_show_up: 38.7,
        tasso_app_to_opp: 55,
        tasso_app_to_close: 8.3,
        avg_giorni_chiusura: 74,
        avg_giorni_chiusura_perse: 18,
        min_giorni_chiusura: 11,
        max_giorni_chiusura: 112,
        nuovi_contatti: 44,
      },
      {
        unassignedContacts: 5,
        unassignedOpportunities: 3,
        unassignedAppointments: 2,
        appointmentsWithoutContact: 4,
        pastUncompletedAppointments: 7,
        staleOpenOpportunities: 11,
      },
    );

    expect(diagnosis.healthLabel).toBe("Critico");
    expect(diagnosis.openOpportunities).toBe(24);
    expect(diagnosis.pipelineCoverage).toBe(1.8);
    expect(diagnosis.unresolvedAppointments).toBe(7);
    expect(diagnosis.integrationIssues).toBe(14);
    expect(diagnosis.actions.map((action) => action.key)).toEqual(
      expect.arrayContaining([
        "fix-crm-assignment",
        "recover-stale-pipeline",
        "close-appointment-outcomes",
        "improve-sales-conversion",
      ]),
    );
    expect(diagnosis.primaryRisk).toContain("record CRM/calendario");
  });

  it("recognizes a healthy vendor flow when CRM, calendar and sales signals are aligned", () => {
    const diagnosis = buildVendorOperationalDiagnosis(
      {
        agent_id: "agent-1",
        nome_agente: "Sara Commerciale",
        email_agente: "sara@example.test",
        opp_totali: 28,
        opp_vinte: 11,
        opp_perse: 9,
        opp_aperte: 8,
        tasso_chiusura: 55,
        tasso_conversione: 39.3,
        fatturato_generato: 128_000,
        importo_medio_chiusura: 11_636,
        pipeline_valore: 420_000,
        fatturato_perso: 72_000,
        appuntamenti_fissati: 34,
        appuntamenti_effettuati: 29,
        appuntamenti_no_show: 2,
        tasso_show_up: 85.3,
        tasso_app_to_opp: 96.5,
        tasso_app_to_close: 37.9,
        avg_giorni_chiusura: 26,
        avg_giorni_chiusura_perse: 31,
        min_giorni_chiusura: 7,
        max_giorni_chiusura: 45,
        nuovi_contatti: 36,
      },
      {
        unassignedContacts: 0,
        unassignedOpportunities: 0,
        unassignedAppointments: 0,
        appointmentsWithoutContact: 0,
        pastUncompletedAppointments: 0,
        staleOpenOpportunities: 0,
      },
    );

    expect(diagnosis.healthLabel).toBe("In controllo");
    expect(diagnosis.actions[0]?.key).toBe("protect-sales-system");
    expect(diagnosis.healthScore).toBeGreaterThanOrEqual(85);
    expect(diagnosis.integrationIssues).toBe(0);
  });
});
