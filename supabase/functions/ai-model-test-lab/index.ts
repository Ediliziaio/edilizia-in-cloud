import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  errorResponse,
  getCorsHeaders,
  jsonResponse,
} from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete, AiRouterError } from "../_shared/aiRouter.ts";
import { type ToolContext } from "../_shared/silvioTools.ts";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { parseStructuredResponse } from "../_shared/structuredOutput.ts";

const PERSONA_KEY = "silvio";
const DEMO_LAB_EMAIL = "demo@azienda.srl";
const MAX_MODELS_PER_RUN = 6;
const MODEL_REQUEST_TIMEOUT_MS = 95_000;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const TOOL_SNAPSHOT_TIMEOUT_MS = 12_000;
const TOOL_SNAPSHOT_CONCURRENCY = 3;

const TEST_LAB_SNAPSHOT_CALLS: Array<{
  name: string;
  label: string;
  args: Record<string, unknown>;
}> = [
  { name: "get_company_kpi", label: "KPI aziendali", args: {} },
  {
    name: "get_orders_summary",
    label: "Commesse attive",
    args: { status: "active", limit: 30 },
  },
  {
    name: "get_revenue_forecast",
    label: "Incassi previsti 45 giorni",
    args: { days_ahead: 45 },
  },
  { name: "get_overdue_payments", label: "Rate clienti scadute", args: {} },
  {
    name: "get_cashflow_status",
    label: "Saldo e movimenti banca",
    args: { days_back: 30 },
  },
  {
    name: "get_cashflow_forecast_90d",
    label: "Forecast cassa 90 giorni",
    args: { weeks: 13, apply_delay: true },
  },
  {
    name: "get_cashflow_forecast_scenarios",
    label: "Scenari cashflow",
    args: {},
  },
  {
    name: "get_received_invoices",
    label: "Fatture fornitori da pagare",
    args: { status: "unpaid" },
  },
  {
    name: "lista_lavori_pose_periodo",
    label: "Lavori, pose e merce in arrivo",
    args: { days: 45, include_materials: true },
  },
];

interface LabPayload {
  action?: "models" | "compare";
  company_id?: string;
  prompt?: string;
  models?: string[];
  include_tools?: boolean;
  max_tool_iterations?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  context_length?: number;
  pricing?: Record<string, string>;
  architecture?: Record<string, unknown>;
}

function normalizeCompanyName(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDemoCompany(name: string | null | undefined): boolean {
  const normalized = normalizeCompanyName(name);
  return normalized.includes("demo azienda");
}

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function sanitizeModelId(model: unknown): string | null {
  const value = String(model ?? "").trim();
  if (!value || value.length > 160) return null;
  if (!/^[a-zA-Z0-9._~:/-]+$/.test(value)) return null;
  return value;
}

async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {};
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(OPENROUTER_MODELS_URL, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter models ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ""),
      name: String(m.name ?? m.id ?? ""),
      context_length: typeof m.context_length === "number"
        ? m.context_length
        : undefined,
      pricing: (m.pricing && typeof m.pricing === "object")
        ? m.pricing as Record<string, string>
        : undefined,
      architecture: (m.architecture && typeof m.architecture === "object")
        ? m.architecture as Record<string, unknown>
        : undefined,
    }))
    .filter((m: ModelInfo) => m.id);
}

async function loadLabRequesterAccess(supabaseAdmin: any, userId: string) {
  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  let authEmail = "";
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    authEmail = data?.user?.email ?? "";
  } catch {
    authEmail = "";
  }

  const roles: string[] = (userRoles ?? []).map((r: { role: string }) =>
    r.role
  );
  const email = normalizeEmail(profile?.email || authEmail);
  return {
    email,
    roles,
    isSuperAdmin: roles.includes("super_admin"),
    isDemoLabUser: email === DEMO_LAB_EMAIL,
  };
}

async function loadUserRuntime(supabaseAdmin: any, userId: string) {
  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  const roleList: string[] = (userRoles ?? []).map((r: { role: string }) =>
    r.role
  );
  const rolePriority = [
    "super_admin",
    "company_admin",
    "salesperson",
    "call_center",
    "company_staff",
    "employee",
    "subcontractor",
    "worker",
  ];
  const primaryRole = rolePriority.find((role) => roleList.includes(role)) ??
    roleList[0] ?? "company_staff";
  const userName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email || "Utente";
  return { primaryRole, userName };
}

function buildLabSystemPrompt(
  userName: string,
  primaryRole: string,
  includeTools: boolean,
): string {
  const roleScopeMap: Record<string, string> = {
    super_admin: "Accesso completo a tutto.",
    company_admin:
      "Titolare/amministratore: può chiedere finanza, cantieri, vendite, personale, legale, strategia.",
    company_staff: "Staff operativo: operations e amministrazione di base.",
    salesperson:
      "Venditore: clienti, preventivi, pipeline. No finanza globale.",
    call_center: "Call-center: info cliente e FAQ. No finanza/HR.",
    employee: "Dipendente: info proprie. No finanza globale.",
    worker: "Operaio: info sui propri cantieri.",
    subcontractor: "Subappaltatore: solo lavori propri.",
  };

  return [
    "Sei Silvio, l'assistente AI operativo di EdiliziaInCloud.",
    "Rispondi in italiano, con tono diretto, concreto, da consulente operativo che aiuta un imprenditore edile a decidere cosa fare.",
    "La risposta deve sembrare una normale bolla chat di Silvio: niente JSON, niente fonti tecniche, niente nomi di modelli, niente 'Risposta Certificata'.",
    "",
    "# UTENTE",
    `- Nome: ${userName}`,
    `- Ruolo: ${primaryRole}`,
    `- Perimetro: ${roleScopeMap[primaryRole] ?? "Accesso limitato."}`,
    "",
    "# CONTESTO TEST",
    "- Questa e' una prova comparativa modelli su Demo Azienda S.r.l.",
    "- NON stai parlando nella chat normale e NON devi scrivere messaggi, documenti o bozze operative.",
    "- Non nominare mai personas, council, tutor o consulenti interni: rispondi sempre come un unico Silvio.",
    "- Non dire 'tool', 'snapshot', 'RAG', 'fonti', 'modello', 'provider', 'test lab'.",
    "",
    "# REGOLE DI RAGIONAMENTO",
    "- Se analizzi cassa o vendite, separa sempre venduto/fatturato, incassato, scaduto, incassi previsti, costi fissi, costi variabili e margine atteso.",
    "- Non proporre di aumentare il fatturato senza chiarire impatto su cashflow, acconti, merce, manodopera e tempi di incasso.",
    "- Fatturato non significa incassato. Una vendita aiuta la cassa solo se entra acconto/saldo nel periodo giusto.",
    "- Per commesse nuove considera costi variabili iniziali: merce, manodopera, fornitori, posa, eventuali subappaltatori.",
    "- Non confondere mai giornate lavoro, ore, scadenze o conteggi documento con numero dipendenti. Il team reale va preso solo da campi espliciti tipo operai, dipendenti, employee_count, team_size.",
    "- Se due dati sembrano contraddirsi, segnala il dubbio e usa il valore piu' prudente invece di inventare.",
    "- Dai una risposta confrontabile: sintesi, numeri usati, scenario prudente, scenario operativo, azioni prioritarie.",
    includeTools
      ? "- Usa i dati aziendali forniti sotto. Se manca un dato, dichiara l'ipotesi in modo semplice."
      : "- Se non hai dati aziendali reali, dichiara che la risposta e' solo qualitativa.",
    "",
    "# FORMATO",
    "- Numeri in formato italiano: € 1.234,56",
    "- Date in formato dd/mm/yyyy",
    "- Usa titoletti brevi, bullet chiari e una conclusione operativa.",
    "- Evita tabelle troppo larghe: se servono, tienile piccole.",
    "- Non superare 900 parole.",
  ].join("\n");
}

function cleanLabReplyForUser(content: string): string {
  return String(content ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/^[ \t]*#{1,6}\s*.*?Risposta\s+Certificata.*$/gim, "")
    .replace(/\s*[—-]\s*Risposta\s+Certificata/gi, "")
    .replace(/\bRisposta\s+Certificata\b/gi, "")
    .replace(/\n#{1,3}\s+Fonti\s*[\s\S]*$/i, "")
    .replace(/\s*\[S\d+\+?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateJson(value: unknown, maxChars = 1400): string {
  try {
    const json = JSON.stringify(value, null, 2);
    if (json.length <= maxChars) return json;
    return `${json.slice(0, maxChars)}\n... [troncato per confronto modelli]`;
  } catch {
    return String(value).slice(0, maxChars);
  }
}

async function withToolTimeout<T>(
  promise: Promise<T>,
  label: string,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(
            `${label}: timeout dopo ${
              Math.round(TOOL_SNAPSHOT_TIMEOUT_MS / 1000)
            }s`,
          ),
        ),
      TOOL_SNAPSHOT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function runLimited<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const current = cursor++;
        results[current] = await worker(items[current], current);
      }
    }),
  );
  return results;
}

async function buildDeterministicDataSnapshot(
  toolCtx: ToolContext,
  includeTools: boolean,
): Promise<{
  block: string;
  calls: Array<
    { name: string; result_preview: string; risk_level?: string | null }
  >;
}> {
  if (!includeTools) {
    return { block: "", calls: [] };
  }

  const results = await runLimited(
    TEST_LAB_SNAPSHOT_CALLS,
    TOOL_SNAPSHOT_CONCURRENCY,
    async (call) => {
      try {
        const result = await withToolTimeout(
          executeToolWithRouting(call.name, call.args, toolCtx),
          call.name,
        );
        return { call, result };
      } catch (e) {
        return {
          call,
          result: {
            success: false,
            toolName: call.name,
            error: {
              code: "snapshot_failed",
              message: e instanceof Error ? e.message : String(e),
            },
            durationMs: TOOL_SNAPSHOT_TIMEOUT_MS,
          },
        };
      }
    },
  );

  const lines: string[] = [
    "# DATI AZIENDALI DISPONIBILI PER IL TEST",
    "Usa questi dati come contesto. Non dire che hai chiamato tool. Se un dato e' parziale, dichiaralo come limite operativo.",
    "Regola importante: fatturato/venduto NON equivale a incassato. Per decidere quanto fatturare considera anche acconti, tempi di incasso, rate scadute, costi variabili, merce, manodopera e margine.",
  ];

  const calls: Array<
    { name: string; result_preview: string; risk_level?: string | null }
  > = [];
  for (const { call, result } of results) {
    const payload = result.success
      ? result.data
      : { error: result.error?.message ?? "dato non disponibile" };
    const preview = truncateJson(payload);
    lines.push(`\n## ${call.label} (${call.name})\n${preview}`);
    calls.push({
      name: call.name,
      result_preview: preview.slice(0, 500),
      risk_level: result.riskLevel ?? null,
    });
  }

  return {
    block: lines.join("\n").slice(0, 11_000),
    calls,
  };
}

async function runModelComparison(args: {
  supabaseAdmin: any;
  companyId: string;
  userId: string;
  userMessage: string;
  model: string;
  includeTools: boolean;
}) {
  const {
    supabaseAdmin,
    companyId,
    userId,
    userMessage,
    model,
    includeTools,
  } = args;

  const t0 = Date.now();
  const { primaryRole, userName } = await loadUserRuntime(
    supabaseAdmin,
    userId,
  );

  const { data: persona } = await supabaseAdmin
    .from("ai_personas")
    .select("enabled")
    .eq("persona_key", PERSONA_KEY)
    .maybeSingle();

  if (!persona?.enabled) {
    throw new Error("Silvio non configurato o disabilitato");
  }
  const toolCtx: ToolContext = {
    supabase: supabaseAdmin,
    companyId,
    userId,
    primaryRole,
    personaKey: PERSONA_KEY,
    channel: "internal_chat",
    kbAreasFilter: null,
    sessionId: `ai-test-lab:${companyId}`,
    traceId: crypto.randomUUID(),
  };

  const snapshot = await buildDeterministicDataSnapshot(toolCtx, includeTools);

  const messages: any[] = [
    {
      role: "system",
      content: buildLabSystemPrompt(userName, primaryRole, includeTools),
    },
    {
      role: "user",
      content: snapshot.block
        ? `${userMessage}\n\n${snapshot.block}`
        : userMessage,
    },
  ];

  const idempotencyBase = await buildStableAiIdempotencyKey(
    "ai_model_test_lab",
    [
      companyId,
      userId,
      model,
      includeTools,
      userMessage,
    ],
  );

  let finalContent = "";
  let lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null = null;
  const result = await aiRouterComplete({
    supabase: supabaseAdmin,
    taskKey: "persona_silvio",
    messages,
    params: {
      temperature: 0.25,
      max_tokens: 3200,
      request_timeout_ms: MODEL_REQUEST_TIMEOUT_MS,
      request_retries: 0,
      reasoning: { exclude: true },
      include_reasoning: false,
    },
    companyId,
    userId,
    personaKey: PERSONA_KEY,
    idempotencyKey: `${idempotencyBase}_snapshot`,
    forceModel: model,
    disableFallback: true,
    skipCharge: true,
    estimatedCostEur: 0.10,
  });
  lastResult = result;
  finalContent = result.content || "";

  const structured = parseStructuredResponse(finalContent);
  if (structured?.answer) {
    finalContent = structured.answer;
  }

  finalContent = cleanLabReplyForUser(finalContent);

  return {
    model,
    ok: true,
    reply: finalContent.trim(),
    duration_ms: Date.now() - t0,
    model_used: lastResult?.modelUsed ?? model,
    tokens_in: lastResult?.promptTokens ?? 0,
    tokens_out: lastResult?.completionTokens ?? 0,
    tokens_total: lastResult?.totalTokens ?? 0,
    cost_usd: lastResult?.costUsd ?? 0,
    cost_real_eur: lastResult?.costRealEur ?? 0,
    cost_billed_eur: 0,
    charge_skipped: true,
    iterations: 1,
    tool_calls: snapshot.calls,
    rag_sources: [],
    rag_min_similarity: null,
    citations_used: [],
    citations_missing: false,
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, corsHeaders);
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    const body = (await req.json()) as LabPayload;
    const action = body.action ?? "compare";

    if (action === "models") {
      const models = await fetchOpenRouterModels();
      return jsonResponse({ ok: true, models }, 200, corsHeaders);
    }

    const companyId = body.company_id?.trim();
    const prompt = body.prompt?.trim() ?? "";
    const models = (body.models ?? []).map(sanitizeModelId).filter((
      m,
    ): m is string => Boolean(m));

    if (!companyId) {
      return errorResponse("company_id mancante", 400, corsHeaders);
    }
    if (!prompt) return errorResponse("prompt mancante", 400, corsHeaders);
    if (prompt.length > 8000) {
      return errorResponse(
        "prompt troppo lungo (max 8000 char)",
        400,
        corsHeaders,
      );
    }
    if (models.length === 0) {
      return errorResponse("seleziona almeno un modello", 400, corsHeaders);
    }
    if (models.length > MAX_MODELS_PER_RUN) {
      return errorResponse(
        `massimo ${MAX_MODELS_PER_RUN} modelli per test`,
        400,
        corsHeaders,
      );
    }

    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    if (companyError || !company) {
      return errorResponse("azienda non trovata", 404, corsHeaders);
    }
    if (!isDemoCompany(company.name)) {
      return errorResponse(
        "AI Test Lab disponibile solo su Demo Azienda S.r.l.",
        403,
        corsHeaders,
      );
    }

    const labAccess = await loadLabRequesterAccess(supabaseAdmin, userId);
    if (!labAccess.isSuperAdmin && !labAccess.isDemoLabUser) {
      return errorResponse(
        "AI Test Lab disponibile solo per SuperAdmin o demo@azienda.srl.",
        403,
        corsHeaders,
      );
    }

    const includeTools = body.include_tools !== false;
    const results = [];
    for (const model of models) {
      try {
        results.push(
          await runModelComparison({
            supabaseAdmin,
            companyId,
            userId,
            userMessage: prompt,
            model,
            includeTools,
          }),
        );
      } catch (e) {
        const attempts = e instanceof AiRouterError ? e.attempts : [];
        const singleAttemptError = attempts.length === 1
          ? attempts[0]?.error
          : "";
        results.push({
          model,
          ok: false,
          error: singleAttemptError ||
            (e instanceof Error ? e.message : String(e)),
          attempts,
          duration_ms: 0,
        });
      }
    }

    return jsonResponse(
      {
        ok: true,
        company: { id: company.id, name: company.name },
        include_tools: includeTools,
        charge_mode:
          "skipCharge=true: nessun addebito wallet, solo costo reale stimato/provider",
        results,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-model-test-lab] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
