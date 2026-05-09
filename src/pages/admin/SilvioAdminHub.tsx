/**
 * SilvioAdminHub — Hub centrale super_admin per governance Silvio:
 * approval, queue, policy, agenti, memoria e self-learning.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Inbox,
  ListTodo,
  Settings,
  Sparkles,
  Clock,
  RefreshCw,
  AlertTriangle,
  Brain,
  Plus,
  Trash2,
  Save,
  Zap,
  Network,
  PlayCircle,
  Target,
  FileText,
  Activity,
  FlaskConical,
  TrendingUp,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface PendingApproval {
  id: string;
  action_id: string;
  preview_md: string;
  context: Record<string, unknown> | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface QueueAction {
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

interface Policy {
  action_type: string;
  mode: "auto" | "auto_notify" | "approval_required" | "blocked";
  display_label: string;
  description: string;
  approval_timeout_minutes: number | null;
  enabled: boolean;
}

interface AgentRegistry {
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

interface AgentMissionSummary {
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

interface AgentTask {
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

interface BlackboardEntry {
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

interface AgentToolPermission {
  agent_key: string;
  tool_key: string;
  execution_mode: "read" | "proposal_only" | "approval_required" | "blocked";
  enabled: boolean;
}

interface AgentMemoryItem {
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

interface AgentEvaluation {
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

interface ChiefBrief {
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

interface StrategicObjective {
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

interface MonitorEvent {
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

interface GrowthExperiment {
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

interface AgentPerformance {
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

interface AgentMissionHealth {
  active_missions: number;
  waiting_approval_missions: number;
  failed_missions_7d: number;
  missions_7d: number;
  avg_completed_seconds_7d: number;
  total_cost_usd_7d: number;
  total_tokens_7d: number;
}

interface AgentToolHealth {
  tool_name: string;
  total_calls_7d: number;
  failed_calls_7d: number;
  blocked_calls_7d: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  last_error_message: string | null;
}

const MODE_COLORS: Record<Policy["mode"], string> = {
  auto: "bg-emerald-100 text-emerald-700 border-emerald-300",
  auto_notify: "bg-amber-100 text-amber-700 border-amber-300",
  approval_required: "bg-rose-100 text-rose-700 border-rose-300",
  blocked: "bg-slate-100 text-slate-700 border-slate-300",
};
const MODE_LABELS: Record<Policy["mode"], string> = {
  auto: "🟢 Auto",
  auto_notify: "🟡 Auto+Notify",
  approval_required: "🔴 Approval",
  blocked: "⛔ Bloccato",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  running: "bg-violet-100 text-violet-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-700",
};

const AGENT_STATUS_COLORS: Record<string, string> = {
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

const AGENT_RISK_COLORS: Record<AgentRegistry["risk_level"], string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

const MAX_AGENTI_PER_MISSIONE = 5;

const AGENT_EXPERTISE: Record<string, string> = {
  planner_agent: "priorita, piano e trade-off",
  growth_agent: "SEO, ads, funnel e conversione",
  sales_agent: "pipeline, CRM, demo e follow-up",
  finance_agent: "MRR, costi, margini, pricing e cassa",
  product_tech_agent: "bug, UX, performance e architettura",
  customer_success_agent: "ticket, churn, onboarding e retention",
  qa_compliance_agent: "prove, rischi, GDPR e qualita output",
};

const AGENT_STATUS_LABELS: Record<string, string> = {
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

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: "in coda",
  running: "sta lavorando",
  completed: "completato",
  failed: "errore",
  skipped: "saltato",
};

const MISSION_TEMPLATES: Array<{
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

function inferAgentKeysForObjective(
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

function getMissionPhase(
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

function extractObjectiveMetricSignals(objective: string): string[] {
  const text = objective.replace(/P[0-2]/gi, " ");
  const matches = [
    ...text.matchAll(
      /(?:€|\$)\s?\d[\d.,]*|\b\d+(?:[.,]\d+)?\s?%|\b\d+(?:[.,]\d+)?\s?(?:clienti|utenti|lead|ticket|aziende|demo|trial|fatture|email|messaggi)\b/gi,
    ),
  ].map((match) => match[0].trim());
  return [...new Set(matches)].slice(0, 6);
}

function buildMissionReadiness(objective: string, agentCount: number) {
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

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getMissionEvidenceGate(blackboard: BlackboardEntry[]) {
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

function getMissionActionGate(blackboard: BlackboardEntry[]) {
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

function blackboardEntryToMemoryType(
  entryType: string,
): AgentMemoryItem["memory_type"] {
  if (entryType === "fact") return "fact";
  if (entryType === "decision") return "decision";
  if (entryType === "risk") return "avoid";
  if (entryType === "recommendation") return "pattern";
  return "pattern";
}

function inferAgentsForMetric(metricKey?: string | null): string[] {
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

export default function SilvioAdminHub() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">Silvio Admin Hub</h1>
          <p className="text-sm text-muted-foreground">
            Approvazioni, coda azioni outbound, policy automation
          </p>
        </div>
      </div>

      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="approvals" className="gap-2">
            <Inbox className="h-4 w-4" />
            Approvazioni
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Coda azioni
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-2">
            <Settings className="h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Network className="h-4 w-4" />
            Agenti
          </TabsTrigger>
          <TabsTrigger value="chief" className="gap-2">
            <Activity className="h-4 w-4" />
            Chief
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria personas
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-2">
            <Zap className="h-4 w-4" />
            Self-learning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsMissionTab />
        </TabsContent>
        <TabsContent value="chief">
          <ChiefOfStaffTab />
        </TabsContent>
        <TabsContent value="memory">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="learning">
          <LearningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── APPROVALS TAB ─────────────────────────────────────────────────────────

function ApprovalsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-pending-approvals"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_pending_approvals")
        .select("*")
        .eq("status", "awaiting")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingApproval[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected";
    }) => {
      const { error } = await supabase.rpc(
        "silvio_admin_resolve_approval" as never,
        {
          p_approval_id: id,
          p_status: status,
          p_modified_payload: null,
          p_resolution_note: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "approved" ? "Approvata: in esecuzione" : "Rifiutata",
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} azioni in attesa di approvazione
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            Nessuna azione in attesa. Silvio è in pari.
          </CardContent>
        </Card>
      ) : (
        data.map((a) => (
          <Card key={a.id} className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Approvazione richiesta
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {format(new Date(a.created_at), "dd MMM HH:mm", {
                    locale: it,
                  })}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded p-3 text-xs whitespace-pre-wrap font-mono">
                {a.preview_md}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Approvare questa azione e metterla in esecuzione?",
                      )
                    ) {
                      resolveMutation.mutate({ id: a.id, status: "approved" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rifiutare questa azione Silvio? Non verra eseguita.",
                      )
                    ) {
                      resolveMutation.mutate({ id: a.id, status: "rejected" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rifiuta
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Scade:{" "}
                {format(new Date(a.expires_at), "dd MMM HH:mm", { locale: it })}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── QUEUE TAB ─────────────────────────────────────────────────────────────

function QueueTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-action-queue", statusFilter],
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("silvio_action_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as QueueAction[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "silvio_admin_update_queue_action" as never,
        {
          p_action_id: id,
          p_operation: "cancel",
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Azione cancellata");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) =>
      toast.error("Errore cancellazione", { description: String(e) }),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "silvio_admin_update_queue_action" as never,
        {
          p_action_id: id,
          p_operation: "retry",
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-enqueued");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore retry", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtra status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="queued">In coda</SelectItem>
            <SelectItem value="awaiting_approval">
              In attesa approval
            </SelectItem>
            <SelectItem value="running">In esecuzione</SelectItem>
            <SelectItem value="done">Completate</SelectItem>
            <SelectItem value="failed">Fallite</SelectItem>
            <SelectItem value="cancelled">Cancellate</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Coda vuota. Niente azioni schedulate.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Origine</th>
                    <th className="px-3 py-2 text-right">Tentativi</th>
                    <th className="px-3 py-2 text-left">Schedulato</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.action_type}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${STATUS_COLORS[a.status] ?? ""}`}
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {a.initiated_by}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {a.attempts}/{a.max_attempts}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(a.scheduled_for), "dd/MM HH:mm:ss", {
                          locale: it,
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          {a.status === "failed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Rimettere in coda questa azione fallita?",
                                  )
                                )
                                  retryMutation.mutate(a.id);
                              }}
                              disabled={retryMutation.isPending}
                            >
                              Retry
                            </Button>
                          )}
                          {(a.status === "queued" ||
                            a.status === "awaiting_approval") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-rose-600"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Cancellare questa azione dalla coda Silvio?",
                                  )
                                )
                                  cancelMutation.mutate(a.id);
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              Cancella
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── POLICIES TAB ──────────────────────────────────────────────────────────

function PoliciesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["silvio-automation-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_automation_policies")
        .select("*")
        .order("action_type");
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      action_type,
      mode,
    }: {
      action_type: string;
      mode: Policy["mode"];
    }) => {
      const { error } = await supabase
        .from("silvio_automation_policies")
        .update({ mode })
        .eq("action_type", action_type);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy aggiornata");
      queryClient.invalidateQueries({
        queryKey: ["silvio-automation-policies"],
      });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        🟢 <strong>Auto</strong>: Silvio agisce subito · 🟡{" "}
        <strong>Auto+Notify</strong>: agisce + notifica con annulla 5min · 🔴{" "}
        <strong>Approval</strong>: prepara bozza + attende OK · ⛔{" "}
        <strong>Bloccato</strong>: solo Florin manualmente
      </p>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data ? null : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action type</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-left">Modalità</th>
                    <th className="px-3 py-2 text-right">Timeout (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr
                      key={p.action_type}
                      className="border-t hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.action_type}
                      </td>
                      <td className="px-3 py-2">{p.display_label}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={p.mode}
                          onValueChange={(v) =>
                            updateMutation.mutate({
                              action_type: p.action_type,
                              mode: v as Policy["mode"],
                            })
                          }
                        >
                          <SelectTrigger
                            className={`h-8 w-44 text-xs ${MODE_COLORS[p.mode]}`}
                          >
                            <SelectValue>{MODE_LABELS[p.mode]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">🟢 Auto</SelectItem>
                            <SelectItem value="auto_notify">
                              🟡 Auto+Notify
                            </SelectItem>
                            <SelectItem value="approval_required">
                              🔴 Approval
                            </SelectItem>
                            <SelectItem value="blocked">⛔ Bloccato</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {p.approval_timeout_minutes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── CHIEF OF STAFF TAB ───────────────────────────────────────────────────

function ChiefOfStaffTab() {
  const queryClient = useQueryClient();

  const briefsQuery = useQuery({
    queryKey: ["silvio-chief-briefs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_chief_of_staff_briefs" as never)
        .select("*")
        .order("for_date" as never, { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ChiefBrief[];
    },
  });

  const objectivesQuery = useQuery({
    queryKey: ["silvio-strategic-objectives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_strategic_objectives" as never)
        .select("*")
        .eq("enabled" as never, true as never)
        .order("priority" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as StrategicObjective[];
    },
  });

  const monitorEventsQuery = useQuery({
    queryKey: ["silvio-monitor-events"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_monitor_events" as never)
        .select("*")
        .in("status" as never, ["open", "acknowledged"] as never)
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as MonitorEvent[];
    },
  });

  const experimentsQuery = useQuery({
    queryKey: ["silvio-growth-experiments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_growth_experiments" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as GrowthExperiment[];
    },
  });

  const runChiefMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-chief-of-staff",
        {
          body: { force: true, generate_experiments: true },
        },
      );
      if (error) throw error;
      return data as {
        next_action?: string;
        monitor_events_triggered?: number;
        experiments_suggested?: number;
      };
    },
    onSuccess: (data) => {
      toast.success("Chief of Staff aggiornato", {
        description:
          data?.next_action ?? "Brief, monitor ed esperimenti aggiornati",
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-chief-briefs"] });
      queryClient.invalidateQueries({
        queryKey: ["silvio-strategic-objectives"],
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-monitor-events"] });
      queryClient.invalidateQueries({
        queryKey: ["silvio-growth-experiments"],
      });
    },
    onError: (e) =>
      toast.error("Errore Chief of Staff", { description: String(e) }),
  });

  const updateExperimentMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: GrowthExperiment["status"];
    }) => {
      const { error } = await supabase.rpc(
        "silvio_update_experiment_status" as never,
        {
          p_experiment_id: id,
          p_status: status,
          p_result_summary: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Esperimento ${status}`);
      queryClient.invalidateQueries({
        queryKey: ["silvio-growth-experiments"],
      });
    },
    onError: (e) =>
      toast.error("Errore esperimento", { description: String(e) }),
  });

  const updateMonitorMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: MonitorEvent["status"];
    }) => {
      const { error } = await supabase
        .from("silvio_monitor_events" as never)
        .update({
          status,
          resolved_at:
            status === "resolved" || status === "dismissed"
              ? new Date().toISOString()
              : null,
        } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Monitor aggiornato");
      queryClient.invalidateQueries({ queryKey: ["silvio-monitor-events"] });
    },
    onError: (e) => toast.error("Errore monitor", { description: String(e) }),
  });

  const launchChiefMissionMutation = useMutation({
    mutationFn: async ({
      title,
      objective,
      selected_agents,
    }: {
      title: string;
      objective: string;
      selected_agents: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-agent-orchestrator",
        {
          body: {
            title,
            objective,
            mode: "panel",
            priority: "high",
            selected_agents,
          },
        },
      );
      if (error) throw error;
      return data as {
        mission_id?: string;
        accepted?: boolean;
        next_action?: string;
      };
    },
    onSuccess: (data) => {
      toast.success("Missione Silvio avviata", {
        description:
          data?.next_action ??
          "Gli agenti stanno lavorando sul punto operativo.",
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
    },
    onError: (e) =>
      toast.error("Errore avvio missione", { description: String(e) }),
  });

  const briefs = briefsQuery.data ?? [];
  const latestBrief = briefs[0];
  const objectives = objectivesQuery.data ?? [];
  const monitorEvents = monitorEventsQuery.data ?? [];
  const experiments = experimentsQuery.data ?? [];
  const metrics = (latestBrief?.snapshot?.metrics ?? {}) as Record<
    string,
    unknown
  >;

  const metricCards = [
    { label: "MRR", value: `EUR ${Number(metrics.mrr_eur ?? 0).toFixed(0)}` },
    { label: "Paying", value: String(metrics.companies_paying ?? 0) },
    { label: "Unpaid", value: String(metrics.companies_unpaid ?? 0) },
    {
      label: "AI MTD",
      value: `EUR ${Number(metrics.ai_cost_mtd_eur ?? 0).toFixed(2)}`,
    },
    { label: "Ticket", value: String(metrics.open_tickets_total ?? 0) },
    { label: "Hot lead", value: String(metrics.hot_leads_returned ?? 0) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
        <div className="space-y-4 min-w-0">
          <Card className="border-violet-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-500" />
                  Chief of Staff briefing
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => runChiefMutation.mutate()}
                  disabled={runChiefMutation.isPending}
                  className="min-h-10 bg-violet-600 hover:bg-violet-700"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${runChiefMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {runChiefMutation.isPending
                    ? "Analisi in corso..."
                    : "Rigenera ora"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {briefsQuery.isLoading ? (
                <Skeleton className="h-40" />
              ) : !latestBrief ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nessun brief P2 ancora generato. Avvia il Chief of Staff per
                  creare il primo.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                    {metricCards.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-md border bg-muted/30 p-2"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {metric.label}
                        </div>
                        <div className="text-sm font-semibold">
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {format(new Date(latestBrief.for_date), "dd MMM yyyy", {
                        locale: it,
                      })}
                    </Badge>
                    {latestBrief.generated_by && (
                      <Badge variant="secondary" className="text-[10px]">
                        {latestBrief.generated_by}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      cost $
                      {Number(latestBrief.generation_cost_usd ?? 0).toFixed(4)}
                    </span>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                    {latestBrief.summary_md}
                  </div>
                  {latestBrief.next_action && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <strong>Prossimo passo:</strong> {latestBrief.next_action}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Obiettivi permanenti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {objectivesQuery.isLoading ? (
                <Skeleton className="h-32" />
              ) : objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun obiettivo attivo.
                </p>
              ) : (
                objectives.map((objective) => (
                  <div
                    key={objective.objective_key}
                    className="rounded-md border p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {objective.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {objective.objective_key}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {objective.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {objective.description}
                    </p>
                    <div className="flex gap-2 flex-wrap text-[10px] text-muted-foreground">
                      {objective.owner_agent_key && (
                        <span>{objective.owner_agent_key}</span>
                      )}
                      {objective.target_metric && (
                        <span>
                          {objective.target_metric}:{" "}
                          {objective.current_value ?? "n/d"}
                        </span>
                      )}
                      <span>{objective.cadence}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Monitor aperti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {monitorEventsQuery.isLoading ? (
                <Skeleton className="h-28" />
              ) : monitorEvents.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun monitor aperto.
                </div>
              ) : (
                monitorEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          event.severity === "critical" ||
                          event.severity === "high"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {event.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.summary}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {event.metric_key}: {event.metric_value ?? "n/d"} /
                        soglia {event.threshold_value ?? "n/d"}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={updateMonitorMutation.isPending}
                          onClick={() =>
                            updateMonitorMutation.mutate({
                              id: event.id,
                              status: "acknowledged",
                            })
                          }
                        >
                          Visto
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-emerald-700"
                          disabled={updateMonitorMutation.isPending}
                          onClick={() =>
                            updateMonitorMutation.mutate({
                              id: event.id,
                              status: "resolved",
                            })
                          }
                        >
                          Risolto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={launchChiefMissionMutation.isPending}
                          onClick={() =>
                            launchChiefMissionMutation.mutate({
                              title: `Monitor: ${event.title}`,
                              selected_agents: inferAgentsForMetric(
                                event.metric_key,
                              ),
                              objective: [
                                `Analizza e risolvi questo monitor Chief of Staff: ${event.title}.`,
                                `Sintesi: ${event.summary}.`,
                                `Metrica: ${event.metric_key}=${event.metric_value ?? "n/d"}, soglia=${event.threshold_value ?? "n/d"}.`,
                                "Produci cause probabili, rischi, piano P0/P1/P2 e prossima azione verificabile.",
                              ].join("\n"),
                            })
                          }
                        >
                          Missione
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-blue-500" />
                Esperimenti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {experimentsQuery.isLoading ? (
                <Skeleton className="h-32" />
              ) : experiments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun esperimento suggerito.
                </div>
              ) : (
                experiments.map((experiment) => (
                  <div
                    key={experiment.id}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {experiment.priority}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {experiment.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        impatto {experiment.expected_impact} · effort{" "}
                        {experiment.effort}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{experiment.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {experiment.hypothesis}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {experiment.owner_agent_key ?? "owner n/d"} ·{" "}
                        {experiment.metric_name ?? "metrica n/d"}
                      </span>
                      {experiment.status === "suggested" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-rose-600"
                            disabled={updateExperimentMutation.isPending}
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: experiment.id,
                                status: "rejected",
                              })
                            }
                          >
                            Rifiuta
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                            disabled={updateExperimentMutation.isPending}
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: experiment.id,
                                status: "approved",
                              })
                            }
                          >
                            Approva
                          </Button>
                        </div>
                      )}
                      {experiment.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          disabled={updateExperimentMutation.isPending}
                          onClick={() =>
                            updateExperimentMutation.mutate({
                              id: experiment.id,
                              status: "running",
                            })
                          }
                        >
                          Avvia
                        </Button>
                      )}
                      {["suggested", "approved", "running"].includes(
                        experiment.status,
                      ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={launchChiefMissionMutation.isPending}
                          onClick={() =>
                            launchChiefMissionMutation.mutate({
                              title: `Esperimento: ${experiment.title}`,
                              selected_agents: inferAgentsForMetric(
                                experiment.metric_name ??
                                  experiment.objective_key,
                              ),
                              objective: [
                                `Trasforma questo esperimento Chief of Staff in un piano operativo multi-agente: ${experiment.title}.`,
                                `Ipotesi: ${experiment.hypothesis}`,
                                `Obiettivo: ${experiment.objective_key ?? "n/d"}; metrica: ${experiment.metric_name ?? "n/d"}.`,
                                `Impatto atteso: ${experiment.expected_impact}; effort: ${experiment.effort}; confidenza: ${experiment.confidence ?? "n/d"}.`,
                                "Produci step eseguibili, owner, metriche di successo e rischi prima dell'esecuzione.",
                              ].join("\n"),
                            })
                          }
                        >
                          Missione
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── AGENTS TAB ───────────────────────────────────────────────────────────

function AgentsMissionTab() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [mode, setMode] = useState<AgentMissionSummary["mode"]>("panel");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);

  type LaunchMissionInput = {
    title?: string;
    objective?: string;
    mode?: AgentMissionSummary["mode"];
    selected_agents?: string[];
  };

  const agentsQuery = useQuery({
    queryKey: ["silvio-agent-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_registry" as never)
        .select("*")
        .order("sort_order" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentRegistry[];
    },
  });

  const toolPermissionsQuery = useQuery({
    queryKey: ["silvio-agent-tool-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_tool_permissions" as never)
        .select("agent_key,tool_key,execution_mode,enabled")
        .eq("enabled" as never, true as never)
        .order("agent_key" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentToolPermission[];
    },
  });

  const memoryQuery = useQuery({
    queryKey: ["silvio-agent-memory-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_memory" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as AgentMemoryItem[];
    },
  });

  const performanceQuery = useQuery({
    queryKey: ["silvio-agent-performance"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_performance" as never)
        .select("*")
        .order("tasks_failed" as never, { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AgentPerformance[];
    },
  });

  const missionHealthQuery = useQuery({
    queryKey: ["silvio-agent-mission-health"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_mission_health" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgentMissionHealth | null;
    },
  });

  const toolHealthQuery = useQuery({
    queryKey: ["silvio-agent-tool-health"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_tool_health" as never)
        .select("*")
        .order("failed_calls_7d" as never, { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as AgentToolHealth[];
    },
  });

  const missionsQuery = useQuery({
    queryKey: ["silvio-agent-missions"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_mission_summary" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AgentMissionSummary[];
    },
  });

  const missions = missionsQuery.data ?? [];
  const activeMission =
    missions.find((mission) => mission.id === activeMissionId) ??
    missions[0] ??
    null;

  const tasksQuery = useQuery({
    queryKey: ["silvio-agent-tasks", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    refetchInterval:
      activeMission && ["planning", "running"].includes(activeMission.status)
        ? 5_000
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_tasks" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("sort_order" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentTask[];
    },
  });

  const blackboardQuery = useQuery({
    queryKey: ["silvio-agent-blackboard", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    refetchInterval:
      activeMission && ["planning", "running"].includes(activeMission.status)
        ? 5_000
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_blackboard" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("created_at" as never, { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as BlackboardEntry[];
    },
  });

  const evaluationsQuery = useQuery({
    queryKey: ["silvio-agent-evaluations", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_evaluations" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentEvaluation[];
    },
  });

  const launchMutation = useMutation({
    mutationFn: async (input?: LaunchMissionInput) => {
      const missionTitle = input?.title ?? title;
      const missionObjective = input?.objective ?? objective;
      const missionMode = input?.mode ?? mode;
      const missionAgents = input?.selected_agents ?? selectedAgents;
      const payload = {
        title: missionTitle.trim() || undefined,
        objective: missionObjective.trim(),
        mode: missionMode,
        max_agents: MAX_AGENTI_PER_MISSIONE,
        selected_agents: missionAgents.length > 0 ? missionAgents : undefined,
      };
      const { data, error } = await supabase.functions.invoke(
        "silvio-agent-orchestrator",
        {
          body: payload,
        },
      );
      if (error) throw error;
      return data as {
        mission_id?: string;
        next_action?: string;
        accepted?: boolean;
        status?: string;
      };
    },
    onSuccess: (data) => {
      toast.success(
        data?.accepted
          ? "Missione multi-agente avviata"
          : "Missione multi-agente completata",
        {
          description:
            data?.next_action ??
            "Gli agenti lavorano in background. La sintesi comparira appena pronta.",
        },
      );
      if (data?.mission_id) setActiveMissionId(data.mission_id);
      setObjective("");
      setTitle("");
      setSelectedAgents([]);
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-blackboard"] });
    },
    onError: (e) =>
      toast.error("Missione non avviata", {
        description:
          e instanceof Error
            ? e.message
            : "Controlla permessi, obiettivo e connessione Supabase.",
      }),
  });

  const resolveMissionMutation = useMutation({
    mutationFn: async ({
      missionId,
      resolution,
    }: {
      missionId: string;
      resolution: "approved" | "rejected";
    }) => {
      const { error } = await supabase.rpc(
        "silvio_agent_resolve_mission" as never,
        {
          p_mission_id: missionId,
          p_resolution: resolution,
          p_note: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { resolution }) => {
      toast.success(
        resolution === "approved"
          ? "Missione approvata"
          : "Missione archiviata",
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-evaluations"] });
    },
    onError: (e) =>
      toast.error("Errore revisione missione", { description: String(e) }),
  });

  const updateMemoryMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "rejected";
    }) => {
      const { error } = await supabase
        .from("silvio_agent_memory" as never)
        .update({
          memory_status: status,
          enabled: status === "active",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "active"
          ? "Memoria agente attivata"
          : "Memoria agente rifiutata",
      );
      queryClient.invalidateQueries({
        queryKey: ["silvio-agent-memory-latest"],
      });
    },
    onError: (e) =>
      toast.error("Errore memoria agente", { description: String(e) }),
  });

  const saveBlackboardMemoryMutation = useMutation({
    mutationFn: async (entry: BlackboardEntry) => {
      const memoryType = blackboardEntryToMemoryType(entry.entry_type);
      const agentKey = entry.agent_key ?? "planner_agent";
      const content = `${entry.title}: ${entry.content}`.trim().slice(0, 900);
      const { error } = await supabase
        .from("silvio_agent_memory" as never)
        .insert({
          agent_key: agentKey,
          memory_type: memoryType,
          content,
          source: "blackboard_manual_save",
          source_mission_id: entry.mission_id,
          confidence: entry.confidence ?? 0.75,
          memory_status: "active",
          enabled: true,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria agente salvata");
      queryClient.invalidateQueries({
        queryKey: ["silvio-agent-memory-latest"],
      });
    },
    onError: (e) =>
      toast.error("Memoria non salvata", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const agents = (agentsQuery.data ?? []).filter(
    (agent) => agent.agent_key !== "silvio_coordinator",
  );
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const tasks = tasksQuery.data ?? [];
  const blackboard = blackboardQuery.data ?? [];
  const evaluations = evaluationsQuery.data ?? [];
  const latestEvaluation = evaluations[0];
  const memoryItems = memoryQuery.data ?? [];
  const missionHealth = missionHealthQuery.data;
  const performanceRows = performanceQuery.data ?? [];
  const toolHealthRows = toolHealthQuery.data ?? [];
  const fragileAgents = performanceRows
    .filter((agent) => agent.tasks_total > 0)
    .sort(
      (a, b) =>
        b.tasks_failed +
        b.approval_required_count -
        (a.tasks_failed + a.approval_required_count),
    )
    .slice(0, 4);
  const toolsByAgent = (toolPermissionsQuery.data ?? []).reduce<
    Record<string, AgentToolPermission[]>
  >((acc, permission) => {
    acc[permission.agent_key] = [
      ...(acc[permission.agent_key] ?? []),
      permission,
    ];
    return acc;
  }, {});
  const routingAgentKeys = useMemo(() => {
    if (selectedAgents.length > 0) return selectedAgents;
    return inferAgentKeysForObjective(objective, enabledAgents);
  }, [enabledAgents, objective, selectedAgents]);
  const routingAgents = routingAgentKeys
    .map((agentKey) =>
      enabledAgents.find((agent) => agent.agent_key === agentKey),
    )
    .filter((agent): agent is AgentRegistry => Boolean(agent));
  const routingModeLabel =
    selectedAgents.length > 0 ? "Selezione manuale" : "Routing automatico";
  const missionReadiness = useMemo(
    () => buildMissionReadiness(objective, routingAgents.length),
    [objective, routingAgents.length],
  );
  const canLaunchMission =
    missionReadiness.blockers.length === 0 && !launchMutation.isPending;
  const missionProgress =
    activeMission && activeMission.tasks_count > 0
      ? Math.round(
          (activeMission.completed_tasks_count / activeMission.tasks_count) *
            100,
        )
      : 0;
  const missionPhase =
    activeMission !== null ? getMissionPhase(activeMission, tasks) : null;
  const evidenceStats = {
    facts: blackboard.filter((entry) => entry.entry_type === "fact").length,
    insights: blackboard.filter((entry) => entry.entry_type === "insight")
      .length,
    risks: blackboard.filter((entry) => entry.entry_type === "risk").length,
    actions: blackboard.filter(
      (entry) => entry.entry_type === "recommendation",
    ).length,
  };
  const missionEvidenceGate = getMissionEvidenceGate(blackboard);
  const missionActionGate = getMissionActionGate(blackboard);

  const applyTemplate = (template: (typeof MISSION_TEMPLATES)[number]) => {
    setTitle(template.title);
    setObjective(template.objective);
    setMode(template.mode);
    setSelectedAgents(template.agents);
  };

  const handleMissionAsBase = (mission: AgentMissionSummary) => {
    setTitle(`Copia: ${mission.title}`);
    setObjective(mission.objective);
    setMode(mission.mode);
    setSelectedAgents(
      mission.selected_agents
        .filter((agentKey) => agentKey !== "silvio_coordinator")
        .slice(0, MAX_AGENTI_PER_MISSIONE),
    );
    toast.success("Missione caricata nel composer");
  };

  const rerunMissionWithMoreEvidence = (mission: AgentMissionSummary) => {
    const agentKeys = mission.selected_agents
      .filter((agentKey) => agentKey !== "silvio_coordinator")
      .slice(0, MAX_AGENTI_PER_MISSIONE);
    launchMutation.mutate({
      title: `Verifica prove: ${mission.title}`.slice(0, 120),
      mode: mission.mode,
      selected_agents: agentKeys,
      objective: [
        "Rilancia questa missione concentrandoti SOLO su prove, rischi e punti deboli della sintesi precedente.",
        `Obiettivo originale: ${mission.objective}`,
        mission.summary_md
          ? `Sintesi precedente da verificare:\n${mission.summary_md.slice(0, 1800)}`
          : "Sintesi precedente non disponibile.",
        "Output richiesto: evidenze verificate, assunzioni da non trattare come fatti, P0/P1/P2 e una sola prossima azione. Se mancano dati, chiedi il dato preciso.",
      ].join("\n\n"),
    });
  };

  const toggleAgent = (agentKey: string) => {
    setSelectedAgents((current) => {
      if (current.includes(agentKey))
        return current.filter((key) => key !== agentKey);
      if (current.length >= MAX_AGENTI_PER_MISSIONE) {
        toast.info("Massimo 5 agenti per missione");
        return current;
      }
      return [...current, agentKey];
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] gap-4">
      <div className="space-y-4 min-w-0">
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-orange-500" />
              Nuova missione multi-agente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Template rapidi
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Selezionano gia agenti e obiettivo
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                {MISSION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="min-h-11 rounded-md border bg-background px-3 py-2 text-left text-xs font-medium transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Titolo</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Es. Piano crescita Q2"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Modalita
                </label>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value as AgentMissionSummary["mode"])
                  }
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="panel">Panel</SelectItem>
                    <SelectItem value="debate">Debate</SelectItem>
                    <SelectItem value="chain">Chain</SelectItem>
                    <SelectItem value="supervised_execution">
                      Supervised
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Obiettivo operativo
              </label>
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Scrivi il problema o l'obiettivo. Silvio seleziona gli agenti, raccoglie i contributi e produce una sintesi unica."
                rows={5}
                className="min-h-[132px] text-base md:text-sm"
              />
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span
                  className={
                    objective.trim().length < 10
                      ? "text-amber-700"
                      : "text-muted-foreground"
                  }
                >
                  {objective.trim().length < 10
                    ? "Scrivi almeno 10 caratteri per avviare."
                    : "Obiettivo valido: gli agenti avranno un contesto operativo."}
                </span>
                <span className="text-muted-foreground">
                  {objective.trim().length} caratteri
                </span>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Qualita prompt</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      missionReadiness.score >= 80
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : missionReadiness.score >= 60
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {missionReadiness.label} · {missionReadiness.score}%
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {missionReadiness.strengths.slice(0, 2).map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                  {missionReadiness.blockers.map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                  {missionReadiness.warnings.slice(0, 3).map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                {missionReadiness.metricSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {missionReadiness.metricSignals.map((signal) => (
                      <Badge key={signal} variant="secondary" className="text-[10px]">
                        numero da verificare: {signal}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Agenti ({routingAgents.length}/{MAX_AGENTI_PER_MISSIONE})
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedAgents([])}
                >
                  Routing automatico
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {enabledAgents.map((agent) => {
                  const selected = selectedAgents.includes(agent.agent_key);
                  return (
                    <button
                      key={agent.agent_key}
                      type="button"
                      onClick={() => toggleAgent(agent.agent_key)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-left text-xs transition ${
                        selected
                          ? "border-orange-400 bg-orange-50 text-orange-800 shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium block">
                        {agent.display_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {agent.operating_mode}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    Preview routing: {routingModeLabel}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    QA sempre incluso
                  </Badge>
                </div>
                {routingAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Scrivi un obiettivo o scegli un template per vedere gli
                    agenti coinvolti.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {routingAgents.map((agent) => (
                      <Badge
                        key={agent.agent_key}
                        variant="outline"
                        className="bg-white text-[10px]"
                      >
                        {agent.display_name}:{" "}
                        {AGENT_EXPERTISE[agent.agent_key] ?? agent.operating_mode}
                      </Badge>
                    ))}
                  </div>
                )}
                {enabledAgents.length > MAX_AGENTI_PER_MISSIONE && (
                  <p className="text-[11px] text-muted-foreground">
                    Limite sicurezza: massimo {MAX_AGENTI_PER_MISSIONE} agenti
                    paralleli. Per audit completi crea due missioni coordinate.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded border bg-white px-2 py-1">
                    Evidenze prima
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    Ipotesi marcate
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    P0/P1/P2
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    Una next action
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                La sintesi finale mostrera evidenze, rischi e una sola prossima
                azione. Se le prove sono deboli andra in review.
              </p>
              <Button
                onClick={() => launchMutation.mutate()}
                disabled={!canLaunchMission}
                className="min-h-11 bg-orange-600 hover:bg-orange-700 sm:min-w-[180px]"
              >
                <PlayCircle
                  className={`h-4 w-4 mr-2 ${launchMutation.isPending ? "animate-pulse" : ""}`}
                />
                {launchMutation.isPending
                  ? "Avvio missione..."
                  : missionReadiness.blockers.length > 0
                    ? "Completa il prompt"
                    : `Avvia con ${routingAgents.length || 0} agenti`}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-violet-500" />
              Osservabilità agenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {missionHealthQuery.isLoading ||
            performanceQuery.isLoading ||
            toolHealthQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Attive
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.active_missions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Review
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.waiting_approval_missions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Fail 7g
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.failed_missions_7d ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Costo 7g
                    </div>
                    <div className="text-sm font-semibold">
                      $
                      {Number(missionHealth?.total_cost_usd_7d ?? 0).toFixed(3)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium">
                      Agenti da tenere d'occhio
                    </p>
                    {fragileAgents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nessun segnale critico negli agenti.
                      </p>
                    ) : (
                      fragileAgents.map((agent) => (
                        <div
                          key={agent.agent_key}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{agent.display_name}</span>
                          <span className="text-muted-foreground shrink-0">
                            fail {agent.tasks_failed} · review{" "}
                            {agent.approval_required_count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium">Tool health 7g</p>
                    {toolHealthRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nessuna chiamata tool recente.
                      </p>
                    ) : (
                      toolHealthRows.slice(0, 4).map((tool) => (
                        <div
                          key={tool.tool_name}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate font-mono">
                            {tool.tool_name}
                          </span>
                          <span
                            className={
                              tool.failed_calls_7d > 0
                                ? "text-rose-600 shrink-0"
                                : "text-muted-foreground shrink-0"
                            }
                          >
                            fail {tool.failed_calls_7d} · p95{" "}
                            {Number(tool.p95_duration_ms ?? 0).toFixed(0)}ms
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agentsQuery.isLoading ? (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          ) : (
            enabledAgents.map((agent) => (
              <Card key={agent.agent_key} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {agent.display_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {agent.agent_key}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${AGENT_RISK_COLORS[agent.risk_level]}`}
                    >
                      {agent.risk_level}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {agent.mission}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(toolsByAgent[agent.agent_key] ?? [])
                      .slice(0, 4)
                      .map((permission) => (
                        <Badge
                          key={permission.tool_key}
                          variant="outline"
                          className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                        >
                          {permission.tool_key}
                        </Badge>
                      ))}
                    {(toolsByAgent[agent.agent_key] ?? []).length === 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Nessun tool attivo
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.persona_keys.slice(0, 4).map((persona) => (
                      <Badge
                        key={persona}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {persona}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              Memoria agenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {memoryQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : memoryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna memoria agente ancora. Le missioni generano suggerimenti
                da approvare.
              </p>
            ) : (
              memoryItems.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-md border p-2 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {memory.agent_key}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {memory.memory_type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        memory.memory_status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : memory.memory_status === "rejected"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {memory.memory_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {memory.content}
                  </p>
                  {memory.memory_status === "suggested" && (
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-rose-600"
                        disabled={updateMemoryMutation.isPending}
                        onClick={() =>
                          updateMemoryMutation.mutate({
                            id: memory.id,
                            status: "rejected",
                          })
                        }
                      >
                        Rifiuta
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                        disabled={updateMemoryMutation.isPending}
                        onClick={() =>
                          updateMemoryMutation.mutate({
                            id: memory.id,
                            status: "active",
                          })
                        }
                      >
                        Attiva
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-500" />
              Missioni recenti
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {missionsQuery.isLoading ? (
              <div className="p-3">
                <Skeleton className="h-32" />
              </div>
            ) : missions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nessuna missione ancora avviata.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {missions.map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => setActiveMissionId(mission.id)}
                    className={`w-full text-left p-3 hover:bg-muted/40 transition ${
                      activeMission?.id === mission.id ? "bg-orange-50/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {mission.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${AGENT_STATUS_COLORS[mission.status] ?? ""}`}
                      >
                        {AGENT_STATUS_LABELS[mission.status] ?? mission.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                      {mission.objective}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <span>
                        {format(new Date(mission.created_at), "dd MMM HH:mm", {
                          locale: it,
                        })}
                      </span>
                      <span>
                        {mission.completed_tasks_count}/{mission.tasks_count}{" "}
                        task
                      </span>
                      {mission.risks_count > 0 && (
                        <span className="text-rose-600">
                          {mission.risks_count} rischi
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-500" />
              Sintesi missione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeMission ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Seleziona una missione per vedere sintesi, task e blackboard.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${AGENT_STATUS_COLORS[activeMission.status] ?? ""}`}
                    >
                      {AGENT_STATUS_LABELS[activeMission.status] ??
                        activeMission.status}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {activeMission.mode}
                    </Badge>
                    {activeMission.confidence !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        conf {(activeMission.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  {missionPhase && (
                    <div
                      className={`rounded-md border p-3 text-sm ${missionPhase.tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{missionPhase.label}</p>
                          <p className="text-xs opacity-90">
                            {missionPhase.description}
                          </p>
                        </div>
                        {activeMission.tasks_count > 0 && (
                          <span className="text-xs font-semibold shrink-0">
                            {missionProgress}%
                          </span>
                        )}
                      </div>
                      {activeMission.tasks_count > 0 && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                          <div
                            className="h-full rounded-full bg-current transition-all"
                            style={{ width: `${missionProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {latestEvaluation && (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${latestEvaluation.verdict === "pass" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                        >
                          QA {latestEvaluation.verdict}
                        </Badge>
                        <span className="text-muted-foreground">
                          rischio hallucination:{" "}
                          {latestEvaluation.hallucination_risk}
                        </span>
                        {latestEvaluation.needs_human_approval && (
                          <span className="text-amber-700 font-medium">
                            review umana richiesta
                          </span>
                        )}
                      </div>
                      {latestEvaluation.notes && (
                        <p className="text-muted-foreground whitespace-pre-wrap break-words">
                          {latestEvaluation.notes}
                        </p>
                      )}
                    </div>
                  )}
                  {(missionEvidenceGate || missionActionGate) && (
                    <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {missionEvidenceGate && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              missionEvidenceGate.hasCredibleEvidence
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            Evidence gate{" "}
                            {missionEvidenceGate.hasCredibleEvidence
                              ? "ok"
                              : "prove deboli"}
                          </Badge>
                        )}
                        {missionActionGate?.rewritten && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-violet-50 text-violet-700 border-violet-200"
                          >
                            Next action resa operativa
                          </Badge>
                        )}
                      </div>
                      {missionEvidenceGate &&
                        missionEvidenceGate.unsupportedClaims.length > 0 && (
                          <div className="space-y-1">
                            <p className="font-medium text-amber-800">
                              Numeri non verificati marcati dalla QA:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {missionEvidenceGate.unsupportedClaims
                                .slice(0, 6)
                                .map((claim) => (
                                  <Badge
                                    key={claim}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {claim}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}
                      {missionActionGate?.originalNextAction && (
                        <p className="text-muted-foreground">
                          Azione originale troppo generica:{" "}
                          {missionActionGate.originalNextAction}
                        </p>
                      )}
                    </div>
                  )}
                  {activeMission.status === "waiting_approval" && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-sm text-amber-800">
                        Non e un errore: Silvio ha completato l'analisi, ma ha
                        rilevato rischi, assunzioni o prove insufficienti. Puoi
                        approvarla come decisione valida oppure archiviarla.
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolveMissionMutation.isPending}
                          onClick={() =>
                            resolveMissionMutation.mutate({
                              missionId: activeMission.id,
                              resolution: "rejected",
                            })
                          }
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Archivia
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={resolveMissionMutation.isPending}
                          onClick={() =>
                            resolveMissionMutation.mutate({
                              missionId: activeMission.id,
                              resolution: "approved",
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approva sintesi
                        </Button>
                      </div>
                    </div>
                  )}
                  <h3 className="font-semibold text-sm">
                    {activeMission.title}
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between rounded-md border bg-muted/20 p-2">
                    <p className="text-xs text-muted-foreground">
                      Puoi riusare questa missione come prompt base o rilanciarla
                      per chiedere piu prove agli stessi agenti.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleMissionAsBase(activeMission)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Usa come base
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                        disabled={
                          launchMutation.isPending ||
                          !["completed", "waiting_approval", "failed"].includes(
                            activeMission.status,
                          )
                        }
                        onClick={() => rerunMissionWithMoreEvidence(activeMission)}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 mr-1 ${
                            launchMutation.isPending ? "animate-spin" : ""
                          }`}
                        />
                        Rilancia prove
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Fatti
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.facts}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Insight
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.insights}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Rischi
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.risks}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Azioni
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.actions}
                      </p>
                    </div>
                  </div>
                  {activeMission.summary_md ? (
                    <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                      {activeMission.summary_md}
                    </div>
                  ) : activeMission.last_error ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {activeMission.last_error}
                    </div>
                  ) : (
                    <Skeleton className="h-28" />
                  )}
                  {activeMission.next_action && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <strong>Prossimo passo:</strong>{" "}
                      {activeMission.next_action}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Task agenti
                  </p>
                  {tasksQuery.isLoading ? (
                    <Skeleton className="h-24" />
                  ) : tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nessun task generato.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-md border p-2 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono">
                              {task.agent_key}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${AGENT_STATUS_COLORS[task.status] ?? ""}`}
                            >
                              {TASK_STATUS_LABELS[task.status] ?? task.status}
                            </Badge>
                          </div>
                          {task.output_md && (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5">
                              {task.output_md}
                            </p>
                          )}
                          {task.error_message && (
                            <p className="text-xs text-rose-600 break-words">
                              {task.error_message}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Blackboard
                  </p>
                  {blackboardQuery.isLoading ? (
                    <Skeleton className="h-24" />
                  ) : blackboard.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nessun elemento nel blackboard.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {blackboard.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-md bg-muted/30 p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <Badge variant="outline" className="text-[10px]">
                                {entry.entry_type}
                              </Badge>
                              {entry.agent_key && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {entry.agent_key}
                                </span>
                              )}
                              {entry.confidence !== null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {(entry.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            {["fact", "insight", "risk", "recommendation", "decision"].includes(
                              entry.entry_type,
                            ) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0 px-2 text-[10px]"
                                disabled={saveBlackboardMemoryMutation.isPending}
                                onClick={() =>
                                  saveBlackboardMemoryMutation.mutate(entry)
                                }
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Memoria
                              </Button>
                            )}
                          </div>
                          <p className="text-xs font-medium mt-1">
                            {entry.title}
                          </p>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {entry.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── MEMORY TAB ────────────────────────────────────────────────────────────

interface PersonaOption {
  persona_key: string;
  display_name: string;
  emoji: string;
}

interface PersonaMemory {
  id: string;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  source: string | null;
  confidence: number | null;
  enabled: boolean;
  hits_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const MEMORY_TYPE_BADGE: Record<PersonaMemory["memory_type"], string> = {
  fact: "bg-sky-100 text-sky-700",
  preference: "bg-violet-100 text-violet-700",
  decision: "bg-amber-100 text-amber-700",
  pattern: "bg-emerald-100 text-emerald-700",
  avoid: "bg-rose-100 text-rose-700",
};
const MEMORY_TYPE_LABEL: Record<PersonaMemory["memory_type"], string> = {
  fact: "📌 Fatto",
  preference: "💭 Preferenza",
  decision: "🎯 Decisione",
  pattern: "✅ Pattern",
  avoid: "❌ Evita",
};

function MemoryTab() {
  const queryClient = useQueryClient();
  const [selectedPersona, setSelectedPersona] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<PersonaMemory["memory_type"]>("fact");
  const [newContent, setNewContent] = useState("");
  const [newPersonaKey, setNewPersonaKey] = useState<string>("");

  const personasQuery = useQuery({
    queryKey: ["silvio-personas-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_admin_personas")
        .select("persona_key, display_name, emoji")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonaOption[];
    },
  });

  const memoryQuery = useQuery({
    queryKey: ["silvio-persona-memory", selectedPersona],
    queryFn: async () => {
      let q = supabase
        .from("silvio_persona_memory")
        .select("*")
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (selectedPersona !== "all") q = q.eq("persona_key", selectedPersona);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PersonaMemory[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newPersonaKey || !newContent.trim())
        throw new Error("Compila tutti i campi");
      const { error } = await supabase.from("silvio_persona_memory").insert({
        persona_key: newPersonaKey,
        memory_type: newType,
        content: newContent.trim(),
        source: "florin_explicit",
        confidence: 1.0,
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiunta");
      setNewContent("");
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiornata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria eliminata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const personas = personasQuery.data ?? [];
  const memories = memoryQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={selectedPersona} onValueChange={setSelectedPersona}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtra persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le personas</SelectItem>
              {personas.map((p) => (
                <SelectItem key={p.persona_key} value={p.persona_key}>
                  {p.emoji} {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {memories.length} memorie
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuova memoria
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-orange-200">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Persona
                </label>
                <Select value={newPersonaKey} onValueChange={setNewPersonaKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona persona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((p) => (
                      <SelectItem key={p.persona_key} value={p.persona_key}>
                        {p.emoji} {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Tipo
                </label>
                <Select
                  value={newType}
                  onValueChange={(v) =>
                    setNewType(v as PersonaMemory["memory_type"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fact">📌 Fatto</SelectItem>
                    <SelectItem value="preference">💭 Preferenza</SelectItem>
                    <SelectItem value="decision">🎯 Decisione</SelectItem>
                    <SelectItem value="pattern">✅ Pattern vincente</SelectItem>
                    <SelectItem value="avoid">❌ Da evitare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Contenuto
              </label>
              <Textarea
                placeholder="Es: ARPU Pro = €127/mese. Lead industriali rispondono meglio a linguaggio tecnico."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewContent("");
                }}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={
                  addMutation.isPending || !newPersonaKey || !newContent.trim()
                }
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Save className="h-4 w-4 mr-1" />
                Salva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memoryQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Nessuna memoria. Aggiungi la prima per arricchire le risposte di
            Silvio.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              personas={personas}
              onToggle={(enabled) =>
                toggleMutation.mutate({ id: m.id, enabled })
              }
              onUpdate={(content) =>
                updateMutation.mutate({ id: m.id, content })
              }
              onDelete={() => deleteMutation.mutate(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  personas,
  onToggle,
  onUpdate,
  onDelete,
}: {
  memory: PersonaMemory;
  personas: PersonaOption[];
  onToggle: (enabled: boolean) => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const persona = personas.find((p) => p.persona_key === memory.persona_key);

  return (
    <Card className={memory.enabled ? "" : "opacity-60"}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {persona
                  ? `${persona.emoji} ${persona.display_name}`
                  : memory.persona_key}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] ${MEMORY_TYPE_BADGE[memory.memory_type]}`}
              >
                {MEMORY_TYPE_LABEL[memory.memory_type]}
              </Badge>
              {memory.source && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  src: {memory.source}
                </span>
              )}
              {memory.hits_count > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {memory.hits_count} usi
                </span>
              )}
            </div>
            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">
                {memory.content}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Switch
                checked={memory.enabled}
                onCheckedChange={onToggle}
                aria-label="Attiva memoria"
              />
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      onUpdate(draft);
                      setEditing(false);
                    }}
                    title="Salva"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setDraft(memory.content);
                      setEditing(false);
                    }}
                    title="Annulla"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditing(true)}
                    title="Modifica"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      if (confirm("Eliminare questa memoria?")) onDelete();
                    }}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── LEARNING TAB ──────────────────────────────────────────────────────────

interface LearningLog {
  id: string;
  run_at: string;
  period_start: string;
  period_end: string;
  runs_analyzed: number;
  gold_added: number;
  avoid_added: number;
  promoted_to_memory: number;
  duration_ms: number;
  ok: boolean;
  errors: unknown;
}

function LearningTab() {
  const queryClient = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["silvio-self-improvement-log"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_self_improvement_log")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as LearningLog[];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-self-improvement",
        {
          body: { source: "manual_hub", days: 7 },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const d = data as {
        gold_added?: number;
        avoid_added?: number;
        promoted_to_memory?: number;
      };
      toast.success(
        `Self-improvement completato — +${d?.gold_added ?? 0} gold, +${d?.avoid_added ?? 0} avoid, ${d?.promoted_to_memory ?? 0} promossi a memoria`,
      );
      queryClient.invalidateQueries({
        queryKey: ["silvio-self-improvement-log"],
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
    onError: (e) =>
      toast.error("Errore self-improvement", { description: String(e) }),
  });

  const logs = logsQuery.data ?? [];
  const last = logs[0];

  return (
    <div className="space-y-3">
      <Card className="border-orange-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Self-improvement loop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cron settimanale (Domenica 03:00 UTC): analizza le risposte rated
            👍/👎 degli ultimi 7gg, aggiunge gold standard e avoid pattern alla
            KB, promuove pattern usati a memoria persona.
          </p>
          {last && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground">
                  Gold last run
                </div>
                <div className="font-bold text-emerald-700">
                  +{last.gold_added}
                </div>
              </div>
              <div className="p-2 rounded bg-rose-50 border border-rose-200">
                <div className="text-[10px] text-muted-foreground">
                  Avoid last run
                </div>
                <div className="font-bold text-rose-700">
                  +{last.avoid_added}
                </div>
              </div>
              <div className="p-2 rounded bg-violet-50 border border-violet-200">
                <div className="text-[10px] text-muted-foreground">
                  Promossi a memoria
                </div>
                <div className="font-bold text-violet-700">
                  {last.promoted_to_memory}
                </div>
              </div>
              <div className="p-2 rounded bg-sky-50 border border-sky-200">
                <div className="text-[10px] text-muted-foreground">
                  Run analizzati
                </div>
                <div className="font-bold text-sky-700">
                  {last.runs_analyzed}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Zap
                className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-pulse" : ""}`}
              />
              {runMutation.isPending ? "In esecuzione…" : "Esegui ora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Storico run</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nessuna run effettuata. Premi "Esegui ora" o aspetta il cron
              settimanale.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-right">Analizzati</th>
                    <th className="px-3 py-2 text-right">Gold</th>
                    <th className="px-3 py-2 text-right">Avoid</th>
                    <th className="px-3 py-2 text-right">Promossi</th>
                    <th className="px-3 py-2 text-right">Durata</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(l.run_at), "dd MMM yyyy HH:mm", {
                          locale: it,
                        })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {l.runs_analyzed}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">
                        +{l.gold_added}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-rose-700">
                        +{l.avoid_added}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-violet-700">
                        {l.promoted_to_memory}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {(l.duration_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${l.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                        >
                          {l.ok ? "✓ ok" : "✗ errors"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
