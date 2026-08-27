import type { VendorKPI } from "@/hooks/useVendorReport";

export type VendorDiagnosisSeverity = "good" | "info" | "warning" | "critical";

export interface VendorIntegrationHealth {
  unassignedContacts: number;
  unassignedOpportunities: number;
  unassignedAppointments: number;
  appointmentsWithoutContact: number;
  pastUncompletedAppointments: number;
  staleOpenOpportunities: number;
}

export interface VendorAction {
  key: string;
  severity: VendorDiagnosisSeverity;
  title: string;
  detail: string;
}

export interface VendorOperationalDiagnosis {
  openOpportunities: number;
  pipelineCoverage: number;
  unresolvedAppointments: number;
  integrationIssues: number;
  healthScore: number;
  healthLabel: "In controllo" | "Da monitorare" | "Critico";
  healthSeverity: VendorDiagnosisSeverity;
  primaryRisk: string;
  actions: VendorAction[];
}

const EMPTY_INTEGRATION: VendorIntegrationHealth = {
  unassignedContacts: 0,
  unassignedOpportunities: 0,
  unassignedAppointments: 0,
  appointmentsWithoutContact: 0,
  pastUncompletedAppointments: 0,
  staleOpenOpportunities: 0,
};

export function buildVendorOperationalDiagnosis(
  kpi: VendorKPI | null | undefined,
  integration: VendorIntegrationHealth | null | undefined = EMPTY_INTEGRATION,
): VendorOperationalDiagnosis {
  const health = integration ?? EMPTY_INTEGRATION;

  if (!kpi || kpi.opp_totali <= 0) {
    const integrationIssues = countIntegrationIssues(health);
    return {
      openOpportunities: 0,
      pipelineCoverage: 0,
      unresolvedAppointments: health.pastUncompletedAppointments,
      integrationIssues,
      healthScore: integrationIssues > 0 ? 55 : 0,
      healthLabel: integrationIssues > 0 ? "Da monitorare" : "Da monitorare",
      healthSeverity: integrationIssues > 0 ? "warning" : "info",
      primaryRisk: integrationIssues > 0
        ? `${integrationIssues} record CRM/calendario non sono collegati correttamente.`
        : "Nessuna opportunità venditore nel periodo selezionato.",
      actions: integrationIssues > 0
        ? [buildAssignmentAction(health)]
        : [
            {
              key: "check-assignment",
              severity: "info",
              title: "Verifica assegnazione venditori",
              detail: "La reportistica diventa affidabile quando contatti, appuntamenti e opportunità hanno un venditore assegnato.",
            },
          ],
    };
  }

  const openOpportunities = Math.max(0, kpi.opp_aperte);
  const pipelineCoverage = computePipelineCoverage(kpi);
  const unresolvedAppointments = Math.max(0, health.pastUncompletedAppointments);
  const integrationIssues = countIntegrationIssues(health);
  const healthScore = computeHealthScore(kpi, health, pipelineCoverage);
  const healthLabel = healthScore >= 85 ? "In controllo" : healthScore >= 65 ? "Da monitorare" : "Critico";
  const healthSeverity: VendorDiagnosisSeverity =
    healthLabel === "In controllo" ? "good" : healthLabel === "Da monitorare" ? "warning" : "critical";
  const actions = buildActions(kpi, health, pipelineCoverage);

  return {
    openOpportunities,
    pipelineCoverage,
    unresolvedAppointments,
    integrationIssues,
    healthScore,
    healthLabel,
    healthSeverity,
    primaryRisk: buildPrimaryRisk(kpi, health, pipelineCoverage, integrationIssues),
    actions: actions.length
      ? actions.slice(0, 5)
      : [
          {
            key: "protect-sales-system",
            severity: "good",
            title: "Sistema commerciale in controllo",
            detail: "Mantieni ogni opportunità con prossimo step, appuntamenti esitati e forecast aggiornato.",
          },
        ],
  };
}

function buildActions(
  kpi: VendorKPI,
  health: VendorIntegrationHealth,
  pipelineCoverage: number,
): VendorAction[] {
  const actions: VendorAction[] = [];
  const integrationIssues = countIntegrationIssues(health);

  if (integrationIssues > 0) {
    actions.push(buildAssignmentAction(health));
  }

  if (health.staleOpenOpportunities > 0) {
    actions.push({
      key: "recover-stale-pipeline",
      severity: health.staleOpenOpportunities >= 8 ? "critical" : "warning",
      title: "Riprendi opportunità senza prossimo step",
      detail: `${formatNumber(health.staleOpenOpportunities)} opportunità aperte sono vecchie o senza prossima azione commerciale.`,
    });
  }

  if (health.pastUncompletedAppointments > 0) {
    actions.push({
      key: "close-appointment-outcomes",
      severity: health.pastUncompletedAppointments >= 6 ? "critical" : "warning",
      title: "Esita gli appuntamenti già passati",
      detail: `${formatNumber(health.pastUncompletedAppointments)} appuntamenti passati risultano ancora senza esito: aggiorna calendario e opportunità collegate.`,
    });
  }

  if ((kpi.tasso_show_up ?? 0) < 60 && kpi.appuntamenti_fissati >= 5) {
    actions.push({
      key: "reduce-no-show",
      severity: (kpi.tasso_show_up ?? 0) < 45 ? "critical" : "warning",
      title: "Riduci no-show appuntamenti",
      detail: `Show-up al ${formatPct(kpi.tasso_show_up)} con ${formatNumber(kpi.appuntamenti_no_show)} no-show: servono conferma e reminder prima della visita.`,
    });
  }

  if ((kpi.tasso_app_to_close ?? 0) < 15 && kpi.appuntamenti_effettuati >= 3) {
    actions.push({
      key: "improve-sales-conversion",
      severity: "critical",
      title: "Migliora conversione appuntamento-vendita",
      detail: `Solo il ${formatPct(kpi.tasso_app_to_close)} degli appuntamenti effettuati diventa vendita: rivedi diagnosi, offerta e follow-up preventivo.`,
    });
  }

  if (pipelineCoverage > 0 && pipelineCoverage < 3 && kpi.fatturato_generato > 0) {
    actions.push({
      key: "increase-pipeline-coverage",
      severity: pipelineCoverage < 2 ? "critical" : "warning",
      title: "Aumenta copertura pipeline",
      detail: `Pipeline a ${formatNumber(pipelineCoverage)}x del fatturato generato; per forecast stabile punta almeno a 3x.`,
    });
  }

  if (kpi.avg_giorni_chiusura > 60 && kpi.opp_vinte >= 2) {
    actions.push({
      key: "shorten-sales-cycle",
      severity: "warning",
      title: "Accorcia il ciclo di vendita",
      detail: `Chiusura media ${formatNumber(kpi.avg_giorni_chiusura)} giorni: definisci scadenza offerta e follow-up programmato.`,
    });
  }

  if (kpi.fatturato_perso > kpi.fatturato_generato && kpi.opp_perse > 0) {
    actions.push({
      key: "review-lost-reasons",
      severity: "warning",
      title: "Analizza motivi di perdita",
      detail: `Fatturato perso ${formatCurrency(kpi.fatturato_perso)} contro ${formatCurrency(kpi.fatturato_generato)} generato.`,
    });
  }

  return actions;
}

function buildAssignmentAction(health: VendorIntegrationHealth): VendorAction {
  const details = [
    health.unassignedContacts > 0 ? `${formatNumber(health.unassignedContacts)} contatti senza venditore` : "",
    health.unassignedOpportunities > 0 ? `${formatNumber(health.unassignedOpportunities)} opportunità senza venditore` : "",
    health.unassignedAppointments > 0 ? `${formatNumber(health.unassignedAppointments)} appuntamenti senza venditore` : "",
    health.appointmentsWithoutContact > 0 ? `${formatNumber(health.appointmentsWithoutContact)} appuntamenti senza contatto` : "",
  ].filter(Boolean);

  return {
    key: "fix-crm-assignment",
    severity: countIntegrationIssues(health) >= 10 ? "critical" : "warning",
    title: "Sistema le assegnazioni CRM",
    detail: details.length
      ? `${details.join(", ")}.`
      : "Controlla che contatti, appuntamenti e opportunità abbiano venditore e contatto collegati.",
  };
}

function buildPrimaryRisk(
  kpi: VendorKPI,
  health: VendorIntegrationHealth,
  pipelineCoverage: number,
  integrationIssues: number,
) {
  if (integrationIssues > 0) return `${formatNumber(integrationIssues)} record CRM/calendario non sono collegati correttamente.`;
  if (health.staleOpenOpportunities > 0) return `${formatNumber(health.staleOpenOpportunities)} opportunità aperte sono senza prossimo step.`;
  if (health.pastUncompletedAppointments > 0) return `${formatNumber(health.pastUncompletedAppointments)} appuntamenti passati non hanno ancora un esito.`;
  if ((kpi.tasso_app_to_close ?? 0) < 15 && kpi.appuntamenti_effettuati > 0) return "Gli appuntamenti vengono fatti, ma convertono poco in vendite.";
  if (pipelineCoverage > 0 && pipelineCoverage < 3) return `Pipeline coverage ${formatNumber(pipelineCoverage)}x: forecast commerciale fragile.`;
  return "Nessun rischio operativo urgente rilevato.";
}

function computeHealthScore(kpi: VendorKPI, health: VendorIntegrationHealth, pipelineCoverage: number) {
  const closeScore = scoreAgainstTarget(kpi.tasso_chiusura ?? 0, 35);
  const showUpScore = scoreAgainstTarget(kpi.tasso_show_up ?? 0, 75);
  const appCloseScore = scoreAgainstTarget(kpi.tasso_app_to_close ?? 0, 25);
  const pipelineScore = scoreAgainstTarget(pipelineCoverage, 3);
  const integrationScore = scoreIntegration(health);

  return Math.round(
    closeScore * 0.22 +
      showUpScore * 0.18 +
      appCloseScore * 0.22 +
      pipelineScore * 0.18 +
      integrationScore * 0.2,
  );
}

function computePipelineCoverage(kpi: VendorKPI) {
  if (kpi.fatturato_generato > 0) {
    return roundOne(kpi.pipeline_valore / kpi.fatturato_generato);
  }
  if (kpi.pipeline_valore > 0 && kpi.importo_medio_chiusura > 0) {
    return roundOne(kpi.pipeline_valore / kpi.importo_medio_chiusura);
  }
  return 0;
}

function countIntegrationIssues(health: VendorIntegrationHealth) {
  return Math.max(0,
    health.unassignedContacts +
      health.unassignedOpportunities +
      health.unassignedAppointments +
      health.appointmentsWithoutContact,
  );
}

function scoreIntegration(health: VendorIntegrationHealth) {
  const hardIssues = countIntegrationIssues(health);
  const operationalIssues = health.pastUncompletedAppointments + health.staleOpenOpportunities;
  return clamp(100 - hardIssues * 6 - operationalIssues * 4, 0, 100);
}

function scoreAgainstTarget(value: number, target: number) {
  if (target <= 0) return 0;
  return clamp((Number(value || 0) / target) * 100, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function formatPct(value: number | null | undefined) {
  return `${formatNumber(value ?? 0)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0, useGrouping: "always" }).format(value);
}
