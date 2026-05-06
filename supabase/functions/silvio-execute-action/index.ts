/**
 * Edge Function: silvio-execute-action
 *
 * Esegue una proposta di azione (ai_action_proposals) dopo conferma utente.
 *
 * Flow:
 *   1. Auth → user_id, company_id
 *   2. Body: { proposal_id }
 *   3. Carica la proposta, verifica scope + status='pending'
 *   4. Dispatcher: invoca handler giusto per action_type
 *   5. Aggiorna proposal status = applied/failed con result
 *   6. Posta messaggio Silvio nella chat con esito
 *   7. Se l'azione era legata a un alert (source) → resolve alert
 *
 * Action types supportati:
 *   - send_overdue_reminder: email sollecito al cliente
 *   - send_quote_followup: follow-up preventivo
 *   - mark_payment_received: segna rata pagata (con audit)
 *   - create_purchase_order: bozza ordine fornitore
 *   - generic_email: invio email custom
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { SILVIO_TOOLS, type Channel, type ToolContext } from "../_shared/silvioTools.ts";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";

interface Payload {
  proposal_id: string;
  /** Override payload (es. utente ha modificato il testo email) */
  override_payload?: Record<string, unknown>;
  /** Conferma forte richiesta per azioni ad alto rischio. */
  confirmation_text?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

interface ExecutionResult {
  ok: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
}

const ACTION_POLICIES: Record<string, {
  allowedRoles: string[];
  requiresStrongConfirmation?: boolean;
}> = {
  send_overdue_reminder: {
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },
  send_quote_followup: {
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  },
  mark_payment_received: {
    allowedRoles: ["super_admin", "company_admin"],
    requiresStrongConfirmation: true,
  },
  create_purchase_order: {
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },
  generic_email: {
    allowedRoles: ["super_admin", "company_admin"],
    requiresStrongConfirmation: true,
  },
};

interface ActionPermission {
  source: "default" | "company_override" | "fallback";
  riskLevel: "green" | "yellow" | "red";
  mode: "disabled" | "propose" | "require_confirmation" | "require_strong_confirmation" | "auto_execute";
  allowedRoles: string[];
  requiresCompanyAdmin: boolean;
  requiresStrongConfirmation: boolean;
  maxDailyExecutions: number | null;
  dailyExecutions: number;
  dailyLimitReached: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    const supabaseAdmin: SupabaseAdmin = auth.supabaseAdmin;

    const body = (await req.json()) as Payload;
    if (!body.proposal_id) return errorResponse("proposal_id mancante", 400, corsHeaders);

    // Carica proposal
    const { data: proposalRow, error: pErr } = await supabaseAdmin
      .from("ai_action_proposals")
      .select("*")
      .eq("id", body.proposal_id)
      .maybeSingle();

    if (pErr || !proposalRow) return errorResponse("Proposta non trovata", 404, corsHeaders);
    const proposal = proposalRow;
    if (proposal.user_id !== userId) return errorResponse("Proposta non autorizzata", 403, corsHeaders);
    if (!proposal.company_id) return errorResponse("Proposta senza scope azienda", 400, corsHeaders);

    const registryTool = SILVIO_TOOLS[proposal.action_type];
    const policy = ACTION_POLICIES[proposal.action_type] ?? actionPolicyFromRegistryTool(registryTool);
    if (!policy) return errorResponse(`Action type non consentito: ${proposal.action_type}`, 400, corsHeaders);

    const permission = await loadActionPermission(supabaseAdmin, proposal.company_id, proposal.action_type, policy);
    if (permission.mode === "disabled") {
      return errorResponse("Azione AI disabilitata per questa azienda dal pannello permessi.", 403, corsHeaders);
    }
    if (permission.mode === "propose") {
      return errorResponse("Questa azienda consente all'AI solo di proporre questa azione, non di eseguirla.", 403, corsHeaders);
    }
    if (permission.dailyLimitReached) {
      return errorResponse(
        `Limite giornaliero raggiunto per ${proposal.action_type} (${permission.dailyExecutions}/${permission.maxDailyExecutions}).`,
        429,
        corsHeaders,
      );
    }

    const effectiveAllowedRoles = permission.requiresCompanyAdmin
      ? Array.from(new Set([
        ...permission.allowedRoles.filter((role) => ["super_admin", "company_admin"].includes(role)),
        "super_admin",
        "company_admin",
      ]))
      : permission.allowedRoles;

    const access = await requireCompanyAccess(supabaseAdmin, userId, proposal.company_id, corsHeaders, {
      allowedRoles: effectiveAllowedRoles,
    });
    const primaryRole = pickPrimaryRole(access.roles);

    const requiresStrongConfirmation =
      proposal.risk_level === "red" ||
      permission.riskLevel === "red" ||
      policy.requiresStrongConfirmation ||
      permission.requiresStrongConfirmation;

    if (requiresStrongConfirmation) {
      const expected = `CONFERMO ${proposal.action_type}`;
      if ((body.confirmation_text ?? "").trim() !== expected) {
        return errorResponse(`Conferma forte richiesta. Scrivi esattamente: ${expected}`, 400, corsHeaders);
      }
    }

    if (proposal.status !== "pending") {
      return errorResponse(`Proposta già ${proposal.status}`, 400, corsHeaders);
    }
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      await supabaseAdmin.from("ai_action_proposals")
        .update({ status: "expired" }).eq("id", proposal.id);
      return errorResponse("Proposta scaduta", 400, corsHeaders);
    }

    let finalPayload: Record<string, unknown>;
    try {
      finalPayload = buildFinalPayload(
        proposal.action_type,
        normalizeProposalPayload(proposal.action_type, proposal.payload ?? {}),
        body.override_payload ?? null,
      );
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : String(e), 400, corsHeaders);
    }

    const { data: claimedProposal, error: claimErr } = await supabaseAdmin
      .from("ai_action_proposals")
      .update({
        status: "confirmed",
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", proposal.id)
      .eq("company_id", proposal.company_id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (claimErr) {
      return errorResponse(`Errore lock proposta: ${claimErr.message}`, 500, corsHeaders);
    }
    if (!claimedProposal) {
      return errorResponse("Proposta già presa in carico o non più eseguibile. Aggiorna la chat.", 409, corsHeaders);
    }
    Object.assign(proposal, claimedProposal);

    const ctx = {
      supabase: supabaseAdmin,
      userId,
      companyId: proposal.company_id,
      proposal,
      primaryRole,
    };

    // Dispatch
    let result: ExecutionResult;
    try {
      result = await dispatchAction(proposal.action_type, finalPayload, ctx);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    // Aggiorna proposal
    await supabaseAdmin.from("ai_action_proposals").update({
      status: result.ok ? "applied" : "failed",
      applied_result: result.details ?? { message: result.message },
      applied_at: new Date().toISOString(),
      resolved_by: userId,
    }).eq("id", proposal.id).eq("company_id", proposal.company_id);

    await recordDecisionLogForAction(supabaseAdmin, proposal.id, result.ok, {
      ok: result.ok,
      message: result.message,
      details: result.details ?? null,
      permission: {
        source: permission.source,
        mode: permission.mode,
        risk_level: permission.riskLevel,
      },
    }, body.override_payload ?? {});

    // Resolve alert correlato SOLO se l'azione è andata a buon fine
    if (result.ok) {
      const alertId = (proposal.payload as { alert_id?: string })?.alert_id;
      if (alertId) {
        await supabaseAdmin.from("silvio_alerts").update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        }).eq("id", alertId).eq("company_id", proposal.company_id);
      }
    }

    // Notifica nella chat Silvio
    await postToSilvioChat(supabaseAdmin, userId, proposal.company_id,
      result.ok
        ? `✅ **Azione applicata**: ${proposal.summary}\n\n${result.message}`
        : `❌ **Azione fallita**: ${proposal.summary}\n\nErrore: ${result.message}`,
    );

    return jsonResponse({
      ok: result.ok,
      message: result.message,
      details: result.details,
      proposal_id: proposal.id,
      permission: {
        source: permission.source,
        mode: permission.mode,
        risk_level: permission.riskLevel,
      },
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-execute-action] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

async function loadActionPermission(
  supabase: SupabaseAdmin,
  companyId: string,
  actionType: string,
  fallbackPolicy: { allowedRoles: string[]; requiresStrongConfirmation?: boolean },
): Promise<ActionPermission> {
  const fallback: ActionPermission = {
    source: "fallback",
    riskLevel: fallbackPolicy.requiresStrongConfirmation ? "red" : "yellow",
    mode: fallbackPolicy.requiresStrongConfirmation ? "require_strong_confirmation" : "require_confirmation",
    allowedRoles: fallbackPolicy.allowedRoles,
    requiresCompanyAdmin: fallbackPolicy.requiresStrongConfirmation ?? false,
    requiresStrongConfirmation: fallbackPolicy.requiresStrongConfirmation ?? false,
    maxDailyExecutions: null,
    dailyExecutions: 0,
    dailyLimitReached: false,
  };

  const { data, error } = await supabase.rpc("get_ai_action_permission", {
    p_company_id: companyId,
    p_action_type: actionType,
  });

  if (error || !data || typeof data !== "object") {
    console.warn("[silvio-execute-action] get_ai_action_permission fallback:", error?.message ?? "no data");
    return fallback;
  }

  const raw = data as Record<string, unknown>;
  const allowedRoles = Array.isArray(raw.allowed_roles)
    ? raw.allowed_roles.filter((role): role is string => typeof role === "string")
    : fallbackPolicy.allowedRoles;

  return {
    source: raw.source === "company_override" ? "company_override" : "default",
    riskLevel: raw.risk_level === "green" || raw.risk_level === "red" ? raw.risk_level : "yellow",
    mode: isActionPermissionMode(raw.mode) ? raw.mode : fallback.mode,
    allowedRoles: allowedRoles.length ? allowedRoles : fallbackPolicy.allowedRoles,
    requiresCompanyAdmin: Boolean(raw.requires_company_admin),
    requiresStrongConfirmation: Boolean(raw.requires_strong_confirmation),
    maxDailyExecutions: typeof raw.max_daily_executions === "number" ? raw.max_daily_executions : null,
    dailyExecutions: typeof raw.daily_executions === "number" ? raw.daily_executions : 0,
    dailyLimitReached: Boolean(raw.daily_limit_reached),
  };
}

function isActionPermissionMode(value: unknown): value is ActionPermission["mode"] {
  return value === "disabled" ||
    value === "propose" ||
    value === "require_confirmation" ||
    value === "require_strong_confirmation" ||
    value === "auto_execute";
}

async function recordDecisionLogForAction(
  supabase: SupabaseAdmin,
  proposalId: string,
  succeeded: boolean,
  executionResult: Record<string, unknown>,
  userModifications: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("silvio_decision_log_decide_by_action", {
    p_action_proposal_id: proposalId,
    p_chosen_option_id: succeeded ? "approved_and_executed" : "approved_execution_failed",
    p_user_modifications: userModifications,
    p_user_rationale: typeof executionResult.message === "string" ? executionResult.message : null,
    p_execution_result: executionResult,
    // In questa Edge Function l'utente ha già autorizzato un tentativo reale:
    // se il provider/API fallisce, il decision log deve comunque chiudere
    // l'azione come tentata, non lasciarla in "decided_pending_exec".
    p_executed: true,
  });

  if (error) {
    // Best-effort audit bridge: execution remains source-of-truth in ai_action_proposals.
    console.warn("[silvio-execute-action] decision log bridge failed:", error.message);
  }
}

function buildFinalPayload(
  actionType: string,
  basePayload: Record<string, unknown>,
  overridePayload: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!overridePayload) return basePayload;

  const lockedFieldsByAction: Record<string, string[]> = {
    send_overdue_reminder: ["order_id", "client_email", "client_name"],
    send_quote_followup: ["quote_id", "client_email", "client_name"],
    mark_payment_received: ["order_id", "rata_type"],
    create_purchase_order: ["stock_id"],
    create_invoice_draft: ["order_id", "rata_type"],
    generic_email: ["to"],
  };

  const lockedFields = lockedFieldsByAction[actionType] ?? [];
  for (const field of lockedFields) {
    if (
      Object.prototype.hasOwnProperty.call(overridePayload, field) &&
      basePayload[field] != null &&
      overridePayload[field] !== basePayload[field]
    ) {
      throw new Error(`Campo protetto non modificabile in esecuzione: ${field}`);
    }
  }

  return { ...basePayload, ...overridePayload };
}

// ═══ DISPATCHER ════════════════════════════════════════════════════════════

async function dispatchAction(
  actionType: string,
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown>; primaryRole: string },
): Promise<ExecutionResult> {
  switch (actionType) {
    case "send_overdue_reminder":
      return await sendOverdueReminder(payload, ctx);
    case "send_quote_followup":
      return await sendQuoteFollowup(payload, ctx);
    case "mark_payment_received":
      return await markPaymentReceived(payload, ctx);
    case "create_purchase_order":
      return await createPurchaseOrderDraft(payload, ctx);
    case "generic_email":
      return await sendGenericEmail(payload, ctx);
    default:
      if (SILVIO_TOOLS[actionType]) {
        return await executeRegisteredSilvioTool(actionType, payload, ctx);
      }
      return { ok: false, message: `Action type sconosciuto: ${actionType}` };
  }
}

function actionPolicyFromRegistryTool(tool: (typeof SILVIO_TOOLS)[string] | undefined): {
  allowedRoles: string[];
  requiresStrongConfirmation?: boolean;
} | null {
  if (!tool) return null;
  const allowedRoles = (tool.allowedRoles ?? ["super_admin"])
    .filter((role) => role !== "*");
  return {
    allowedRoles: allowedRoles.length > 0 ? allowedRoles : ["super_admin"],
    requiresStrongConfirmation: tool.riskLevel === "red",
  };
}

function pickPrimaryRole(roles: string[]): string {
  const priority = ["super_admin", "company_admin", "salesperson", "call_center", "company_staff", "employee", "subcontractor", "worker"];
  return priority.find((role) => roles.includes(role)) ?? roles[0] ?? "company_staff";
}

function normalizeProposalPayload(
  actionType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const input = payload.input;
  if (
    payload.tool_name === actionType &&
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    return {
      ...(input as Record<string, unknown>),
      __tool_meta: {
        tool_name: payload.tool_name,
        tool_domain: payload.tool_domain,
        channel: payload.channel,
        session_id: payload.session_id,
        trace_id: payload.trace_id,
      },
    };
  }
  return payload;
}

function extractToolMeta(payload: Record<string, unknown>): {
  cleanPayload: Record<string, unknown>;
  channel: Channel;
  sessionId?: string;
  traceId?: string;
} {
  const { __tool_meta, ...cleanPayload } = payload;
  const meta = (__tool_meta && typeof __tool_meta === "object" && !Array.isArray(__tool_meta))
    ? (__tool_meta as Record<string, unknown>)
    : {};
  const channel = isChannel(meta.channel) ? meta.channel : "internal_chat";
  return {
    cleanPayload,
    channel,
    sessionId: typeof meta.session_id === "string" ? meta.session_id : undefined,
    traceId: typeof meta.trace_id === "string" ? meta.trace_id : undefined,
  };
}

function isChannel(value: unknown): value is Channel {
  return value === "internal_chat" ||
    value === "web_persona" ||
    value === "mobile" ||
    value === "whatsapp" ||
    value === "telegram" ||
    value === "voice" ||
    value === "email" ||
    value === "cron" ||
    value === "api";
}

async function executeRegisteredSilvioTool(
  actionType: string,
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown>; primaryRole: string },
): Promise<ExecutionResult> {
  const tool = SILVIO_TOOLS[actionType];
  if (!tool) return { ok: false, message: `Tool non registrato: ${actionType}` };

  const { cleanPayload, channel, sessionId, traceId } = extractToolMeta(payload);
  const personaKey = typeof ctx.proposal.persona_key === "string" ? ctx.proposal.persona_key : "silvio";

  if (tool.allowedPersonas?.length && !tool.allowedPersonas.includes(personaKey) && !tool.allowedPersonas.includes("*")) {
    return { ok: false, message: `Persona non autorizzata per ${actionType}` };
  }
  if (tool.allowedChannels?.length && !tool.allowedChannels.includes(channel)) {
    return { ok: false, message: `Canale non autorizzato per ${actionType}: ${channel}` };
  }

  const toolCtx: ToolContext = {
    supabase: ctx.supabase,
    companyId: ctx.companyId,
    userId: ctx.userId,
    primaryRole: ctx.primaryRole,
    personaKey,
    channel,
    sessionId,
    traceId,
    preApproved: true,
  };

  try {
    const data = await tool.executor(cleanPayload, toolCtx);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const payload = data as Record<string, unknown>;
      if (
        payload.ok === false ||
        payload.success === false ||
        typeof payload.error === "string"
      ) {
        const message = typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
          ? payload.error
          : `Tool "${actionType}" non completato.`;
        return { ok: false, message, details: data };
      }
    }
    return {
      ok: true,
      message: `Tool "${actionType}" eseguito dopo conferma.`,
      details: data,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ═══ ACTION HANDLERS ═══════════════════════════════════════════════════════

async function sendOverdueReminder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const orderId = payload.order_id as string | undefined;
  const explicitTo = payload.client_email as string | undefined;
  const explicitName = payload.client_name as string | undefined;
  const explicitAmount = payload.amount as number | undefined;
  const rataType = payload.rata_type as string | undefined;
  const customSubject = payload.subject as string | undefined;
  const customBody = payload.body as string | undefined;

  // Carica info ordine se disponibile
  let to: string | null = explicitTo ?? null;
  let clientName: string | null = explicitName ?? null;
  let amount: number | null = explicitAmount ?? null;
  let orderCode: string | null = null;
  let companyName = "Edilizia in Cloud";

  if (orderId) {
    const { data: order } = await ctx.supabase
      .from("orders")
      .select("client_email, client_name, client_company, order_code, total_amount, deposit_amount, balance_amount, deposit_expected_date, balance_expected_date, company_id")
      .eq("id", orderId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (order) {
      to = to ?? order.client_email;
      clientName = clientName ?? order.client_name ?? order.client_company;
      orderCode = order.order_code;
      if (!amount) {
        amount = rataType === "saldo" ? order.balance_amount
               : rataType === "acconto" ? order.deposit_amount
               : null;
      }
    }
  }

  // Fetch company name
  const { data: company } = await ctx.supabase
    .from("companies").select("name").eq("id", ctx.companyId).maybeSingle();
  companyName = company?.name ?? "Edilizia in Cloud";

  if (!to) {
    return { ok: false, message: "Email cliente mancante. Modifica la proposta per aggiungere l'indirizzo." };
  }

  const subject = customSubject ?? `Sollecito di pagamento — ${orderCode ?? "ordine"}`;
  const body = customBody ?? buildOverdueEmailBody(clientName, orderCode, amount, rataType ?? null, companyName);

  // Invia via sendEmailUnified
  try {
    const { sendEmailUnified } = await import("../_shared/sendEmailUnified.ts");
    const result = await sendEmailUnified({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: ctx.supabase as any,
      companyId: ctx.companyId,
      stream: "transactional",
      to,
      subject,
      html: body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (!result.ok) {
      return { ok: false, message: `Invio fallito: ${JSON.stringify(result.body).slice(0, 300)}` };
    }
    return {
      ok: true,
      message: `Email di sollecito inviata a ${clientName ?? to}.`,
      details: { to, subject, sent_at: new Date().toISOString() },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function buildOverdueEmailBody(
  clientName: string | null,
  orderCode: string | null,
  amount: number | null,
  rataType: string | null,
  companyName: string,
): string {
  const greeting = clientName ? `Gentile ${clientName},` : "Gentile Cliente,";
  const importLabel = amount
    ? `€ ${Number(amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
    : "l'importo concordato";
  const rataDisplay = rataType === "saldo" ? "saldo" : rataType === "acconto" ? "acconto" : rataType ?? "rata";
  const orderRef = orderCode ? `relativa all'ordine ${orderCode}` : "relativa al nostro contratto";

  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>${greeting}</p>

<p>Le scriviamo per ricordarle che la rata di <strong>${rataDisplay}</strong> di <strong>${importLabel}</strong>, ${orderRef}, risulta in attesa di pagamento.</p>

<p>Le saremmo grati se potesse procedere al saldo entro i prossimi 7 giorni. Se ha già provveduto, può ignorare questa comunicazione.</p>

<p>Per qualsiasi chiarimento o per concordare modalità di pagamento alternative, restiamo a Sua disposizione.</p>

<p>Cordiali saluti,<br>
<strong>${companyName}</strong></p>

<hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
<p style="color: #888; font-size: 11px;">
Questa email è stata inviata tramite il sistema gestionale di ${companyName}.
</p>
</div>`;
}

async function sendQuoteFollowup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const quoteId = payload.quote_id as string | undefined;
  if (!quoteId) return { ok: false, message: "quote_id mancante" };

  const { data: quote } = await ctx.supabase
    .from("quotes").select("client_name, client_email, quote_number, total, company_id")
    .eq("id", quoteId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (!quote || !quote.client_email) {
    return { ok: false, message: "Cliente o email mancante per il preventivo" };
  }

  const subject = `Aggiornamento preventivo ${quote.quote_number}`;
  const body = `<p>Gentile ${quote.client_name},</p>
<p>Ci risulta che il preventivo <strong>${quote.quote_number}</strong> di € ${Number(quote.total ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} sia ancora in attesa di Sua valutazione.</p>
<p>Resta valido salvo modifiche di mercato. Possiamo organizzare una breve call per chiarire qualsiasi dubbio?</p>
<p>Cordiali saluti.</p>`;

  try {
    const { sendEmailUnified } = await import("../_shared/sendEmailUnified.ts");
    const result = await sendEmailUnified({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: ctx.supabase as any,
      companyId: ctx.companyId,
      stream: "transactional",
      to: quote.client_email,
      subject,
      html: body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (!result.ok) return { ok: false, message: JSON.stringify(result.body).slice(0, 300) };
    return { ok: true, message: `Follow-up preventivo inviato a ${quote.client_name}.`, details: { to: quote.client_email, subject } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function markPaymentReceived(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const orderId = payload.order_id as string | undefined;
  const rataType = payload.rata_type as string | undefined;
  if (!orderId || !rataType) return { ok: false, message: "order_id e rata_type obbligatori" };

  const colMap: Record<string, { paid: string; date: string }> = {
    acconto: { paid: "deposit_paid", date: "deposit_paid_date" },
    acconto_2: { paid: "deposit_2_paid", date: "deposit_2_paid_date" },
    saldo: { paid: "balance_paid", date: "balance_paid_date" },
    finanziamento: { paid: "financing_paid", date: "financing_paid_date" },
  };
  const cols = colMap[rataType];
  if (!cols) return { ok: false, message: `rata_type non valido: ${rataType}` };

  // Verifica ordine appartiene alla company
  const { data: order } = await ctx.supabase
    .from("orders").select("id, company_id, order_code").eq("id", orderId).eq("company_id", ctx.companyId).maybeSingle();
  if (!order) return { ok: false, message: "Ordine non trovato" };
  if (order.company_id !== ctx.companyId) return { ok: false, message: "Ordine non autorizzato" };

  // Aggiorna pagamento
  const updateObj: Record<string, unknown> = {};
  updateObj[cols.paid] = true;
  updateObj[cols.date] = new Date().toISOString();

  const { error: updateErr } = await ctx.supabase.from("orders").update(updateObj).eq("id", orderId).eq("company_id", ctx.companyId);
  if (updateErr) return { ok: false, message: `DB error: ${updateErr.message}` };

  return {
    ok: true,
    message: `Rata "${rataType}" segnata come pagata su ${order.order_code}.`,
    details: { order_code: order.order_code, rata_type: rataType, marked_at: new Date().toISOString() },
  };
}

async function createPurchaseOrderDraft(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const stockId = payload.stock_id as string | undefined;
  const reorderQty = payload.reorder_qty as number | undefined;
  const supplierId = payload.supplier_id as string | undefined;

  if (!stockId) return { ok: false, message: "stock_id mancante" };

  // Carica info stock
  const { data: stock } = await ctx.supabase
    .from("warehouse_stock").select("name, internal_code, unit_cost, reorder_quantity, supplier_id, company_id")
    .eq("id", stockId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!stock) return { ok: false, message: "Articolo magazzino non trovato" };

  const finalSupplierId = supplierId ?? stock.supplier_id;
  const finalQty = reorderQty ?? stock.reorder_quantity ?? 1;

  // Verifica fornitore
  if (!finalSupplierId) {
    return { ok: false, message: "Nessun fornitore associato. Specificalo manualmente in payload.supplier_id." };
  }

  const { data: supplier } = await ctx.supabase
    .from("suppliers")
    .select("id")
    .eq("id", finalSupplierId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (!supplier) {
    return { ok: false, message: "Fornitore non trovato o non autorizzato per questa azienda." };
  }

  // Crea purchase_order draft (assume schema purchase_orders/items esistente)
  try {
    const { data: po, error: poErr } = await ctx.supabase
      .from("purchase_orders")
      .insert({
        company_id: ctx.companyId,
        supplier_id: finalSupplierId,
        status: "draft",
        notes: `Bozza generata da Silvio (riordino automatico ${stock.name})`,
        created_by: ctx.userId,
      })
      .select().single();

    if (poErr) return { ok: false, message: `Creazione PO fallita: ${poErr.message}` };

    // Aggiungi item
    const { error: itemErr } = await ctx.supabase
      .from("purchase_order_items")
      .insert({
        purchase_order_id: po.id,
        warehouse_stock_id: stockId,
        description: stock.name,
        quantity: finalQty,
        unit_cost: stock.unit_cost,
      });

    if (itemErr) {
      // best-effort, non rolling back per ora
      console.warn("[silvio] PO item insert failed:", itemErr.message);
    }

    return {
      ok: true,
      message: `Bozza ordine fornitore creata per ${stock.name} (qty: ${finalQty}). Apri purchase_orders per inviarla.`,
      details: { purchase_order_id: po.id, stock: stock.name, qty: finalQty },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function sendGenericEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const to = payload.to as string | undefined;
  const subject = payload.subject as string | undefined;
  const body = payload.body as string | undefined;
  if (!to || !subject || !body) return { ok: false, message: "to, subject, body obbligatori" };

  try {
    const { sendEmailUnified } = await import("../_shared/sendEmailUnified.ts");
    const result = await sendEmailUnified({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: ctx.supabase as any,
      companyId: ctx.companyId,
      stream: "transactional",
      to,
      subject,
      html: body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (!result.ok) return { ok: false, message: JSON.stringify(result.body).slice(0, 300) };
    return { ok: true, message: `Email inviata a ${to}.`, details: { to, subject } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ═══ HELPERS ═══════════════════════════════════════════════════════════════

async function postToSilvioChat(
  supabase: SupabaseAdmin,
  userId: string,
  companyId: string,
  message: string,
) {
  const { data: channelId } = await supabase.rpc("ensure_user_silvio_channel", { p_user_id: userId });
  if (channelId) {
    await supabase.from("internal_chat_messages").insert({
      channel_id: channelId,
      sender_id: SILVIO_SENDER_ID,
      company_id: companyId,
      content: message,
      message_type: "text",
    });
  }
}
