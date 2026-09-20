/**
 * silvio-chief-of-staff
 *
 * P2 layer for Silvio Superadmin: reads real platform metrics, evaluates
 * permanent monitors, proposes growth experiments and writes a strategic brief.
 *
 * Chi la chiama: il cron delle 06:15 (silvio_invoke_edge, che manda solo
 * x-internal-cron-secret) e il super admin dall'app. Il controllo è qui
 * dentro (requireCronOrSuperAdmin), quindi in supabase/config.toml ha
 * verify_jwt = false: fino al 20/09/2026 la voce mancava, il gateway voleva
 * un JWT e il giro del mattino prendeva 401 ogni giorno.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi dal
// summary_md mostrato a Florin nel chief-of-staff brief.
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_CRON_SECRET = Deno.env.get("INTERNAL_CRON_SECRET");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Supabase Edge Functions use the generated JS client dynamically here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

interface ChiefRequest {
  for_date?: string;
  force?: boolean;
  generate_experiments?: boolean;
}

interface MonitorRule {
  id: string;
  rule_key: string;
  title: string;
  description: string;
  owner_agent_key: string | null;
  metric_key: string;
  condition_operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  threshold_value: number;
  severity: "low" | "medium" | "high" | "critical";
  cooldown_minutes: number;
  last_triggered_at: string | null;
  enabled: boolean;
}

interface ChiefOutput {
  summary_md?: string;
  top_priorities?: Array<{
    title?: string;
    why?: string;
    owner_agent_key?: string;
    priority?: "P0" | "P1" | "P2";
  }>;
  decisions_needed?: Array<{
    title?: string;
    context?: string;
    recommendation?: string;
  }>;
  risks?: Array<{ title?: string; severity?: string; content?: string }>;
  experiments?: Array<{
    title?: string;
    hypothesis?: string;
    objective_key?: string;
    owner_agent_key?: string;
    priority?: "P0" | "P1" | "P2";
    expected_impact?: "low" | "medium" | "high";
    effort?: "low" | "medium" | "high";
    confidence?: number;
    metric_name?: string;
  }>;
  next_action?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function parseBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function requireCronOrSuperAdmin(
  req: Request,
  supabase: SupabaseAdminClient,
): Promise<string> {
  const cronSecret =
    req.headers.get("x-internal-cron-secret") ??
    req.headers.get("x-cron-secret");
  if (INTERNAL_CRON_SECRET && cronSecret === INTERNAL_CRON_SECRET)
    return "cron";

  const token = parseBearer(req);
  if (!token) throw new Error("Missing bearer token");

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) throw new Error("Unauthorized");

  const userId = userData.user.id;
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) throw new Error("Forbidden: super_admin required");
  return userId;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampConfidence(value: unknown): number | null {
  const n = asNumber(value, NaN);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function stripCodeFences(content: string): string {
  return content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject<T>(content: string, fallback: T): T {
  const cleaned = stripCodeFences(content);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return fallback;
    }
  }
}

async function safeRpc(
  supabase: SupabaseAdminClient,
  rpc: string,
  args: Record<string, unknown>,
) {
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) return { ok: false, error: error.message, data: null };
    return { ok: true, error: null, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

function evaluateRule(rule: MonitorRule, metricValue: number | null): boolean {
  if (metricValue === null) return false;
  const threshold = asNumber(rule.threshold_value);
  switch (rule.condition_operator) {
    case "gt":
      return metricValue > threshold;
    case "gte":
      return metricValue >= threshold;
    case "lt":
      return metricValue < threshold;
    case "lte":
      return metricValue <= threshold;
    case "eq":
      return metricValue === threshold;
    case "neq":
      return metricValue !== threshold;
    default:
      return false;
  }
}

function inCooldown(rule: MonitorRule): boolean {
  if (!rule.last_triggered_at) return false;
  const last = new Date(rule.last_triggered_at).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < rule.cooldown_minutes * 60_000;
}

async function buildSnapshot(supabase: SupabaseAdminClient) {
  const [
    mrr,
    unpaid,
    forecast,
    aiCost,
    tickets,
    ticketClusters,
    leads,
    waitingMissions,
    objectives,
    monitorRules,
  ] = await Promise.all([
    safeRpc(supabase, "silvio_get_mrr_breakdown", { p_period: "30d" }),
    safeRpc(supabase, "silvio_get_unpaid_customers", { p_limit: 10 }),
    safeRpc(supabase, "silvio_get_revenue_forecast", { p_months_ahead: 3 }),
    safeRpc(supabase, "silvio_get_ai_costs_summary", { p_period: "mtd" }),
    safeRpc(supabase, "silvio_list_tickets", {
      p_status: "open",
      p_priority: "all",
      p_limit: 20,
    }),
    safeRpc(supabase, "silvio_cluster_tickets", {
      p_period: "30d",
      p_min_cluster: 3,
    }),
    safeRpc(supabase, "silvio_list_leads", {
      p_score_min: 70,
      p_days_since_contact: 2,
      p_status: "all",
      p_limit: 20,
    }),
    supabase
      .from("silvio_agent_missions")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_approval"),
    supabase
      .from("silvio_strategic_objectives")
      .select("*")
      .eq("enabled", true)
      .order("priority", { ascending: true }),
    supabase
      .from("silvio_monitor_rules")
      .select("*")
      .eq("enabled", true)
      .order("severity", { ascending: false }),
  ]);

  const mrrData = mrr.data ?? {};
  const unpaidData = unpaid.data ?? {};
  const aiCostData = aiCost.data ?? {};
  const ticketsData = tickets.data ?? {};
  const leadsData = leads.data ?? {};

  const metrics = {
    mrr_eur: asNumber((mrrData as Record<string, unknown>).mrr_eur),
    arr_eur: asNumber((mrrData as Record<string, unknown>).arr_eur),
    companies_paying: asNumber(
      (mrrData as Record<string, unknown>).companies_paying,
    ),
    companies_trial: asNumber(
      (mrrData as Record<string, unknown>).companies_trial,
    ),
    companies_unpaid:
      asNumber((mrrData as Record<string, unknown>).companies_unpaid) ||
      asNumber((unpaidData as Record<string, unknown>).count),
    ai_cost_mtd_eur: asNumber(
      (aiCostData as Record<string, unknown>).total_cost_real_eur,
    ),
    open_tickets_total: asNumber(
      (ticketsData as Record<string, unknown>).total_open,
    ),
    hot_leads_returned: asNumber(
      (leadsData as Record<string, unknown>).returned,
    ),
    agent_missions_waiting_approval: asNumber(waitingMissions.count),
  };

  return {
    metrics,
    rpc: {
      mrr,
      unpaid,
      forecast,
      ai_cost: aiCost,
      tickets,
      ticket_clusters: ticketClusters,
      leads,
    },
    objectives: objectives.data ?? [],
    monitor_rules: (monitorRules.data ?? []) as MonitorRule[],
    generated_at: new Date().toISOString(),
  };
}

async function updateObjectiveCurrentValues(
  supabase: SupabaseAdminClient,
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>,
) {
  const metrics = snapshot.metrics as Record<string, number>;
  await Promise.allSettled(
    (snapshot.objectives as Array<Record<string, unknown>>)
      .filter((objective) => typeof objective.target_metric === "string")
      .map((objective) => {
        const metricKey = String(objective.target_metric);
        if (!(metricKey in metrics)) return Promise.resolve();
        return supabase
          .from("silvio_strategic_objectives")
          .update({
            current_value: metrics[metricKey],
            updated_at: new Date().toISOString(),
          })
          .eq("objective_key", objective.objective_key);
      }),
  );
}

async function evaluateMonitors(
  supabase: SupabaseAdminClient,
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>,
) {
  const metrics = snapshot.metrics as Record<string, number>;
  const events: Array<Record<string, unknown>> = [];

  for (const rule of snapshot.monitor_rules) {
    const metricValue =
      rule.metric_key in metrics ? metrics[rule.metric_key] : null;
    if (!evaluateRule(rule, metricValue) || inCooldown(rule)) continue;

    const { count } = await supabase
      .from("silvio_monitor_events")
      .select("id", { count: "exact", head: true })
      .eq("rule_key", rule.rule_key)
      .in("status", ["open", "acknowledged"]);
    if ((count ?? 0) > 0) continue;

    const row = {
      rule_id: rule.id,
      rule_key: rule.rule_key,
      title: rule.title,
      severity: rule.severity,
      metric_key: rule.metric_key,
      metric_value: metricValue,
      threshold_value: rule.threshold_value,
      summary: `${rule.title}: ${metricValue} ${rule.condition_operator} ${rule.threshold_value}`,
      snapshot: { metric_value: metricValue, rule },
    };
    events.push(row);
  }

  const insertedEvents: Array<Record<string, unknown>> = [];
  if (events.length > 0) {
    for (const event of events) {
      const { error } = await supabase
        .from("silvio_monitor_events")
        .insert(event);
      if (error) {
        if (error.code === "23505") continue;
        throw error;
      }
      insertedEvents.push(event);
    }
    await Promise.allSettled(
      insertedEvents.map((event) =>
        supabase
          .from("silvio_monitor_rules")
          .update({ last_triggered_at: new Date().toISOString() })
          .eq("rule_key", event.rule_key),
      ),
    );
  }

  const { data: openEvents } = await supabase
    .from("silvio_monitor_events")
    .select("*")
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(20);

  return { triggered: insertedEvents, open_events: openEvents ?? [] };
}

function chiefSystemPrompt(): string {
  return `Sei Silvio Chief of Staff di Florin per Edilizia in Cloud.
Il tuo lavoro e tenere vivi obiettivi, rischi, esperimenti e decisioni. Non sei una chat motivazionale.

Regole:
- Usa solo i dati dello snapshot. Non inventare numeri.
- Ragiona per MRR, conversione, churn, margine, costo AI, supporto e stabilita prodotto.
- Se un dato manca, dichiaralo come buco informativo.
- Produci poche priorita: massimo 5.
- Gli esperimenti devono essere misurabili e piccoli abbastanza da partire subito.
- Output solo JSON valido, senza markdown fuori dal JSON.

Schema:
{
  "summary_md": "brief markdown operativo per Florin",
  "top_priorities": [{"title":"...","why":"...","owner_agent_key":"finance_agent","priority":"P0|P1|P2"}],
  "decisions_needed": [{"title":"...","context":"...","recommendation":"..."}],
  "risks": [{"title":"...","severity":"low|medium|high|critical","content":"..."}],
  "experiments": [{"title":"...","hypothesis":"...","objective_key":"lead_conversion","owner_agent_key":"growth_agent","priority":"P1","expected_impact":"medium","effort":"low","confidence":0.7,"metric_name":"..."}],
  "next_action": "una sola prossima azione concreta"
}`;
}

function fallbackBrief(
  snapshot: Awaited<ReturnType<typeof buildSnapshot>>,
  monitorData: Awaited<ReturnType<typeof evaluateMonitors>>,
): ChiefOutput {
  const metrics = snapshot.metrics;
  return {
    summary_md: [
      "## Silvio Chief of Staff",
      `MRR: EUR ${metrics.mrr_eur}. Paying: ${metrics.companies_paying}. Unpaid: ${metrics.companies_unpaid}.`,
      `AI cost MTD: EUR ${metrics.ai_cost_mtd_eur}. Ticket aperti: ${metrics.open_tickets_total}. Lead caldi: ${metrics.hot_leads_returned}.`,
      monitorData.open_events.length
        ? `Eventi aperti: ${monitorData.open_events.length}. Primo: ${monitorData.open_events[0]?.title ?? "n/d"}.`
        : "Nessun evento monitor aperto.",
    ].join("\n\n"),
    top_priorities: [],
    decisions_needed: [],
    risks: monitorData.open_events.map((event: Record<string, unknown>) => ({
      title: String(event.title ?? "Monitor event"),
      severity: String(event.severity ?? "medium"),
      content: String(event.summary ?? ""),
    })),
    experiments: [],
    next_action: monitorData.open_events.length
      ? "Apri il primo evento monitor e decidi se trasformarlo in missione multi-agente."
      : "Scegli un obiettivo attivo e lancia una missione multi-agente mirata.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")
    return jsonResponse({ ok: false, error: "POST only" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const triggeredBy = await requireCronOrSuperAdmin(req, supabase);
    const body = (await req.json().catch(() => ({}))) as ChiefRequest;
    const forDate = body.for_date ?? todayIsoDate();
    const force = body.force === true;
    const generateExperiments = body.generate_experiments !== false;

    if (!force) {
      const { data: existing } = await supabase
        .from("silvio_chief_of_staff_briefs")
        .select("id,for_date")
        .eq("for_date", forDate)
        .maybeSingle();
      if (existing) {
        return jsonResponse({
          ok: true,
          skipped: true,
          reason: "already_exists",
          brief_id: existing.id,
        });
      }
    }

    const snapshot = await buildSnapshot(supabase);
    await updateObjectiveCurrentValues(supabase, snapshot);
    const monitorData = await evaluateMonitors(supabase, snapshot);

    const promptSnapshot = {
      metrics: snapshot.metrics,
      objectives: snapshot.objectives,
      monitor_events: monitorData.open_events,
      triggered_now: monitorData.triggered,
      rpc_context: snapshot.rpc,
    };

    let chiefOutput: ChiefOutput;
    let modelUsed: string | null = null;
    let costUsd = 0;

    try {
      const result = await aiRouterComplete({
        supabase,
        taskKey: "silvio_chief_of_staff",
        userId: triggeredBy === "cron" ? null : triggeredBy,
        personaKey: "silvio_coordinator",
        skipCharge: true,
        estimatedCostEur: 0.12,
        responseFormat: { type: "json_object" },
        params: { temperature: 0.18, max_tokens: 1800 },
        messages: [
          { role: "system", content: chiefSystemPrompt() },
          {
            role: "user",
            content: `Genera il Chief of Staff brief per ${forDate}.

Snapshot:
${JSON.stringify(promptSnapshot, null, 2)}`,
          },
        ],
      });

      chiefOutput = parseJsonObject<ChiefOutput>(
        result.content,
        fallbackBrief(snapshot, monitorData),
      );
      modelUsed = result.modelUsed;
      costUsd = result.costUsd;
    } catch (error) {
      chiefOutput = fallbackBrief(snapshot, monitorData);
      chiefOutput.risks = [
        ...(chiefOutput.risks ?? []),
        {
          title: "AI synthesis failed",
          severity: "medium",
          content: error instanceof Error ? error.message : String(error),
        },
      ];
    }

    const { data: agentRows } = await supabase
      .from("silvio_agent_registry")
      .select("agent_key")
      .eq("enabled", true);
    const validAgentKeys = new Set(
      (agentRows ?? []).map((row: { agent_key: string }) => row.agent_key),
    );
    const validObjectiveKeys = new Set(
      (snapshot.objectives as Array<Record<string, unknown>>)
        .map((objective) => String(objective.objective_key ?? ""))
        .filter(Boolean),
    );

    const experiments = generateExperiments
      ? (chiefOutput.experiments ?? []).slice(0, 5)
      : [];
    const experimentRows = experiments
      .filter((experiment) => experiment.title && experiment.hypothesis)
      .map((experiment) => ({
        title: String(experiment.title).slice(0, 220),
        hypothesis: String(experiment.hypothesis).slice(0, 1200),
        objective_key:
          experiment.objective_key &&
          validObjectiveKeys.has(experiment.objective_key)
            ? experiment.objective_key
            : null,
        owner_agent_key:
          experiment.owner_agent_key &&
          validAgentKeys.has(experiment.owner_agent_key)
            ? experiment.owner_agent_key
            : null,
        priority: oneOf(experiment.priority, ["P0", "P1", "P2"] as const, "P1"),
        expected_impact: oneOf(
          experiment.expected_impact,
          ["low", "medium", "high"] as const,
          "medium",
        ),
        effort: oneOf(
          experiment.effort,
          ["low", "medium", "high"] as const,
          "medium",
        ),
        confidence: clampConfidence(experiment.confidence),
        metric_name: experiment.metric_name ?? null,
        metadata: { source: "silvio-chief-of-staff", for_date: forDate },
      }));

    if (experimentRows.length > 0) {
      const { data: recent } = await supabase
        .from("silvio_growth_experiments")
        .select("title")
        .gte(
          "created_at",
          new Date(Date.now() - 14 * 24 * 3600_000).toISOString(),
        );
      const existingTitles = new Set(
        (recent ?? []).map((row: { title: string }) => row.title.toLowerCase()),
      );
      const uniqueRows = experimentRows.filter(
        (row) => !existingTitles.has(row.title.toLowerCase()),
      );
      if (uniqueRows.length > 0) {
        await supabase.from("silvio_growth_experiments").insert(uniqueRows);
      }
    }

    // 🛡️ Sanitize summary_md prima del salvataggio (mostrato a Florin).
    const rawSummary = chiefOutput.summary_md ?? "Brief generato senza sintesi.";
    const sanitizedSummary = sanitizeAnswer(rawSummary);
    if (sanitizedSummary.wasModified) {
      console.warn("[silvio-chief-of-staff] chain-of-thought leak rimosso dal summary_md");
    }
    const cleanedSummaryMd = sanitizedSummary.isFullyChainOfThought
      ? "Brief non disponibile in formato pulito. Vedi top_priorities e risks per i dettagli."
      : (sanitizedSummary.cleaned || rawSummary);

    const { data: brief, error: saveError } = await supabase
      .from("silvio_chief_of_staff_briefs")
      .upsert(
        {
          for_date: forDate,
          summary_md: cleanedSummaryMd,
          top_priorities: chiefOutput.top_priorities ?? [],
          decisions_needed: chiefOutput.decisions_needed ?? [],
          risks: chiefOutput.risks ?? [],
          experiments_suggested: chiefOutput.experiments ?? [],
          next_action: chiefOutput.next_action ?? null,
          snapshot: { ...snapshot, monitor_data: monitorData },
          generated_by: modelUsed,
          generation_cost_usd: costUsd,
        },
        { onConflict: "for_date" },
      )
      .select("id,for_date")
      .single();

    if (saveError) throw saveError;

    return jsonResponse({
      ok: true,
      brief_id: brief.id,
      for_date: brief.for_date,
      triggered_by: triggeredBy,
      monitor_events_triggered: monitorData.triggered.length,
      open_monitor_events: monitorData.open_events.length,
      experiments_suggested: experimentRows.length,
      next_action: chiefOutput.next_action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Unauthorized|Missing bearer/.test(message)
      ? 401
      : /Forbidden/.test(message)
        ? 403
        : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
});
