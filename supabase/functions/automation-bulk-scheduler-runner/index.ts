/**
 * automation-bulk-scheduler-runner — esegue messaggi programmati bulk
 *
 * Chiamato ogni 5 min da pg_cron. Per ogni automation_flow con
 * `bulk_trigger_config` valorizzato e `next_run_at <= now()`:
 *   1. Resolve target users via RPC bulk_scheduler_resolve_targets
 *   2. Per ogni target:
 *      a. Resolve variabili context-aware (cantiere_oggi, ore, ecc.)
 *      b. Render template OR chiama LLM (mode=ai_generated)
 *      c. Per ogni canale in preferred_order: prova send, fallback se fail
 *      d. Log in automation_execution_log
 *   3. Update next_run_at via cronTickToDate
 *   4. Log riassunto in bulk_scheduler_runs
 *
 * Auth: x-cron-secret header (INTERNAL_CRON_SECRET env var). Vedi
 * silvio-morning-brief per stesso pattern.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { isInternalRequest, requireInternalSecret } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Cron expression → next fire date. cron-parser è la lib standard.
import cronParser from "https://esm.sh/cron-parser@4.9.0";

interface BulkTriggerConfig {
  type: "bulk_scheduler";
  cron: string;
  timezone?: string;
  target: { type: string; value: string | null };
  channels: Array<{ type: "silvio_chat" | "telegram" | "whatsapp" | "email" }>;
  use_fallback?: boolean;
  template: {
    mode: "static" | "ai_generated";
    body: string;
    ai_prompt?: string;
  };
  next_run_at?: string;
  last_run_at?: string | null;
}

interface FlowToRun {
  flow_id: string;
  company_id: string;
  flow_name: string;
  config: BulkTriggerConfig;
}

interface TargetUser {
  user_id: string;
  first_name: string;
  email: string;
}

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const MAX_TARGETS_PER_RUN = 200;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      return errorResponse("Forbidden: internal only", 403, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: dueFlows, error: dueErr } = await supabase.rpc("bulk_scheduler_due_flows");
    if (dueErr) return errorResponse(`due_flows: ${dueErr.message}`, 500, cors);

    const flows: FlowToRun[] = (dueFlows ?? []).map((r: FlowToRun) => ({
      flow_id: r.flow_id,
      company_id: r.company_id,
      flow_name: r.flow_name,
      config: r.config as unknown as BulkTriggerConfig,
    }));

    if (flows.length === 0) {
      return jsonResponse({ ok: true, due: 0 }, cors);
    }

    const results: Array<{ flow_id: string; status: string; sent: number; failed: number }> = [];

    for (const flow of flows) {
      try {
        const result = await runFlow(supabase, flow);
        results.push(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[bulk-scheduler] flow ${flow.flow_id} FAILED:`, msg);
        results.push({ flow_id: flow.flow_id, status: "failed", sent: 0, failed: 0 });
      }
    }

    return jsonResponse({ ok: true, due: flows.length, results }, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bulk-scheduler] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFlow(supabase: any, flow: FlowToRun): Promise<{ flow_id: string; status: string; sent: number; failed: number }> {
  const config = flow.config;
  const scheduledFor = config.next_run_at ? new Date(config.next_run_at) : new Date();

  // 1. Crea run log entry
  const { data: runRow } = await supabase
    .from("bulk_scheduler_runs")
    .insert({
      flow_id: flow.flow_id,
      company_id: flow.company_id,
      scheduled_for: scheduledFor.toISOString(),
      status: "running",
    })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  // 2. Resolve target users
  const { data: targets, error: tErr } = await supabase.rpc("bulk_scheduler_resolve_targets", {
    p_company_id: flow.company_id,
    p_target_type: config.target.type,
    p_target_value: config.target.value,
  });
  if (tErr) {
    if (runId) await supabase.from("bulk_scheduler_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_summary: tErr.message }).eq("id", runId);
    throw new Error(`resolve_targets: ${tErr.message}`);
  }

  const users: TargetUser[] = (targets ?? []).slice(0, MAX_TARGETS_PER_RUN);
  console.log(`[bulk-scheduler] flow ${flow.flow_id} targets=${users.length}`);

  // 3. Per ogni utente: render + send
  const channelCounts: Record<string, number> = {};
  let sentOk = 0;
  let sentFailed = 0;

  for (const user of users) {
    try {
      const { messageBody, channelUsed } = await sendToUser(supabase, flow, user);
      sentOk++;
      channelCounts[channelUsed] = (channelCounts[channelUsed] ?? 0) + 1;
      void messageBody;
    } catch (e) {
      sentFailed++;
      console.warn(`[bulk-scheduler] user ${user.user_id} fail:`, e);
    }
  }

  // 4. Calcola next_run_at via cron-parser (libreria standard)
  let nextRunAt: Date;
  try {
    const interval = cronParser.parseExpression(config.cron, {
      tz: config.timezone ?? "Europe/Rome",
      currentDate: new Date(),
    });
    nextRunAt = interval.next().toDate();
  } catch (e) {
    console.error(`[bulk-scheduler] cron parse fail "${config.cron}":`, e);
    // Fallback: next run +24h per evitare loop
    nextRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  await supabase.rpc("bulk_scheduler_mark_executed", {
    p_flow_id: flow.flow_id,
    p_next_run_at: nextRunAt.toISOString(),
  });

  // 5. Aggiorna run log
  const finalStatus = sentFailed === 0 ? "success" : sentOk === 0 ? "failed" : "partial";
  if (runId) {
    await supabase.from("bulk_scheduler_runs").update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      targets_resolved: users.length,
      sent_ok: sentOk,
      sent_failed: sentFailed,
      channel_breakdown: channelCounts,
    }).eq("id", runId);
  }

  return { flow_id: flow.flow_id, status: finalStatus, sent: sentOk, failed: sentFailed };
}

/**
 * Invia il messaggio a un singolo utente. Risolve variabili, render template
 * (o chiama LLM se mode=ai_generated), poi prova i canali in ordine
 * preferred_order dell'utente, con fallback se non disponibile/fallisce.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendToUser(supabase: any, flow: FlowToRun, user: TargetUser): Promise<{ messageBody: string; channelUsed: string }> {
  const config = flow.config;

  // 1. Resolve variabili context-aware per questo utente
  const variables = await resolveVariables(supabase, flow.company_id, user);

  // 2. Costruisci body del messaggio
  let messageBody: string;
  if (config.template.mode === "ai_generated" && config.template.ai_prompt) {
    const aiPrompt = renderTemplate(config.template.ai_prompt, variables);
    messageBody = await generateWithAi(supabase, flow.company_id, user.user_id, aiPrompt);
  } else {
    messageBody = renderTemplate(config.template.body, variables);
  }

  // 3. Carica preferred order dell'utente (o usa default)
  const { data: prefs } = await supabase
    .from("user_messaging_channels")
    .select("preferred_order, silvio_chat_enabled, telegram_chat_id, whatsapp_phone, email_enabled, email_override")
    .eq("user_id", user.user_id)
    .maybeSingle();

  const flowChannels = (config.channels ?? []).map((c) => c.type);
  const userOrder: string[] = (prefs?.preferred_order as string[]) ?? ["silvio_chat", "email"];
  // Intersect: solo canali che il flow vuole E che l'utente ammette
  const effective = userOrder.filter((c) => flowChannels.includes(c));
  const candidates = effective.length > 0 ? effective : flowChannels.length > 0 ? flowChannels : ["silvio_chat"];

  // 4. Prova ogni canale finché uno non funziona
  for (const channel of candidates) {
    try {
      await sendViaChannel(supabase, flow, user, prefs, channel, messageBody);
      return { messageBody, channelUsed: channel };
    } catch (e) {
      console.warn(`[bulk-scheduler] channel ${channel} fail for ${user.user_id}:`, e);
      if (!config.use_fallback) throw e;
    }
  }

  throw new Error("Nessun canale ha avuto successo");
}

/**
 * Send via canale specifico. MVP supporta solo silvio_chat. Telegram/WhatsApp/
 * email aggiunti in iterazioni successive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendViaChannel(supabase: any, flow: FlowToRun, user: TargetUser, prefs: any, channel: string, body: string): Promise<void> {
  if (channel === "silvio_chat") {
    if (prefs && prefs.silvio_chat_enabled === false) throw new Error("silvio_chat disabilitato per utente");
    // Trova il channel silvio dell'utente (idempotent — lo crea se non esiste)
    const { data: channelId, error: chanErr } = await supabase.rpc("ensure_user_silvio_channel", {
      p_user_id: user.user_id,
    });
    if (chanErr || !channelId) {
      throw new Error(`no silvio channel: ${chanErr?.message ?? "rpc returned null"}`);
    }
    const { error: insErr } = await supabase.from("internal_chat_messages").insert({
      channel_id: channelId,
      sender_id: SILVIO_SENDER_ID,
      company_id: flow.company_id,
      content: `📅 ${flow.flow_name}\n\n${body}`,
      message_type: "text",
    });
    if (insErr) throw new Error(`insert silvio msg: ${insErr.message}`);
    return;
  }

  // MVP: altri canali stub — log e skip
  throw new Error(`Canale ${channel} non supportato nel MVP (solo silvio_chat)`);
}

/**
 * Resolve variabili context-aware per un utente.
 * MVP set: nome, ruolo, cantiere_oggi, numero_cantieri_aperti.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveVariables(supabase: any, companyId: string, user: TargetUser): Promise<Record<string, string>> {
  const vars: Record<string, string> = {
    nome: user.first_name ?? "Utente",
    email: user.email ?? "",
  };

  // Numero cantieri aperti (utile per company_admin)
  try {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("balance_paid", false);
    vars.numero_cantieri_aperti = String(count ?? 0);
  } catch { vars.numero_cantieri_aperti = "n.d."; }

  // Cantiere oggi (per operai): cerca order_employee_assignments con assegnazione oggi.
  // Tabelle potrebbero non esistere — wrap in try.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: assignment } = await supabase
      .from("order_employee_assignments")
      .select("order_id, hours_planned, orders:order_id(description)")
      .eq("employee_id", user.user_id)
      .eq("work_date", today)
      .maybeSingle();
    if (assignment) {
      const desc = (assignment.orders as { description?: string } | null)?.description ?? "";
      vars.cantiere_oggi = `${assignment.order_id?.slice(0, 8) ?? ""} ${desc}`.trim();
      vars.ore_pianificate = `${assignment.hours_planned ?? 8} ore`;
    } else {
      vars.cantiere_oggi = "Nessun cantiere assegnato oggi";
      vars.ore_pianificate = "—";
    }
  } catch {
    vars.cantiere_oggi = "n.d.";
    vars.ore_pianificate = "n.d.";
  }

  return vars;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/gi, (_, k) => vars[k] ?? `{${k}}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateWithAi(supabase: any, companyId: string, userId: string, prompt: string): Promise<string> {
  const result = await aiRouterComplete({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    taskKey: "text_summarize",
    messages: [
      { role: "system", content: "Sei Silvio, assistente AI. Genera un messaggio personalizzato breve (max 200 char) per l'utente. Tono diretto, no emoji, italiano." },
      { role: "user", content: prompt },
    ],
    params: { temperature: 0.5, max_tokens: 300 },
    companyId,
    userId,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((result as any)?.content ?? "").trim() || "Briefing AI non disponibile.";
}
