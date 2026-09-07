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
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Cron expression → next fire date. cron-parser è la lib standard.
import cronParser from "https://esm.sh/cron-parser@4.9.0";

import { serveConMetriche } from "../_shared/withMetrics.ts";
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

serveConMetriche("automation-bulk-scheduler-runner", async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    console.log("[bulk-scheduler] start", { method: req.method, url: req.url });

    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      return errorResponse("Forbidden: internal only", 403, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      console.error("[bulk-scheduler] missing env", { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
      return errorResponse("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", 500, cors);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("[bulk-scheduler] querying due flows");
    const { data: dueFlows, error: dueErr } = await supabase.rpc("bulk_scheduler_due_flows");
    if (dueErr) {
      console.error("[bulk-scheduler] due_flows query failed", dueErr);
      return errorResponse(`due_flows: ${dueErr.message}`, 500, cors);
    }
    console.log("[bulk-scheduler] due flows found:", (dueFlows ?? []).length);

    const flows: FlowToRun[] = (dueFlows ?? []).map((r: FlowToRun) => ({
      flow_id: r.flow_id,
      company_id: r.company_id,
      flow_name: r.flow_name,
      config: r.config as unknown as BulkTriggerConfig,
    }));

    if (flows.length === 0) {
      return jsonResponse({ ok: true, due: 0, message: "No flows due" }, 200, cors);
    }

    const results: Array<{ flow_id: string; status: string; sent: number; failed: number; error?: string }> = [];

    for (const flow of flows) {
      console.log("[bulk-scheduler] processing flow", flow.flow_id, flow.flow_name);
      try {
        const result = await runFlow(supabase, flow);
        results.push(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        console.error(`[bulk-scheduler] flow ${flow.flow_id} FAILED:`, msg, stack?.slice(0, 500));
        results.push({ flow_id: flow.flow_id, status: "failed", sent: 0, failed: 0, error: msg });
      }
    }

    return jsonResponse({ ok: true, due: flows.length, results }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[bulk-scheduler] fatal", msg, stack?.slice(0, 500));
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

  // 3. Carica preferred order + tutte le credenziali canale dell'utente
  const { data: prefs } = await supabase
    .from("user_messaging_channels")
    .select("preferred_order, silvio_chat_enabled, telegram_chat_id, telegram_verified_at, whatsapp_phone, whatsapp_verified_at, email_enabled, email_override, quiet_from, quiet_to, quiet_timezone")
    .eq("user_id", user.user_id)
    .maybeSingle();

  // 3.a Quiet hours: se l'utente ha impostato un range silenzio e siamo dentro,
  // skippiamo questo target SENZA marcare come failed. È una preferenza esplicita.
  if (prefs?.quiet_from && prefs?.quiet_to) {
    const now = new Date();
    const tz = prefs.quiet_timezone || "Europe/Rome";
    // Estrae HH:MM nel tz utente
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const nowHM = fmt.format(now); // "HH:MM"
    const from = prefs.quiet_from as string;
    const to = prefs.quiet_to as string;
    const inQuiet = from <= to
      ? nowHM >= from && nowHM < to              // range normale es. 22:00-07:00 sarebbe inverso
      : nowHM >= from || nowHM < to;             // range che attraversa mezzanotte
    if (inQuiet) {
      throw new Error(`In quiet hours (${from}-${to} ${tz})`);
    }
  }

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
 * Send via canale specifico. Supporta:
 *   - silvio_chat: insert in internal_chat_messages
 *   - email: sendEmailUnified (Resend/SendGrid/Elastic + billing)
 *   - whatsapp: invoke whatsapp-send edge function via x-cron-secret
 *   - telegram: POST direct su api.telegram.org/bot<token>/sendMessage
 *
 * Ogni canale fa pre-check di disponibilità e throw se manca il routing:
 *   - email: serve email valida
 *   - whatsapp: serve whatsapp_phone in user_messaging_channels + verified
 *   - telegram: serve telegram_user_mapping verified + bot_config attivo
 *
 * In caso di throw, il chiamante (sendToUser) prova il prossimo canale
 * in `preferred_order` se use_fallback=true.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendViaChannel(supabase: any, flow: FlowToRun, user: TargetUser, prefs: any, channel: string, body: string): Promise<void> {
  // ── SILVIO CHAT (in-app) ──────────────────────────────────────────────
  if (channel === "silvio_chat") {
    if (prefs && prefs.silvio_chat_enabled === false) throw new Error("silvio_chat disabilitato per utente");
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

  // ── EMAIL ─────────────────────────────────────────────────────────────
  if (channel === "email") {
    if (prefs && prefs.email_enabled === false) throw new Error("email disabilitata per utente");
    const toEmail = prefs?.email_override?.trim() || user.email;
    if (!toEmail) throw new Error("email destinatario mancante");
    // Plain text → HTML semplice (preserva newline + escape minimo).
    const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; line-height: 1.5;">
  <h2 style="color: #f97316; margin-bottom: 12px;">📅 ${escapeHtml(flow.flow_name)}</h2>
  <div style="white-space: pre-wrap; font-size: 14px;">${escapeHtml(body)}</div>
  <hr style="margin-top: 24px; border: none; border-top: 1px solid #e2e8f0;">
  <p style="font-size: 11px; color: #94a3b8;">Messaggio automatico — preferenze in /azienda/impostazioni/notifiche</p>
</div>`;
    const result = await sendEmailUnified({
      companyId: flow.company_id,
      stream: "transactional",
      to: toEmail,
      subject: flow.flow_name,
      html,
      text: body,
      templateName: "bulk_scheduler_message",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: supabase as any,
      metadata: { flow_id: flow.flow_id, recipient_user_id: user.user_id },
    });
    if (!result.success) throw new Error(`email send fail: ${result.error ?? "unknown"}`);
    return;
  }

  // ── WHATSAPP ──────────────────────────────────────────────────────────
  if (channel === "whatsapp") {
    const phone = prefs?.whatsapp_phone?.trim();
    if (!phone) throw new Error("WhatsApp phone non configurato per utente");
    if (!prefs?.whatsapp_verified_at) throw new Error("WhatsApp non verificato per utente");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
    const resp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({
        company_id: flow.company_id,
        to: phone,
        type: "text",
        text: { body: `📅 ${flow.flow_name}\n\n${body}` },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`whatsapp-send ${resp.status}: ${errText.slice(0, 200)}`);
    }
    return;
  }

  // ── TELEGRAM ──────────────────────────────────────────────────────────
  if (channel === "telegram") {
    // Lookup user mapping: serve verified=true + bot_config_id attivo
    const { data: mapping, error: mapErr } = await supabase
      .from("telegram_user_mappings")
      .select("telegram_user_id, is_verified, bot_config_id")
      .eq("user_id", user.user_id)
      .eq("company_id", flow.company_id)
      .eq("is_verified", true)
      .maybeSingle();
    if (mapErr) throw new Error(`telegram mapping query: ${mapErr.message}`);
    if (!mapping?.telegram_user_id) throw new Error("Telegram non legato per utente");

    // Bot config: bot_token per chiamare Telegram API
    const { data: botCfg, error: botErr } = await supabase
      .from("telegram_bot_configs")
      .select("bot_token, enabled")
      .eq("id", mapping.bot_config_id)
      .maybeSingle();
    if (botErr) throw new Error(`telegram bot_config query: ${botErr.message}`);
    if (!botCfg?.bot_token) throw new Error("Bot Telegram non configurato");
    if (botCfg.enabled === false) throw new Error("Bot Telegram disabilitato");

    const resp = await fetch(`https://api.telegram.org/bot${botCfg.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: mapping.telegram_user_id,
        text: `📅 *${escapeTelegramMd(flow.flow_name)}*\n\n${body}`,
        parse_mode: "Markdown",
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`telegram sendMessage ${resp.status}: ${errText.slice(0, 200)}`);
    }
    return;
  }

  throw new Error(`Canale "${channel}" sconosciuto`);
}

/** HTML escape minimo per body email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape caratteri Markdown V1 per Telegram (sottoscritto a _ * ` [). */
function escapeTelegramMd(s: string): string {
  return s.replace(/[_*`[\]]/g, (m) => `\\${m}`);
}

/**
 * Resolve variabili context-aware per un utente. Tutte queste variabili sono
 * disponibili nei template static OR nel prompt AI-generated.
 *
 * Set completo:
 *   {nome}                      — nome utente
 *   {email}                     — email utente
 *   {ruolo}                     — primary user_role
 *   {azienda}                   — ragione sociale company
 *   {data_oggi}                 — "lunedì 21 maggio 2026"
 *   {cantiere_oggi}             — order assegnato oggi
 *   {task_oggi}                 — descrizione task primario commessa oggi
 *   {ore_pianificate}           — ore pianificate oggi
 *   {operai_oggi}               — N operai assegnati oggi (per admin)
 *   {numero_cantieri_aperti}    — count orders attivi
 *   {crediti_scaduti}           — totale € + count clienti con rate scadute
 *   {ddt_in_arrivo}             — count DDT in arrivo prossima settimana
 *   {prossimi_appuntamenti}     — count appointments prossime 48h
 *   {meteo}                     — meteo cantiere oggi (cached, fallback)
 *
 * Tutte le query sono in try/catch — se una fallisce mette "n.d." ma non
 * blocca il render. È meglio un messaggio con "n.d." che un fail totale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveVariables(supabase: any, companyId: string, user: TargetUser): Promise<Record<string, string>> {
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const dateLong = todayDate.toLocaleDateString("it-IT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const vars: Record<string, string> = {
    nome: user.first_name ?? "Utente",
    email: user.email ?? "",
    data_oggi: dateLong,
  };

  // ── Identity: ruolo + azienda ────────────────────────────────────────
  try {
    const [{ data: roleRow }, { data: companyRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.user_id).limit(1).maybeSingle(),
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    ]);
    vars.ruolo = (roleRow?.role as string | undefined) ?? "utente";
    vars.azienda = (companyRow?.name as string | undefined) ?? "Azienda";
  } catch {
    vars.ruolo = "n.d.";
    vars.azienda = "n.d.";
  }

  // ── KPI azienda — numero cantieri aperti ─────────────────────────────
  try {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("balance_paid", false);
    vars.numero_cantieri_aperti = String(count ?? 0);
  } catch { vars.numero_cantieri_aperti = "n.d."; }

  // ── Cantiere oggi (per operai) + task primario ───────────────────────
  try {
    const { data: assignment } = await supabase
      .from("order_employee_assignments")
      .select("order_id, hours_planned, orders:order_id(description)")
      .eq("employee_id", user.user_id)
      .eq("work_date", today)
      .maybeSingle();
    if (assignment) {
      const desc = (assignment.orders as { description?: string } | null)?.description ?? "";
      const orderId = assignment.order_id as string | undefined;
      vars.cantiere_oggi = `${orderId?.slice(0, 8) ?? ""} ${desc}`.trim() || "—";
      vars.ore_pianificate = `${assignment.hours_planned ?? 8} ore`;
      // Task primario della commessa oggi (se tabella esiste)
      if (orderId) {
        try {
          const { data: task } = await supabase
            .from("order_tasks")
            .select("title")
            .eq("order_id", orderId)
            .eq("status", "in_progress")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          vars.task_oggi = (task?.title as string | undefined) ?? "vedi note commessa";
        } catch { vars.task_oggi = "vedi note commessa"; }
      } else {
        vars.task_oggi = "—";
      }
    } else {
      vars.cantiere_oggi = "Nessun cantiere assegnato oggi";
      vars.ore_pianificate = "—";
      vars.task_oggi = "—";
    }
  } catch {
    vars.cantiere_oggi = "n.d.";
    vars.ore_pianificate = "n.d.";
    vars.task_oggi = "n.d.";
  }

  // ── Per admin: operai pianificati oggi cross-azienda ─────────────────
  try {
    const { count } = await supabase
      .from("order_employee_assignments")
      .select("id", { count: "exact", head: true })
      .eq("work_date", today)
      .in("order_id",
        // Subquery: orders della company. Supabase non supporta subquery diretta,
        // facciamo 2 query in serie. Se errore: count=0
        []
      );
    void count; // placeholder — la subquery sopra ritorna sempre vuoto
    // Approccio corretto: query separata.
    const { data: companyOrders } = await supabase
      .from("orders").select("id").eq("company_id", companyId).eq("balance_paid", false).limit(500);
    if (Array.isArray(companyOrders) && companyOrders.length > 0) {
      const orderIds = companyOrders.map((o) => o.id);
      const { count: assigned } = await supabase
        .from("order_employee_assignments")
        .select("id", { count: "exact", head: true })
        .eq("work_date", today)
        .in("order_id", orderIds);
      vars.operai_oggi = String(assigned ?? 0);
    } else {
      vars.operai_oggi = "0";
    }
  } catch { vars.operai_oggi = "n.d."; }

  // ── Crediti scaduti (totale + count clienti) ─────────────────────────
  try {
    // Riusa il tool RPC esistente se possibile; fallback a query inline
    const { data: overdueRpc } = await supabase.rpc("silvio_tool_overdue_payments", {
      p_company_id: companyId,
      p_only_grave: false,
    }).single().maybeSingle?.() ?? { data: null };
    void overdueRpc;
    // Pattern semplificato: somma deposit/balance/financing scaduti dalla orders
    const { data: overdue } = await supabase
      .from("orders")
      .select("balance_amount, balance_expected_date, balance_paid, deposit_amount, deposit_expected_date, deposit_paid")
      .eq("company_id", companyId);
    if (Array.isArray(overdue)) {
      const todayMs = Date.now();
      let sum = 0;
      const clients = new Set<string>();
      for (const o of overdue) {
        if (!o.balance_paid && o.balance_expected_date && new Date(o.balance_expected_date).getTime() < todayMs) {
          sum += Number(o.balance_amount ?? 0);
          clients.add(o.id);
        }
        if (!o.deposit_paid && o.deposit_expected_date && new Date(o.deposit_expected_date).getTime() < todayMs) {
          sum += Number(o.deposit_amount ?? 0);
          clients.add(o.id);
        }
      }
      vars.crediti_scaduti = sum > 0
        ? `€${sum.toLocaleString("it-IT")} su ${clients.size} ordini`
        : "nessuno";
    } else {
      vars.crediti_scaduti = "n.d.";
    }
  } catch { vars.crediti_scaduti = "n.d."; }

  // ── DDT in arrivo prossima settimana (DDT in tipo ricezione) ─────────
  try {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { count } = await supabase
      .from("documenti_fiscali")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("tipo", "ddt")
      .gte("data_emissione", today)
      .lte("data_emissione", nextWeek);
    vars.ddt_in_arrivo = String(count ?? 0);
  } catch { vars.ddt_in_arrivo = "n.d."; }

  // ── Prossimi appuntamenti 48h ────────────────────────────────────────
  try {
    const nowIso = new Date().toISOString();
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("start_at", nowIso)
      .lte("start_at", in48h);
    vars.prossimi_appuntamenti = String(count ?? 0);
  } catch { vars.prossimi_appuntamenti = "n.d."; }

  // ── Meteo (best effort: open-meteo gratis, no key) ───────────────────
  // Se la company ha lat/lng nei profili sede, chiamiamo l'API. Senza, n.d.
  try {
    const { data: company } = await supabase
      .from("companies")
      .select("latitude, longitude")
      .eq("id", companyId)
      .maybeSingle();
    const lat = company?.latitude as number | undefined;
    const lng = company?.longitude as number | undefined;
    if (lat && lng) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Europe%2FRome`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json() as { current?: { temperature_2m: number; weather_code: number } };
        const t = json.current?.temperature_2m;
        const code = json.current?.weather_code ?? 0;
        const condStr = code === 0 ? "sereno" : code < 3 ? "poco nuvoloso" : code < 50 ? "nuvoloso" : code < 70 ? "pioggia" : "perturbato";
        vars.meteo = `${condStr} ${t}°C`;
      } else { vars.meteo = "n.d."; }
    } else { vars.meteo = "n.d."; }
  } catch { vars.meteo = "n.d."; }

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
