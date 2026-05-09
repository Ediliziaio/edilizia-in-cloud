/**
 * silvio-agent-orchestrator
 *
 * Superadmin-only mission runner for Silvio's internal multi-agent system.
 * Silvio remains the only external voice: worker agents write to a blackboard,
 * then the coordinator produces one actionable synthesis for Florin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PARALLEL_AGENTS = 5;
const QA_AGENT_KEY = "qa_compliance_agent";
const COORDINATOR_AGENT_KEY = "silvio_coordinator";

// Supabase Edge Functions use the generated JS client dynamically here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

interface MissionRequest {
  title?: string;
  objective: string;
  mode?: "solo" | "panel" | "debate" | "chain" | "supervised_execution";
  priority?: "low" | "normal" | "high" | "critical";
  selected_agents?: string[];
  max_agents?: number;
  force_model?: string;
}

interface AgentRegistry {
  agent_key: string;
  display_name: string;
  mission: string;
  operating_mode: string;
  persona_keys: string[];
  allowed_tools: string[];
  model_tier_key: string;
  risk_level: "low" | "medium" | "high" | "critical";
  max_cost_usd: number;
  max_runtime_seconds: number;
  output_contract: Record<string, unknown>;
  enabled: boolean;
  sort_order: number;
}

interface MissionRow {
  id: string;
  created_by?: string | null;
  title: string;
  objective: string;
  status?: string;
  mode: string;
  selected_agents: string[];
  metadata?: Record<string, unknown>;
}

interface TaskRow {
  id: string;
  agent_key: string;
}

interface WorkerOutput {
  thesis?: string;
  facts?: BlackboardItem[];
  insights?: BlackboardItem[];
  risks?: BlackboardItem[];
  recommendations?: RecommendationItem[];
  questions?: BlackboardItem[];
  next_action?: string;
}

interface BlackboardItem {
  title?: string;
  content?: string;
  confidence?: number;
  evidence?: Record<string, unknown> | unknown[];
}

interface RecommendationItem extends BlackboardItem {
  priority?: string;
  effort?: string;
  impact?: string;
}

interface SynthesisOutput {
  summary_md?: string;
  next_action?: string;
  confidence?: number;
  needs_approval?: boolean;
  risks?: string[];
}

interface ToolRegistry {
  tool_key: string;
  display_name: string;
  description: string;
  tool_kind: "rpc" | "edge_function" | "internal" | "external";
  rpc_name: string | null;
  default_args: Record<string, unknown>;
  access_mode:
    | "read"
    | "write_proposal"
    | "write_requires_approval"
    | "blocked";
  risk_level: "low" | "medium" | "high" | "critical";
  timeout_ms: number;
  enabled: boolean;
}

interface ToolPermission {
  tool_key: string;
  execution_mode: "read" | "proposal_only" | "approval_required" | "blocked";
  max_calls_per_mission: number;
  enabled: boolean;
}

interface ToolExecutionResult {
  tool_key: string;
  display_name: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  duration_ms: number;
}

interface AgentMemory {
  id: string;
  memory_type: string;
  content: string;
  confidence: number | null;
  hits_count: number;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400, details?: unknown) {
  return jsonResponse({ ok: false, error: message, details }, status);
}

function parseBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function requireSuperAdmin(
  req: Request,
  supabase: SupabaseAdminClient,
): Promise<string> {
  const token = parseBearer(req);
  if (!token) throw new Error("Missing bearer token");

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = userData.user.id;
  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (roleError || !role) {
    throw new Error("Forbidden: super_admin required");
  }

  return userId;
}

function scheduleBackground(promise: Promise<unknown>) {
  const runtime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }

  void promise;
}

function normalizeObjective(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function buildTitle(objective: string): string {
  const cleaned = normalizeObjective(objective);
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampConfidence(value: unknown): number | null {
  const n = safeNumber(value, NaN);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
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

function compactAgent(agent: AgentRegistry) {
  return {
    agent_key: agent.agent_key,
    display_name: agent.display_name,
    mission: agent.mission,
    operating_mode: agent.operating_mode,
    persona_keys: agent.persona_keys,
    risk_level: agent.risk_level,
  };
}

function trimJsonForPrompt(value: unknown, maxLength = 6000): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... [troncato per budget token]`;
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timeout dopo ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function loadAgentMemory(
  supabase: SupabaseAdminClient,
  agentKey: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("silvio_agent_memory")
    .select("id,memory_type,content,confidence,hits_count")
    .eq("agent_key", agentKey)
    .eq("enabled", true)
    .eq("memory_status", "active")
    .order("hits_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data?.length) return "";
  const memories = data as AgentMemory[];

  await Promise.allSettled(
    memories.map((memory) =>
      supabase
        .from("silvio_agent_memory")
        .update({
          hits_count: (memory.hits_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", memory.id),
    ),
  );

  return memories
    .map((memory, index) => {
      const confidence =
        memory.confidence !== null
          ? ` conf=${Math.round(memory.confidence * 100)}%`
          : "";
      return `${index + 1}. [${memory.memory_type}${confidence}] ${memory.content.replace(/\s+/g, " ").slice(0, 500)}`;
    })
    .join("\n");
}

async function executeKnowledgeSearch(
  agent: AgentRegistry,
  objective: string,
  tool: ToolRegistry,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tool.timeout_ms);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/silvio-kb-search`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "x-internal-secret": SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        query: `${objective}\n\nFocus agente: ${agent.mission}`,
        persona_key: agent.persona_keys[0] ?? null,
        top_k: Number(tool.default_args?.top_k ?? 5),
      }),
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function executeAgentTools(
  supabase: SupabaseAdminClient,
  missionId: string,
  taskId: string,
  agent: AgentRegistry,
  objective: string,
): Promise<ToolExecutionResult[]> {
  const { data: permissionRows } = await supabase
    .from("silvio_agent_tool_permissions")
    .select("*")
    .eq("agent_key", agent.agent_key)
    .eq("enabled", true)
    .limit(6);

  const permissions = (permissionRows ?? []) as ToolPermission[];
  const permissionByTool = new Map(
    permissions.map((permission) => [permission.tool_key, permission]),
  );
  const allowedToolKeys = permissions
    .filter((permission) => permission.execution_mode === "read")
    .map((permission) => permission.tool_key);
  if (allowedToolKeys.length === 0) return [];

  const { data: toolRows } = await supabase
    .from("silvio_agent_tool_registry")
    .select("*")
    .in("tool_key", allowedToolKeys)
    .eq("enabled", true)
    .neq("access_mode", "blocked")
    .limit(6);

  const tools = ((toolRows ?? []) as ToolRegistry[])
    .filter((tool) => tool.access_mode === "read")
    .slice(0, 4);

  const results: ToolExecutionResult[] = [];
  for (const tool of tools) {
    const startedAt = Date.now();
    let status: "success" | "failed" | "blocked" = "success";
    let output: unknown = null;
    let errorMessage: string | null = null;

    try {
      const maxCalls = Math.max(
        0,
        permissionByTool.get(tool.tool_key)?.max_calls_per_mission ?? 1,
      );
      const { count: callsSoFar } = await supabase
        .from("silvio_agent_tool_calls")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId)
        .eq("agent_key", agent.agent_key)
        .eq("tool_name", tool.tool_key);

      if ((callsSoFar ?? 0) >= maxCalls) {
        status = "blocked";
        errorMessage = `Limite tool raggiunto per questa missione (${maxCalls}).`;
      } else if (tool.tool_key === "search_knowledge") {
        output = await executeKnowledgeSearch(agent, objective, tool);
      } else if (tool.tool_kind === "rpc" && tool.rpc_name) {
        const { data, error } = await withTimeout(
          supabase.rpc(tool.rpc_name, tool.default_args ?? {}),
          tool.timeout_ms,
          `Tool ${tool.tool_key}`,
        );
        if (error) throw error;
        output = data;
      } else {
        status = "blocked";
        errorMessage = "Tool non eseguibile in modalita read-only.";
      }
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const durationMs = Date.now() - startedAt;
    await supabase.from("silvio_agent_tool_calls").insert({
      mission_id: missionId,
      task_id: taskId,
      agent_key: agent.agent_key,
      tool_name: tool.tool_key,
      input: {
        default_args: tool.default_args,
        objective_preview: objective.slice(0, 500),
      },
      output: status === "success" ? (output ?? {}) : {},
      status,
      duration_ms: durationMs,
      error_message: errorMessage,
    });

    results.push({
      tool_key: tool.tool_key,
      display_name: tool.display_name,
      ok: status === "success",
      data: status === "success" ? output : undefined,
      error: errorMessage ?? undefined,
      duration_ms: durationMs,
    });
  }

  return results;
}

function selectAgents(
  agents: AgentRegistry[],
  objective: string,
  explicitSelection: string[] | undefined,
  maxAgents: number,
): AgentRegistry[] {
  const enabled = agents.filter((agent) => agent.enabled);
  const byKey = new Map(enabled.map((agent) => [agent.agent_key, agent]));

  if (explicitSelection?.length) {
    const selected = explicitSelection
      .map((key) => byKey.get(key))
      .filter((agent): agent is AgentRegistry => Boolean(agent))
      .filter((agent) => agent.agent_key !== COORDINATOR_AGENT_KEY)
      .slice(0, maxAgents);

    if (
      !selected.some((agent) => agent.agent_key === QA_AGENT_KEY) &&
      byKey.has(QA_AGENT_KEY)
    ) {
      if (selected.length >= maxAgents) {
        selected[selected.length - 1] = byKey.get(QA_AGENT_KEY)!;
      } else {
        selected.push(byKey.get(QA_AGENT_KEY)!);
      }
    }

    return selected.slice(0, Math.max(1, maxAgents));
  }

  const text = objective.toLowerCase();
  const wanted = new Set<string>(["planner_agent"]);
  if (/(seo|ads|marketing|funnel|contenut|lead|campagn|conversion)/i.test(text))
    wanted.add("growth_agent");
  if (/(vendit|pipeline|crm|follow|demo|opportun|commercial)/i.test(text))
    wanted.add("sales_agent");
  if (/(mrr|ricav|costi|margini|pricing|cassa|fattur|budget|roi)/i.test(text))
    wanted.add("finance_agent");
  if (
    /(bug|ux|deploy|performance|codice|prodotto|feature|tecnic|architettur)/i.test(
      text,
    )
  ) {
    wanted.add("product_tech_agent");
  }
  if (
    /(churn|ticket|support|onboarding|cliente|retention|adozione)/i.test(text)
  ) {
    wanted.add("customer_success_agent");
  }
  wanted.add(QA_AGENT_KEY);

  const selected = enabled
    .filter(
      (agent) =>
        wanted.has(agent.agent_key) &&
        agent.agent_key !== COORDINATOR_AGENT_KEY,
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, maxAgents);

  if (selected.length <= 1) {
    return enabled
      .filter((agent) => agent.agent_key !== COORDINATOR_AGENT_KEY)
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, maxAgents);
  }

  return selected;
}

function workerSystemPrompt(agent: AgentRegistry): string {
  return `Sei ${agent.display_name}, un agente interno di Silvio Superadmin.
Missione agente: ${agent.mission}
Personas di riferimento: ${agent.persona_keys.join(", ") || "nessuna"}
Modalita operativa: ${agent.operating_mode}
Livello rischio: ${agent.risk_level}

Regole:
- Rispondi solo in italiano.
- Non eseguire azioni esterne e non promettere deploy, invii, cancellazioni o modifiche non richieste.
- Usa prima i dati reali dei tool quando sono presenti. Non inventare numeri: se mancano dati, marca l'ipotesi come rischio o domanda.
- Se un tool fallisce, segnala il buco informativo e lavora in modalita prudente.
- Scrivi output concreto, utilizzabile dal coordinatore Silvio.
- Il formato deve essere JSON valido, senza markdown fuori dal JSON.

Schema obbligatorio:
{
  "thesis": "tesi principale in una frase",
  "facts": [{"title":"...","content":"...","confidence":0.0,"evidence":{}}],
  "insights": [{"title":"...","content":"...","confidence":0.0,"evidence":{}}],
  "risks": [{"title":"...","content":"...","confidence":0.0,"evidence":{}}],
  "recommendations": [{"title":"...","content":"...","priority":"P0|P1|P2","effort":"low|medium|high","impact":"low|medium|high","confidence":0.0}],
  "questions": [{"title":"...","content":"...","confidence":0.0}],
  "next_action": "una sola prossima azione concreta"
  }`;
}

function workerUserPrompt(
  mission: MissionRow,
  agent: AgentRegistry,
  blackboard: Record<string, unknown>[],
  toolContext: ToolExecutionResult[],
  memoryBlock: string,
) {
  return `Obiettivo missione:
${mission.objective}

Modalita missione: ${mission.mode}
Agente incaricato: ${agent.display_name}

Memoria attiva agente:
${memoryBlock || "Nessuna memoria attiva ancora."}

Dati reali letti dai tool autorizzati:
${toolContext.length > 0 ? trimJsonForPrompt(toolContext) : "Nessun tool read-only disponibile per questo agente."}

Blackboard disponibile finora:
${JSON.stringify(blackboard.slice(-20), null, 2)}

Produci il tuo contributo specializzato. Se il dato non e verificato, segnalo come rischio/domanda, non come fatto.`;
}

function outputToMarkdown(agent: AgentRegistry, output: WorkerOutput): string {
  const lines = [`### ${agent.display_name}`];
  if (output.thesis) lines.push(output.thesis);
  const recommendations = output.recommendations ?? [];
  if (recommendations.length) {
    lines.push("", "Azioni consigliate:");
    for (const rec of recommendations.slice(0, 5)) {
      lines.push(
        `- ${rec.priority ?? "P1"}: ${rec.title ?? "Azione"} - ${rec.content ?? ""}`,
      );
    }
  }
  if (output.next_action) {
    lines.push("", `Prossimo passo: ${output.next_action}`);
  }
  return lines.join("\n");
}

async function insertBlackboardItems(
  supabase: SupabaseAdminClient,
  missionId: string,
  taskId: string,
  agentKey: string,
  output: WorkerOutput,
) {
  const rows: Record<string, unknown>[] = [];
  const addItems = (
    entryType: string,
    items: BlackboardItem[] | undefined,
    visibility = "internal",
  ) => {
    for (const item of items ?? []) {
      const title = String(item.title ?? entryType);
      const content = String(item.content ?? "").trim();
      if (!content) continue;
      rows.push({
        mission_id: missionId,
        task_id: taskId,
        agent_key: agentKey,
        entry_type: entryType,
        title,
        content,
        confidence: clampConfidence(item.confidence),
        evidence: item.evidence ?? {},
        visibility,
      });
    }
  };

  addItems("fact", output.facts, "summary");
  addItems("insight", output.insights, "summary");
  addItems("risk", output.risks, "actionable");
  addItems("recommendation", output.recommendations, "actionable");
  addItems("question", output.questions, "actionable");

  if (rows.length > 0) {
    await supabase.from("silvio_agent_blackboard").insert(rows);
  }
}

async function storeMemorySuggestions(
  supabase: SupabaseAdminClient,
  missionId: string,
  agentKey: string,
  output: WorkerOutput,
) {
  const memoryFingerprint = (content: string) =>
    content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 260);
  const rows: Record<string, unknown>[] = [];
  for (const rec of (output.recommendations ?? []).slice(0, 2)) {
    const content =
      `${rec.priority ?? "P1"} - ${rec.title ?? "Raccomandazione"}: ${rec.content ?? ""}`.trim();
    if (content.length < 30) continue;
    rows.push({
      agent_key: agentKey,
      memory_type: "pattern",
      content: content.slice(0, 900),
      source: "mission_auto_suggestion",
      source_mission_id: missionId,
      confidence: clampConfidence(rec.confidence) ?? 0.7,
      memory_status: "suggested",
      enabled: false,
    });
  }

  for (const risk of (output.risks ?? []).slice(0, 1)) {
    const content = `${risk.title ?? "Rischio"}: ${risk.content ?? ""}`.trim();
    if (content.length < 30) continue;
    rows.push({
      agent_key: agentKey,
      memory_type: "avoid",
      content: content.slice(0, 900),
      source: "mission_auto_suggestion",
      source_mission_id: missionId,
      confidence: clampConfidence(risk.confidence) ?? 0.75,
      memory_status: "suggested",
      enabled: false,
    });
  }

  if (rows.length > 0) {
    const { data: existingRows } = await supabase
      .from("silvio_agent_memory")
      .select("memory_type,content")
      .eq("agent_key", agentKey)
      .in("memory_status", ["suggested", "active"])
      .order("created_at", { ascending: false })
      .limit(80);

    const existingFingerprints = new Set(
      (
        (existingRows ?? []) as Array<{
          memory_type?: string;
          content?: string;
        }>
      ).map(
        (row) =>
          `${row.memory_type ?? "pattern"}:${memoryFingerprint(row.content ?? "")}`,
      ),
    );

    const uniqueRows = rows.filter((row) => {
      const fingerprint = `${row.memory_type ?? "pattern"}:${memoryFingerprint(String(row.content ?? ""))}`;
      if (existingFingerprints.has(fingerprint)) return false;
      existingFingerprints.add(fingerprint);
      return true;
    });

    if (uniqueRows.length > 0) {
      await supabase.from("silvio_agent_memory").insert(uniqueRows);
    }
  }
}

async function loadBlackboard(
  supabase: SupabaseAdminClient,
  missionId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await supabase
    .from("silvio_agent_blackboard")
    .select(
      "entry_type,title,content,confidence,agent_key,visibility,created_at",
    )
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true })
    .limit(80);
  return data ?? [];
}

function synthesisSystemPrompt(): string {
  return `Sei Silvio Coordinator, il volto unico che parla a Florin.
Sintetizzi contributi di agenti interni senza mostrare il dialogo interno.

Regole:
- Italiano operativo, diretto, professionale.
- Tesi iniziale chiara.
- Evidenzia P0/P1/P2 se emergono priorita.
- Se mancano prove, dichiaralo.
- Imposta needs_approval=true se raccomandi azioni esterne, modifiche dati, budget/spesa, invii massivi, decisioni GDPR/AI Act o se le prove sono deboli.
- Chiudi con UNA prossima azione concreta.
- Output solo JSON valido.

Schema:
{
  "summary_md": "sintesi markdown compatta, pronta da leggere",
  "next_action": "una sola prossima azione concreta",
  "confidence": 0.0,
  "needs_approval": false,
  "risks": ["..."]
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let mission: MissionRow | null = null;

  try {
    const userId = await requireSuperAdmin(req, supabase);
    const body = (await req.json()) as MissionRequest;
    const objective = normalizeObjective(body.objective ?? "");
    if (objective.length < 10) {
      return errorResponse("objective deve contenere almeno 10 caratteri", 400);
    }

    const mode = body.mode ?? "panel";
    const maxAgents = Math.max(
      2,
      Math.min(body.max_agents ?? MAX_PARALLEL_AGENTS, MAX_PARALLEL_AGENTS),
    );

    const { data: agentsData, error: agentsError } = await supabase
      .from("silvio_agent_registry")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (agentsError) throw agentsError;

    const allAgents = (agentsData ?? []) as AgentRegistry[];
    const selectedAgents = selectAgents(
      allAgents,
      objective,
      body.selected_agents,
      maxAgents,
    );
    if (selectedAgents.length === 0) {
      return errorResponse("Nessun agente abilitato disponibile", 409);
    }

    const title = normalizeObjective(body.title ?? "") || buildTitle(objective);
    const { data: missionData, error: missionError } = await supabase
      .from("silvio_agent_missions")
      .insert({
        created_by: userId,
        title,
        objective,
        mode,
        priority: body.priority ?? "normal",
        status: "running",
        selected_agents: selectedAgents.map((agent) => agent.agent_key),
        started_at: new Date().toISOString(),
        metadata: {
          selected_agents: selectedAgents.map(compactAgent),
          force_model: body.force_model ?? null,
          background_processing: true,
          orchestrator_version: "2026-05-p0-p1-async-hardening",
        },
      })
      .select("*")
      .single();
    if (missionError) throw missionError;
    mission = missionData as MissionRow;

    await supabase.from("silvio_agent_messages").insert({
      mission_id: mission.id,
      sender_agent_key: COORDINATOR_AGENT_KEY,
      role: "coordinator",
      content: `Missione avviata in background: ${objective}`,
      metadata: {
        selected_agents: mission.selected_agents,
        background_processing: true,
      },
    });

    const taskRows: TaskRow[] = [];
    for (const [index, agent] of selectedAgents.entries()) {
      const { data: taskData, error: taskError } = await supabase
        .from("silvio_agent_tasks")
        .insert({
          mission_id: mission.id,
          agent_key: agent.agent_key,
          objective,
          status: "queued",
          input_context: {
            mission: { title, objective, mode },
            agent: compactAgent(agent),
          },
          sort_order: (index + 1) * 10,
        })
        .select("id,agent_key")
        .single();
      if (taskError) throw taskError;
      taskRows.push(taskData as TaskRow);
    }

    const processor = (async () => {
      try {
        let totalCostUsd = 0;
        let totalTokens = 0;

        for (const agent of selectedAgents) {
          const task = taskRows.find(
            (row) => row.agent_key === agent.agent_key,
          );
          if (!task) continue;

          await supabase
            .from("silvio_agent_tasks")
            .update({ status: "running", started_at: new Date().toISOString() })
            .eq("id", task.id);

          try {
            const blackboard = await loadBlackboard(supabase, mission.id);
            const memoryBlock = await loadAgentMemory(
              supabase,
              agent.agent_key,
            );
            const toolContext = await executeAgentTools(
              supabase,
              mission.id,
              task.id,
              agent,
              objective,
            );
            await supabase
              .from("silvio_agent_tasks")
              .update({
                input_context: {
                  mission: { title, objective, mode },
                  agent: compactAgent(agent),
                  active_memory_loaded: Boolean(memoryBlock),
                  tool_context: toolContext.map((tool) => ({
                    tool_key: tool.tool_key,
                    ok: tool.ok,
                    duration_ms: tool.duration_ms,
                    error: tool.error ?? null,
                  })),
                },
              })
              .eq("id", task.id);

            const result = await aiRouterComplete({
              supabase,
              taskKey: "silvio_agent_worker",
              userId,
              personaKey: agent.agent_key,
              skipCharge: true,
              estimatedCostEur: 0.12,
              forceModel: body.force_model,
              responseFormat: { type: "json_object" },
              params: { temperature: 0.2, max_tokens: 1400 },
              messages: [
                { role: "system", content: workerSystemPrompt(agent) },
                {
                  role: "user",
                  content: workerUserPrompt(
                    mission,
                    agent,
                    blackboard,
                    toolContext,
                    memoryBlock,
                  ),
                },
              ],
            });

            const output = parseJsonObject<WorkerOutput>(result.content, {
              thesis: result.content.slice(0, 500),
              recommendations: [],
              risks: [
                {
                  title: "Output non strutturato",
                  content: "La risposta AI non era JSON valido.",
                  confidence: 0.8,
                },
              ],
            });
            const outputMd = outputToMarkdown(agent, output);
            totalCostUsd += safeNumber(result.costUsd);
            totalTokens += safeNumber(result.totalTokens);

            await insertBlackboardItems(
              supabase,
              mission.id,
              task.id,
              agent.agent_key,
              output,
            );
            await storeMemorySuggestions(
              supabase,
              mission.id,
              agent.agent_key,
              output,
            );
            await supabase.from("silvio_agent_artifacts").insert({
              mission_id: mission.id,
              task_id: task.id,
              agent_key: agent.agent_key,
              artifact_type: "analysis",
              title: `${agent.display_name} - contributo`,
              content_md: outputMd,
              content_json: output,
            });
            await supabase
              .from("silvio_agent_tasks")
              .update({
                status: "completed",
                output,
                output_md: outputMd,
                cost_usd: result.costUsd,
                tokens_total: result.totalTokens,
                model_id: result.modelUsed,
                completed_at: new Date().toISOString(),
              })
              .eq("id", task.id);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            await supabase
              .from("silvio_agent_tasks")
              .update({
                status: "failed",
                error_message: message,
                completed_at: new Date().toISOString(),
              })
              .eq("id", task.id);
            await supabase.from("silvio_agent_blackboard").insert({
              mission_id: mission.id,
              task_id: task.id,
              agent_key: agent.agent_key,
              entry_type: "risk",
              title: "Agente non completato",
              content: `${agent.display_name}: ${message}`,
              confidence: 1,
              visibility: "actionable",
              evidence: { source: "silvio-agent-orchestrator" },
            });
          }
        }

        const blackboard = await loadBlackboard(supabase, mission.id);
        const completedTasks = taskRows.length
          ? await supabase
              .from("silvio_agent_tasks")
              .select("agent_key,status,output_md,error_message")
              .eq("mission_id", mission.id)
              .order("sort_order", { ascending: true })
          : { data: [] };

        let synthesis: SynthesisOutput;
        try {
          const synthesisResult = await aiRouterComplete({
            supabase,
            taskKey: "silvio_agent_synthesis",
            userId,
            personaKey: COORDINATOR_AGENT_KEY,
            skipCharge: true,
            estimatedCostEur: 0.1,
            forceModel: body.force_model,
            responseFormat: { type: "json_object" },
            params: { temperature: 0.15, max_tokens: 1600 },
            messages: [
              { role: "system", content: synthesisSystemPrompt() },
              {
                role: "user",
                content: `Missione: ${mission.title}
Obiettivo: ${mission.objective}
Agenti: ${mission.selected_agents.join(", ")}

Task output:
${JSON.stringify(completedTasks.data ?? [], null, 2)}

Blackboard:
${JSON.stringify(blackboard, null, 2)}

Produci sintesi unica di Silvio.`,
              },
            ],
          });
          synthesis = parseJsonObject<SynthesisOutput>(
            synthesisResult.content,
            {
              summary_md: synthesisResult.content,
              next_action: "Rivedere manualmente la missione nel Silvio Hub.",
              confidence: 0.5,
              needs_approval: true,
            },
          );
          totalCostUsd += safeNumber(synthesisResult.costUsd);
          totalTokens += safeNumber(synthesisResult.totalTokens);
        } catch (error) {
          const failed = (completedTasks.data ?? [])
            .filter((task: Record<string, unknown>) => task.status === "failed")
            .map(
              (task: Record<string, unknown>) =>
                `- ${task.agent_key}: ${task.error_message}`,
            )
            .join("\n");
          synthesis = {
            summary_md: [
              "Sintesi automatica parziale: alcuni agenti hanno completato la missione, ma la sintesi AI non e riuscita.",
              failed ? `\nAgenti falliti:\n${failed}` : "",
              "\nProssimo passo: apri i task completati e valida manualmente le raccomandazioni.",
            ].join("\n"),
            next_action:
              "Validare manualmente i task completati nel Silvio Hub.",
            confidence: 0.35,
            needs_approval: true,
            risks: [error instanceof Error ? error.message : String(error)],
          };
        }

        const taskData = (completedTasks.data ?? []) as Array<
          Record<string, unknown>
        >;
        const failedTaskCount = taskData.filter(
          (task) => task.status === "failed",
        ).length;
        const riskEntryCount = blackboard.filter(
          (entry) => entry.entry_type === "risk",
        ).length;
        const factEntryCount = blackboard.filter(
          (entry) =>
            entry.entry_type === "fact" || entry.entry_type === "source",
        ).length;
        const synthesisConfidence = clampConfidence(synthesis.confidence);
        const needsApproval =
          Boolean(synthesis.needs_approval) ||
          (synthesis.risks ?? []).length > 0 ||
          failedTaskCount > 0 ||
          riskEntryCount > 0 ||
          (synthesisConfidence !== null && synthesisConfidence < 0.65);
        const finalStatus = needsApproval ? "waiting_approval" : "completed";
        const finishedAt = new Date().toISOString();

        await supabase.from("silvio_agent_evaluations").insert({
          mission_id: mission.id,
          evaluator_agent_key: QA_AGENT_KEY,
          quality_score: synthesisConfidence,
          risk_score: needsApproval ? 0.7 : 0.25,
          hallucination_risk: needsApproval ? "medium" : "low",
          missing_evidence: factEntryCount === 0,
          needs_human_approval: needsApproval,
          verdict: needsApproval ? "needs_revision" : "pass",
          notes: (synthesis.risks ?? []).join("\n") || null,
        });

        await supabase.from("silvio_agent_blackboard").insert({
          mission_id: mission.id,
          agent_key: COORDINATOR_AGENT_KEY,
          entry_type: "decision",
          title: needsApproval ? "Sintesi da validare" : "Sintesi approvabile",
          content:
            synthesis.next_action ?? "Nessuna azione successiva dichiarata.",
          confidence: clampConfidence(synthesis.confidence),
          visibility: "actionable",
          evidence: {
            needs_approval: needsApproval,
            risks: synthesis.risks ?? [],
          },
        });

        await supabase
          .from("silvio_agent_missions")
          .update({
            status: finalStatus,
            summary_md:
              synthesis.summary_md ?? "Missione completata senza sintesi.",
            next_action:
              synthesis.next_action ?? "Rivedere la missione nel Silvio Hub.",
            confidence: synthesisConfidence,
            total_cost_usd: totalCostUsd,
            total_tokens: totalTokens,
            completed_at: finalStatus === "completed" ? finishedAt : null,
            review_requested_at: needsApproval ? finishedAt : null,
            metadata: {
              ...cleanMetadata(mission.metadata),
              selected_agents: selectedAgents.map(compactAgent),
              needs_approval: needsApproval,
              risk_entry_count: riskEntryCount,
              failed_task_count: failedTaskCount,
              fact_entry_count: factEntryCount,
              risks: synthesis.risks ?? [],
              force_model: body.force_model ?? null,
              background_processing: true,
              orchestrator_version: "2026-05-p0-p1-async-hardening",
            },
          })
          .eq("id", mission.id);

        return {
          ok: true,
          mission_id: mission.id,
          status: finalStatus,
          agents: selectedAgents.map(compactAgent),
          summary_md: synthesis.summary_md,
          next_action: synthesis.next_action,
          confidence: synthesis.confidence,
          needs_approval: needsApproval,
          total_cost_usd: totalCostUsd,
          total_tokens: totalTokens,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mission?.id) {
          await supabase
            .from("silvio_agent_missions")
            .update({
              status: "failed",
              last_error: message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", mission.id);
        }
        return {
          ok: false,
          mission_id: mission?.id,
          status: "failed",
          error: message,
        };
      }
    })();
    scheduleBackground(processor);

    return jsonResponse(
      {
        ok: true,
        accepted: true,
        mission_id: mission.id,
        status: "running",
        agents: selectedAgents.map(compactAgent),
        next_action:
          "Missione avviata in background. Apri il dettaglio per seguire avanzamento, task e QA.",
      },
      202,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Unauthorized|Missing bearer/.test(message)
      ? 401
      : /Forbidden/.test(message)
        ? 403
        : /objective|Nessun agente/.test(message)
          ? 400
          : 500;
    return errorResponse(message, status);
  }
});
