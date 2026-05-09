/**
 * Tipi e costanti condivisi tra le 7 tab di SilvioAdminHub.
 * Estratto dal file monolite originale per facilitare manutenzione.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PendingApproval {
  id: string;
  action_id: string;
  preview_md: string;
  context: Record<string, unknown> | null;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface QueueAction {
  id: string;
  action_type: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  workflow_run_id: string | null;
  initiated_by: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface Policy {
  action_type: string;
  mode: "auto" | "auto_notify" | "approval_required" | "blocked";
  display_label: string;
  description: string;
  approval_timeout_minutes: number | null;
  enabled: boolean;
}

export interface AgentRegistry {
  agent_key: string;
  display_name: string;
  mission: string;
  operating_mode:
    | "coordination"
    | "planning"
    | "analysis"
    | "execution"
    | "verification";
  persona_keys: string[];
  allowed_tools: string[];
  model_tier_key: string;
  risk_level: "low" | "medium" | "high" | "critical";
  max_cost_usd: number;
  max_runtime_seconds: number;
  enabled: boolean;
  sort_order: number;
}

export interface AgentMissionSummary {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: string;
  mode: "solo" | "panel" | "debate" | "chain" | "supervised_execution";
  selected_agents: string[];
  summary_md: string | null;
  next_action: string | null;
  confidence: number | null;
  total_cost_usd: number;
  total_tokens: number;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
  review_requested_at?: string | null;
  tasks_count: number;
  completed_tasks_count: number;
  failed_tasks_count: number;
  risks_count: number;
  actionable_count: number;
}

export interface AgentTask {
  id: string;
  mission_id: string;
  agent_key: string;
  status: string;
  output_md: string | null;
  error_message: string | null;
  model_id: string | null;
  tokens_total: number;
  sort_order: number;
  created_at: string;
}

export interface BlackboardEntry {
  id: string;
  mission_id: string;
  agent_key: string | null;
  entry_type: string;
  title: string;
  content: string;
  confidence: number | null;
  visibility: string;
  evidence?: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentToolPermission {
  agent_key: string;
  tool_key: string;
  execution_mode: "read" | "proposal_only" | "approval_required" | "blocked";
  enabled: boolean;
}

export interface AgentMemoryItem {
  id: string;
  agent_key: string;
  memory_type:
    | "fact"
    | "preference"
    | "decision"
    | "pattern"
    | "avoid"
    | "playbook";
  content: string;
  source: string | null;
  confidence: number | null;
  memory_status: "suggested" | "active" | "rejected" | "archived";
  enabled: boolean;
  created_at: string;
}

export interface AgentEvaluation {
  id: string;
  mission_id: string;
  evaluator_agent_key: string;
  quality_score: number | null;
  risk_score: number | null;
  hallucination_risk: "low" | "medium" | "high";
  missing_evidence: boolean;
  needs_human_approval: boolean;
  verdict: "pass" | "needs_revision" | "blocked";
  notes: string | null;
  created_at: string;
}

export interface ChiefBrief {
  id: string;
  for_date: string;
  status: "generated" | "reviewed" | "archived";
  summary_md: string;
  top_priorities: Array<Record<string, unknown>>;
  decisions_needed: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  experiments_suggested: Array<Record<string, unknown>>;
  next_action: string | null;
  snapshot: Record<string, unknown> | null;
  generated_by: string | null;
  generation_cost_usd: number;
  created_at: string;
}

export interface StrategicObjective {
  objective_key: string;
  title: string;
  description: string;
  owner_agent_key: string | null;
  priority: "P0" | "P1" | "P2";
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  cadence: "daily" | "weekly" | "monthly";
  status: "active" | "paused" | "completed" | "archived";
  enabled: boolean;
}

export interface MonitorEvent {
  id: string;
  rule_key: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  metric_key: string;
  metric_value: number | null;
  threshold_value: number | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  summary: string;
  created_at: string;
}

export interface GrowthExperiment {
  id: string;
  title: string;
  hypothesis: string;
  objective_key: string | null;
  owner_agent_key: string | null;
  status:
    | "suggested"
    | "approved"
    | "running"
    | "completed"
    | "rejected"
    | "archived";
  priority: "P0" | "P1" | "P2";
  expected_impact: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  confidence: number | null;
  metric_name: string | null;
  created_at: string;
}

export interface AgentPerformance {
  agent_key: string;
  display_name: string;
  risk_level: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  tasks_total: number;
  tasks_completed: number;
  tasks_failed: number;
  avg_tokens: number;
  avg_seconds: number;
  missions_touched: number;
  qa_blocked_count: number;
  approval_required_count: number;
}

export interface AgentMissionHealth {
  active_missions: number;
  waiting_approval_missions: number;
  failed_missions_7d: number;
  missions_7d: number;
  avg_completed_seconds_7d: number;
  total_cost_usd_7d: number;
  total_tokens_7d: number;
}

export interface AgentToolHealth {
  tool_name: string;
  total_calls_7d: number;
  failed_calls_7d: number;
  blocked_calls_7d: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  last_error_message: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MODE_COLORS: Record<Policy["mode"], string> = {
  auto: "bg-emerald-100 text-emerald-700 border-emerald-300",
  auto_notify: "bg-amber-100 text-amber-700 border-amber-300",
  approval_required: "bg-rose-100 text-rose-700 border-rose-300",
  blocked: "bg-slate-100 text-slate-700 border-slate-300",
};

export const MODE_LABELS: Record<Policy["mode"], string> = {
  auto: "🟢 Auto",
  auto_notify: "🟡 Auto+Notify",
  approval_required: "🔴 Approval",
  blocked: "⛔ Bloccato",
};

export const STATUS_COLORS: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  running: "bg-violet-100 text-violet-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-700",
};

export const AGENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  planning: "bg-blue-100 text-blue-700",
  queued: "bg-blue-100 text-blue-700",
  running: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  skipped: "bg-slate-100 text-slate-700",
  waiting_approval: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-100 text-slate-700",
};

export const AGENT_RISK_COLORS: Record<AgentRegistry["risk_level"], string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

export const MAX_AGENTI_PER_MISSIONE = 5;

export const AGENT_EXPERTISE: Record<string, string> = {
  planner_agent: "priorita, piano e trade-off",
  growth_agent: "SEO, ads, funnel e conversione",
  sales_agent: "pipeline, CRM, demo e follow-up",
  finance_agent: "MRR, costi, margini, pricing e cassa",
  product_tech_agent: "bug, UX, performance e architettura",
  customer_success_agent: "ticket, churn, onboarding e retention",
  qa_compliance_agent: "prove, rischi, GDPR e qualita output",
};

export const AGENT_STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  planning: "Pianificazione",
  queued: "In coda",
  running: "In lavoro",
  completed: "Completata",
  failed: "Fallita",
  skipped: "Saltata",
  waiting_approval: "Review richiesta",
  cancelled: "Annullata",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  queued: "in coda",
  running: "sta lavorando",
  completed: "completato",
  failed: "errore",
  skipped: "saltato",
};

export const MISSION_TEMPLATES: Array<{
  id: string;
  label: string;
  title: string;
  objective: string;
  mode: AgentMissionSummary["mode"];
  agents: string[];
}> = [
  {
    id: "mrr",
    label: "MRR + cassa",
    title: "Analisi MRR e cassa",
    objective:
      "Analizza MRR, unpaid, forecast e costi AI. Evidenzia P0/P1/P2, rischi e una sola prossima azione concreta.",
    mode: "panel",
    agents: ["planner_agent", "finance_agent", "sales_agent", "qa_compliance_agent"],
  },
  {
    id: "growth",
    label: "SEO / Ads",
    title: "Piano crescita SEO e Ads",
    objective:
      "Analizza opportunita SEO, Meta Ads, funnel e conversione per Edilizia in Cloud. Produci priorita operative con evidenze e rischi.",
    mode: "panel",
    agents: ["planner_agent", "growth_agent", "sales_agent", "qa_compliance_agent"],
  },
  {
    id: "ux",
    label: "Bug / UX",
    title: "Audit bug e UX",
    objective:
      "Trova criticita UX, bug, performance e punti di blocco nel flusso indicato. Dammi P0/P1/P2, prove richieste e prossimo fix.",
    mode: "panel",
    agents: ["planner_agent", "product_tech_agent", "customer_success_agent", "qa_compliance_agent"],
  },
  {
    id: "sales",
    label: "Sales OS",
    title: "Audit pipeline vendite",
    objective:
      "Analizza pipeline, CRM, follow-up, lead quality e opportunita. Evidenzia cosa blocca la crescita e la prossima azione commerciale.",
    mode: "panel",
    agents: ["planner_agent", "sales_agent", "growth_agent", "finance_agent", "qa_compliance_agent"],
  },
  {
    id: "compliance",
    label: "GDPR / AI Act",
    title: "Review compliance AI",
    objective:
      "Verifica rischi GDPR, AI Act, sicurezza, permessi e uso dati nel sistema AI. Blocca raccomandazioni senza prove.",
    mode: "panel",
    agents: ["planner_agent", "product_tech_agent", "qa_compliance_agent"],
  },
];

// ============================================================================
// HELPER FUNCTIONS (used principalmente da AgentsMissionTab)
// ============================================================================

export function inferAgentKeysForObjective(
  objective: string,
  availableAgents: AgentRegistry[],
): string[] {
  const text = objective.toLowerCase();
  const wanted = new Set<string>(["planner_agent"]);

  if (/(seo|ads|marketing|funnel|contenut|lead|campagn|conversion)/i.test(text))
    wanted.add("growth_agent");
  if (/(vendit|pipeline|crm|follow|demo|opportun|commercial)/i.test(text))
    wanted.add("sales_agent");
  if (/(mrr|ricav|costi|margini|pricing|cassa|fattur|budget|roi)/i.test(text))
    wanted.add("finance_agent");
  if (/(bug|ux|deploy|performance|codice|prodotto|feature|tecnic|architettur)/i.test(text))
    wanted.add("product_tech_agent");
  if (/(churn|ticket|support|onboarding|cliente|retention|adozione)/i.test(text))
    wanted.add("customer_success_agent");
  wanted.add("qa_compliance_agent");

  const ordered = availableAgents
    .filter((agent) => wanted.has(agent.agent_key))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((agent) => agent.agent_key)
    .slice(0, MAX_AGENTI_PER_MISSIONE);

  if (ordered.length <= 1) {
    return availableAgents
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((agent) => agent.agent_key)
      .slice(0, MAX_AGENTI_PER_MISSIONE);
  }

  return ordered;
}

export function getMissionPhase(
  mission: AgentMissionSummary,
  tasks: AgentTask[],
): { label: string; description: string; tone: string } {
  if (mission.status === "waiting_approval") {
    return {
      label: "Review umana richiesta",
      description:
        "Gli agenti hanno finito. Silvio ha trovato rischi o prove deboli e aspetta una tua validazione.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (mission.status === "completed") {
    return {
      label: "Sintesi pronta",
      description: "Missione chiusa: sintesi e prossimo passo sono disponibili.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (mission.status === "failed") {
    return {
      label: "Errore missione",
      description:
        mission.last_error ?? "La missione si e fermata: apri i task per vedere il punto di rottura.",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }

  const runningTask = tasks.find((task) => task.status === "running");
  if (runningTask) {
    return {
      label: `${runningTask.agent_key} sta lavorando`,
      description: "Sta leggendo tool, memoria e blackboard per produrre il contributo.",
      tone: "border-violet-200 bg-violet-50 text-violet-800",
    };
  }

  return {
    label: AGENT_STATUS_LABELS[mission.status] ?? mission.status,
    description: "La missione e in preparazione o in coda per gli agenti.",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
  };
}

export function extractObjectiveMetricSignals(objective: string): string[] {
  const text = objective.replace(/P[0-2]/gi, " ");
  const matches = [
    ...text.matchAll(
      /(?:€|\$)\s?\d[\d.,]*|\b\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:clienti|utenti|lead|ticket|aziende|demo|trial|fatture|email|messaggi)\b/gi,
    ),
  ].map((match) => match[0].trim());
  return [...new Set(matches)].slice(0, 6);
}

export function buildMissionReadiness(objective: string, agentCount: number) {
  const trimmed = objective.trim();
  const metricSignals = extractObjectiveMetricSignals(trimmed);
  const hasEvidenceCue =
    /(fonte|dato|dati|tool|supabase|database|report|screenshot|log|analytics|search console|meta|crm|query|tabella)/i.test(
      trimmed,
    );
  const hasOutputCue =
    /(p0|p1|p2|evidenz|risch|owner|metrica|metriche|test|criterio|go\/no-go|prossim|azione|scadenz)/i.test(
      trimmed,
    );
  const blockers: string[] = [];
  const warnings: string[] = [];
  const strengths: string[] = [];

  if (trimmed.length < 10) blockers.push("Scrivi un obiettivo operativo.");
  if (agentCount === 0) blockers.push("Nessun agente pronto per questa missione.");
  if (trimmed.length >= 80) strengths.push("Contesto sufficiente per evitare risposte generiche.");
  if (hasOutputCue) {
    strengths.push("Output atteso chiaro: priorita, rischi o prossima azione.");
  } else {
    warnings.push("Aggiungi output atteso: P0/P1/P2, owner, metrica o test.");
  }
  if (metricSignals.length > 0 && !hasEvidenceCue) {
    warnings.push("Hai citato numeri: aggiungi fonte o chiedi agli agenti di verificarli.");
  }
  if (!/(verifica|valid|misura|test|prova|evidenz)/i.test(trimmed)) {
    warnings.push("Aggiungi un criterio di verifica per ridurre allucinazioni.");
  }

  const score = Math.max(
    0,
    Math.min(100, 55 + strengths.length * 12 - blockers.length * 35 - warnings.length * 12),
  );

  return {
    blockers,
    warnings,
    strengths,
    metricSignals,
    score,
    label:
      score >= 80
        ? "Pronto"
        : score >= 60
          ? "Buono con rischi"
          : "Da precisare",
  };
}

export function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getMissionEvidenceGate(blackboard: BlackboardEntry[]) {
  for (const entry of blackboard) {
    const evidence = readObject(entry.evidence);
    const gate = readObject(evidence?.evidence_gate);
    if (!gate) continue;
    return {
      hasCredibleEvidence: gate.has_credible_evidence === true,
      unsupportedClaims: Array.isArray(gate.unsupported_claims)
        ? gate.unsupported_claims.map(String).filter(Boolean)
        : [],
    };
  }
  return null;
}

export function getMissionActionGate(blackboard: BlackboardEntry[]) {
  for (const entry of blackboard) {
    const evidence = readObject(entry.evidence);
    const gate = readObject(evidence?.action_gate);
    if (!gate) continue;
    return {
      rewritten: gate.rewritten === true,
      originalNextAction:
        typeof gate.original_next_action === "string"
          ? gate.original_next_action
          : null,
    };
  }
  return null;
}

export function blackboardEntryToMemoryType(
  entryType: string,
): AgentMemoryItem["memory_type"] {
  if (entryType === "fact") return "fact";
  if (entryType === "decision") return "decision";
  if (entryType === "risk") return "avoid";
  if (entryType === "recommendation") return "pattern";
  return "pattern";
}

export function inferAgentsForMetric(metricKey?: string | null): string[] {
  const key = (metricKey ?? "").toLowerCase();
  const agents = new Set<string>(["planner_agent"]);
  if (/mrr|arr|cost|unpaid|revenue|cash|pricing/.test(key))
    agents.add("finance_agent");
  if (/lead|conversion|campaign|ads|seo|funnel/.test(key))
    agents.add("growth_agent");
  if (/ticket|support|churn|customer/.test(key))
    agents.add("customer_success_agent");
  if (/ai|bug|stability|technical|product/.test(key))
    agents.add("product_tech_agent");
  agents.add("qa_compliance_agent");
  return [...agents].slice(0, 5);
}
