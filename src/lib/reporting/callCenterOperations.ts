export type CallCenterDiagnosisSeverity = "good" | "info" | "warning" | "critical";

export interface CallCenterOperationalInput {
  lead_assegnati: number;
  lead_lavorati: number;
  pct_lead_lavorati: number;
  lead_contattati: number;
  tasso_contatto: number;
  tentativi_totali: number;
  tentativi_per_contatto: number;
  avg_speed_to_lead_min: number;
  median_speed_to_lead_min: number;
  pct_entro_5min: number;
  pct_entro_1ora: number;
  pct_oltre_24ore: number;
  appuntamenti_fissati: number;
  tasso_app_su_contattati: number;
  tasso_app_su_assegnati: number;
  show_up_count: number;
  tasso_show_up: number;
  durata_media_min: number;
  chiamate_per_giorno: number;
  giorni_lavorati: number;
}

export interface CallCenterAction {
  key: string;
  severity: CallCenterDiagnosisSeverity;
  title: string;
  detail: string;
}

export interface CallCenterOperationalDiagnosis {
  unworkedLeads: number;
  workedNoAnswerLeads: number;
  missedContactLeads: number;
  healthScore: number;
  healthLabel: "In controllo" | "Da monitorare" | "Critico";
  healthSeverity: CallCenterDiagnosisSeverity;
  primaryRisk: string;
  actions: CallCenterAction[];
}

export function buildCallCenterOperationalDiagnosis(
  kpi: CallCenterOperationalInput | null | undefined,
): CallCenterOperationalDiagnosis {
  if (!kpi || kpi.lead_assegnati <= 0) {
    return {
      unworkedLeads: 0,
      workedNoAnswerLeads: 0,
      missedContactLeads: 0,
      healthScore: 0,
      healthLabel: "Da monitorare",
      healthSeverity: "info",
      primaryRisk: "Nessun lead assegnato nel periodo.",
      actions: [
        {
          key: "assign-leads",
          severity: "info",
          title: "Verifica assegnazione lead",
          detail: "La reportistica chiamate diventa utile quando ogni lead ha un operatore assegnato.",
        },
      ],
    };
  }

  const unworkedLeads = Math.max(0, kpi.lead_assegnati - kpi.lead_lavorati);
  const workedNoAnswerLeads = Math.max(0, kpi.lead_lavorati - kpi.lead_contattati);
  const missedContactLeads = Math.max(0, kpi.lead_assegnati - kpi.lead_contattati);
  const healthScore = computeHealthScore(kpi);
  const healthLabel = healthScore >= 85 ? "In controllo" : healthScore >= 65 ? "Da monitorare" : "Critico";
  const healthSeverity: CallCenterDiagnosisSeverity =
    healthLabel === "In controllo" ? "good" : healthLabel === "Da monitorare" ? "warning" : "critical";
  const actions = buildActions(kpi, { unworkedLeads, workedNoAnswerLeads });

  return {
    unworkedLeads,
    workedNoAnswerLeads,
    missedContactLeads,
    healthScore,
    healthLabel,
    healthSeverity,
    primaryRisk: buildPrimaryRisk(kpi, unworkedLeads, workedNoAnswerLeads),
    actions: actions.length
      ? actions
      : [
          {
            key: "protect-system",
            severity: "good",
            title: "Sistema sotto controllo",
            detail: "Mantieni SLA sotto 5 minuti, almeno 3 tentativi nelle prime 24 ore e controllo qualità sugli appuntamenti.",
          },
        ],
  };
}

function buildActions(
  kpi: CallCenterOperationalInput,
  counts: { unworkedLeads: number; workedNoAnswerLeads: number },
): CallCenterAction[] {
  const actions: CallCenterAction[] = [];

  if (counts.unworkedLeads > 0 && (kpi.pct_lead_lavorati < 95 || counts.unworkedLeads >= 3)) {
    actions.push({
      key: "recover-unworked",
      severity: counts.unworkedLeads >= 10 ? "critical" : "warning",
      title: "Recupera lead non lavorati",
      detail: `${counts.unworkedLeads} lead sono assegnati ma non hanno ancora una chiamata registrata.`,
    });
  }

  if (kpi.avg_speed_to_lead_min > 60 || kpi.pct_oltre_24ore > 20) {
    actions.push({
      key: "speed-sla",
      severity: "critical",
      title: "Ripristina SLA di prima chiamata",
      detail: `Speed to lead medio ${formatMinutes(kpi.avg_speed_to_lead_min)}; obiettivo operativo: prima chiamata entro 5 minuti.`,
    });
  } else if (kpi.avg_speed_to_lead_min > 5) {
    actions.push({
      key: "speed-improve",
      severity: "warning",
      title: "Riduci il tempo di presa in carico",
      detail: `Speed to lead medio ${formatMinutes(kpi.avg_speed_to_lead_min)}; prova notifiche immediate e assegnazione automatica.`,
    });
  }

  if (counts.workedNoAnswerLeads > 0 && kpi.tasso_contatto < 60) {
    actions.push({
      key: "no-answer",
      severity: kpi.tasso_contatto < 40 ? "critical" : "warning",
      title: "Aumenta recupero senza risposta",
      detail: `${counts.workedNoAnswerLeads} lead lavorati non risultano contattati: pianifica richiamo a fasce orarie diverse.`,
    });
  }

  if (kpi.tasso_app_su_contattati < 10 && kpi.lead_contattati >= 5) {
    actions.push({
      key: "script",
      severity: "warning",
      title: "Rivedi script e qualificazione",
      detail: `Solo il ${formatPct(kpi.tasso_app_su_contattati)} dei contattati diventa appuntamento.`,
    });
  }

  if (kpi.chiamate_per_giorno > 0 && kpi.chiamate_per_giorno < 25 && kpi.giorni_lavorati >= 3) {
    actions.push({
      key: "volume",
      severity: "warning",
      title: "Aumenta volume chiamate",
      detail: `${formatNumber(kpi.chiamate_per_giorno)} chiamate/giorno: sotto il benchmark minimo operativo.`,
    });
  }

  return actions.slice(0, 4);
}

function buildPrimaryRisk(
  kpi: CallCenterOperationalInput,
  unworkedLeads: number,
  workedNoAnswerLeads: number,
) {
  if (unworkedLeads > 0) return `${unworkedLeads} lead non lavorati stanno bloccando il follow-up.`;
  if (kpi.avg_speed_to_lead_min > 60) return `Prima chiamata lenta: media ${formatMinutes(kpi.avg_speed_to_lead_min)}.`;
  if (workedNoAnswerLeads > 0) return `${workedNoAnswerLeads} lead lavorati sono ancora senza risposta.`;
  if (kpi.tasso_app_su_contattati < 10 && kpi.lead_contattati > 0) return "I contatti rispondono, ma pochi fissano appuntamento.";
  return "Nessun rischio operativo urgente rilevato.";
}

function computeHealthScore(kpi: CallCenterOperationalInput) {
  const coverageScore = scoreAgainstTarget(kpi.pct_lead_lavorati, 90);
  const contactScore = scoreAgainstTarget(kpi.tasso_contatto, 60);
  const appointmentScore = scoreAgainstTarget(kpi.tasso_app_su_contattati, 20);
  const speedScore = scoreSpeed(kpi.avg_speed_to_lead_min);

  return Math.round(coverageScore * 0.25 + contactScore * 0.25 + appointmentScore * 0.25 + speedScore * 0.25);
}

function scoreAgainstTarget(value: number, target: number) {
  if (target <= 0) return 0;
  return clamp((Number(value || 0) / target) * 100, 0, 100);
}

function scoreSpeed(minutes: number) {
  if (!minutes) return 0;
  if (minutes <= 5) return 100;
  if (minutes <= 60) return clamp(90 - ((minutes - 5) / 55) * 30, 55, 90);
  return clamp(55 - (minutes - 60) / 2, 0, 55);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatMinutes(value: number) {
  if (value < 60) return `${formatNumber(value)} min`;
  return `${formatNumber(value / 60)} h`;
}

function formatPct(value: number) {
  return `${formatNumber(value)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}
