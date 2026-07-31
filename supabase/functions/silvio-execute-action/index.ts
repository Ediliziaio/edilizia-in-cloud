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
 *   - update_purchase_order_delay: aggiorna data prevista ODA da email fornitore
 *   - create_logistics_task: task operativo da email fornitore/DDT
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

// Italian → canonical action_type aliases.
// I primi seed/proposal Silvio usano nomi italiani; mappiamo a quelli canonici
// per non rompere proposal storiche (es. "preventivo_bozza" → "create_quote_draft").
const ACTION_TYPE_ALIASES: Record<string, string> = {
  preventivo_bozza: "create_quote_draft",
  bozza_preventivo: "create_quote_draft",
  sollecito_pagamento: "send_overdue_reminder",
  email_recupero_crediti: "send_overdue_reminder",
  follow_up_preventivo: "send_quote_followup",
  followup_preventivo: "send_quote_followup",
  riordino_materiale: "create_purchase_order",
  ordine_fornitore: "create_purchase_order",
  bozza_fattura: "create_invoice_draft",
  fattura_bozza: "create_invoice_draft",
};

function canonicalActionType(actionType: string): string {
  return ACTION_TYPE_ALIASES[actionType] ?? actionType;
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
  update_purchase_order_delay: {
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },
  create_logistics_task: {
    allowedRoles: ["super_admin", "company_admin", "company_staff"],
  },
  create_quote_draft: {
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  },
  create_invoice_draft: {
    allowedRoles: ["super_admin", "company_admin"],
  },
  generic_email: {
    allowedRoles: ["super_admin", "company_admin"],
    requiresStrongConfirmation: true,
  },
  // Chiamata vocale AI a un lead caldo: esegue tramite initiate-outbound-call
  // (DND, orari, abbonamento, crediti e billing restano lì, un solo flusso).
  make_voice_call_lead: {
    allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
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

// Feature #1B — Service-role auto-execute bypass.
// La worker `ai-auto-execute-pending` chiama questa funzione con:
//   - Authorization: Bearer <SERVICE_ROLE_KEY>
//   - x-internal-auto-execute: <env INTERNAL_AUTO_EXECUTE_SECRET>
// Se ENTRAMBE corrispondono, salta requireAuth e usa proposal.user_id
// come actor. La policy del DB (loadActionPermission) viene comunque
// applicata in modo strict: viene rifiutato qualsiasi mode != 'auto_execute'.
// Senza policy auto_execute, anche un caller service-role NON può
// eseguire l'azione bypassando la conferma utente.
function isInternalAutoExecuteCall(req: Request): boolean {
  const internalSecret = Deno.env.get("INTERNAL_AUTO_EXECUTE_SECRET");
  if (!internalSecret) return false; // env non configurato → feature disabilitata
  const callerSecret = req.headers.get("x-internal-auto-execute");
  if (callerSecret !== internalSecret) return false;
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_";
  return authHeader === `Bearer ${serviceRoleKey}`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const autoExecuteBypass = isInternalAutoExecuteCall(req);
    let userId: string;
    let supabaseAdmin: SupabaseAdmin;

    if (autoExecuteBypass) {
      // Per il bypass usiamo il client service-role direttamente.
      // L'userId verrà impostato dal proposal.user_id dopo il caricamento.
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.43.4");
      supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      ) as SupabaseAdmin;
      userId = ""; // placeholder, riempito dopo aver caricato la proposal
    } else {
      const auth = await requireAuth(req, corsHeaders);
      userId = auth.userId;
      supabaseAdmin = auth.supabaseAdmin;
    }

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
    // Per auto-execute bypass: il caller è il worker service-role, l'actor
    // effettivo è il proprietario della proposta (creata da ai-proactive-proposals-daily).
    if (autoExecuteBypass) {
      userId = proposal.user_id;
    }
    if (proposal.user_id !== userId) return errorResponse("Proposta non autorizzata", 403, corsHeaders);
    if (!proposal.company_id) return errorResponse("Proposta senza scope azienda", 400, corsHeaders);

    const canonicalType = canonicalActionType(proposal.action_type);
    const registryTool = SILVIO_TOOLS[canonicalType] ?? SILVIO_TOOLS[proposal.action_type];
    const policy = ACTION_POLICIES[canonicalType] ?? ACTION_POLICIES[proposal.action_type] ?? actionPolicyFromRegistryTool(registryTool);
    if (!policy) return errorResponse(`Action type non consentito: ${proposal.action_type}`, 400, corsHeaders);

    // Permission lookup sul canonical type: ai_default_action_policy ha CASE
    // hardcoded sui nomi canonici (es. 'create_quote_draft'). Se passassimo
    // 'preventivo_bozza' (alias) cadrebbe nell'ELSE → mode='propose' → blocco.
    const permission = await loadActionPermission(supabaseAdmin, proposal.company_id, canonicalType, policy);
    if (permission.mode === "disabled") {
      return errorResponse("Azione AI disabilitata per questa azienda dal pannello permessi.", 403, corsHeaders);
    }
    if (permission.mode === "propose") {
      return errorResponse("Questa azienda consente all'AI solo di proporre questa azione, non di eseguirla.", 403, corsHeaders);
    }
    if (permission.dailyLimitReached) {
      return errorResponse(
        `Limite giornaliero raggiunto per ${canonicalType} (${permission.dailyExecutions}/${permission.maxDailyExecutions}).`,
        429,
        corsHeaders,
      );
    }
    // Auto-execute bypass: la policy DEVE essere 'auto_execute', altrimenti rifiuta.
    // Difesa-in-profondità: anche se il caller manipola gli header, la policy DB è
    // l'unica fonte di verità — se l'admin azienda non l'ha messa in auto_execute,
    // il sistema NON esegue automaticamente.
    if (autoExecuteBypass && permission.mode !== "auto_execute") {
      return errorResponse(
        `Auto-execute richiesto ma policy company per ${canonicalType} è '${permission.mode}', non 'auto_execute'.`,
        403,
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

    // Per auto-execute: skip requireCompanyAccess (l'access è autorizzato dalla policy
    // DB stessa che è settata solo da super_admin/company_admin). Usiamo "system" come
    // primary role per il decision log → tracciabile come "executed_by=ai".
    let primaryRole: string;
    if (autoExecuteBypass) {
      primaryRole = "ai_auto_execute";
    } else {
      const access = await requireCompanyAccess(supabaseAdmin, userId, proposal.company_id, corsHeaders, {
        allowedRoles: effectiveAllowedRoles,
      });
      primaryRole = pickPrimaryRole(access.roles);
    }

    const requiresStrongConfirmation =
      proposal.risk_level === "red" ||
      permission.riskLevel === "red" ||
      policy.requiresStrongConfirmation ||
      permission.requiresStrongConfirmation;

    // Auto-execute bypass: la conferma "forte" salta SOLO se il super_admin ha
    // esplicitamente attivato mode=auto_execute per quell'azione (la RLS DB
    // permette di settare mode=auto_execute su red SOLO al super_admin). Se la
    // policy non è auto_execute (caso utente normale), la conferma forte resta
    // come barriera anti-misclick come da design originale.
    if (requiresStrongConfirmation && !autoExecuteBypass) {
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
        canonicalType,
        normalizeProposalPayload(canonicalType, proposal.payload ?? {}),
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

    // Dispatch (uso il canonical type per il dispatcher → handlers backward-compat)
    let result: ExecutionResult;
    try {
      result = await dispatchAction(canonicalType, finalPayload, ctx);
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
    update_purchase_order_delay: ["purchase_order_id", "purchase_order_number"],
    create_logistics_task: ["source_thread_id", "source_email_id"],
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
    case "update_purchase_order_delay":
      return await updatePurchaseOrderDelay(payload, ctx);
    case "create_logistics_task":
      return await createLogisticsTask(payload, ctx);
    case "generic_email":
      return await sendGenericEmail(payload, ctx);
    case "create_quote_draft":
      return await createQuoteDraft(payload, ctx);
    case "create_invoice_draft":
      return await createInvoiceDraft(payload, ctx);
    case "make_voice_call_lead":
      return await makeVoiceCallLead(payload, ctx);
    default:
      if (SILVIO_TOOLS[actionType]) {
        return await executeRegisteredSilvioTool(actionType, payload, ctx);
      }
      return { ok: false, message: `Action type sconosciuto: ${actionType}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler make_voice_call_lead — la proposta "chiamo il lead caldo?" approvata
// (o in auto_execute) diventa una chiamata VERA tramite initiate-outbound-call:
// niente flusso parallelo, DND/orari/abbonamento/crediti/billing restano tutti
// nell'unico punto che già li gestisce. L'agente è quello configurato
// dall'azienda (payload.agent_id dal worker, altrimenti il primo agente vocale
// attivo collegato a ElevenLabs). Le dynamic variables combaciano col template
// "Richiamo lead entro 5 minuti" ({{azienda}}, {{nome}}, {{lavoro}}).
async function makeVoiceCallLead(
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown>; primaryRole: string },
): Promise<ExecutionResult> {
  const p = payload as {
    agent_id?: string;
    contact_id?: string;
    phone?: string;
    contact_name?: string;
    opportunity_name?: string;
  };

  let agentId = (p.agent_id ?? "").trim() || null;
  if (!agentId) {
    const { data: agent } = await ctx.supabase
      .from("ai_agents_v2")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("stato", "attivo")
      .in("tipo", ["vocale", "campagna"])
      .not("elevenlabs_agent_id", "is", null)
      .order("creato_il", { ascending: false })
      .limit(1)
      .maybeSingle();
    agentId = (agent?.id as string | undefined) ?? null;
  }
  if (!agentId) {
    return { ok: false, message: "Nessun agente vocale attivo configurato: creane uno in Agenti AI e collega un numero." };
  }
  if (!p.contact_id && !p.phone) {
    return { ok: false, message: "Proposta senza contatto né numero: impossibile chiamare." };
  }

  const { data: company } = await ctx.supabase
    .from("companies")
    .select("name")
    .eq("id", ctx.companyId)
    .maybeSingle();

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/initiate-outbound-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      agent_id: agentId,
      contact_id: p.contact_id ?? undefined,
      phone_number: p.contact_id ? undefined : p.phone,
      company_id: ctx.companyId,
      user_id: ctx.userId,
      dynamic_vars: {
        azienda: (company?.name as string | undefined) ?? "la nostra azienda",
        nome: (p.contact_name ?? "").split(" ")[0] || "Cliente",
        lavoro: p.opportunity_name ?? "il suo progetto",
      },
    }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    // Errori "di merito" (DND, orari, crediti) tornano leggibili all'utente.
    return { ok: false, message: `Chiamata non avviata: ${(data as { error?: string })?.error ?? `errore ${res.status}`}` };
  }
  return {
    ok: true,
    message: `Chiamata AI avviata verso ${p.contact_name || p.phone || "il lead"}.`,
    details: { conversation_id: (data as { conversation_id?: string })?.conversation_id ?? null, agent_id: agentId },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler create_quote_draft — inserisce un quote con status='bozza' che Florin
// può completare nel quote builder. Il payload può contenere client_name,
// client_email, title, description, total_estimate, items, ecc.
async function createQuoteDraft(
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown>; primaryRole: string },
): Promise<ExecutionResult> {
  const p = payload as {
    client_name?: string;
    client_email?: string;
    client_phone?: string;
    client_company?: string;
    title?: string;
    description?: string;
    notes?: string;
    total_estimate?: number;
    validity_days?: number;
  };

  const clientName = (p.client_name ?? "").trim() || "Cliente da specificare";
  const title = (p.title ?? "").trim() || `Bozza preventivo — ${clientName}`;
  const description = (p.description ?? p.notes ?? "").trim() || null;
  const subtotal = typeof p.total_estimate === "number" ? p.total_estimate : 0;
  const validityDays = typeof p.validity_days === "number" && p.validity_days > 0 ? p.validity_days : 30;
  const expiresAt = new Date(Date.now() + validityDays * 24 * 3600 * 1000).toISOString();

  // Genera un quote_number provvisorio (anno + timestamp short)
  const year = new Date().getFullYear();
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  const quoteNumber = `BOZZA-${year}-${ts}`;

  const insertPayload: Record<string, unknown> = {
    company_id: ctx.companyId,
    quote_number: quoteNumber,
    status: "bozza",
    client_name: clientName,
    client_email: p.client_email ?? null,
    client_phone: p.client_phone ?? null,
    client_company: p.client_company ?? null,
    title,
    description,
    subtotal,
    tax_amount: 0,
    discount_amount: 0,
    total: subtotal,
    validity_days: validityDays,
    expires_at: expiresAt,
    created_by: ctx.userId,
    notes: p.notes ?? null,
  };

  const { data, error } = await ctx.supabase
    .from("quotes")
    .insert(insertPayload)
    .select("id, quote_number")
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Creazione bozza preventivo fallita: ${error.message}` };
  }
  if (!data) {
    return { ok: false, message: "Creazione bozza preventivo: nessuna riga inserita" };
  }

  return {
    ok: true,
    message: `Bozza preventivo ${data.quote_number} creata per ${clientName}. Aprila in Preventivi → Bozze per completare voci e prezzi.`,
    details: { quote_id: data.id, quote_number: data.quote_number, client_name: clientName },
  };
}

// Handler create_invoice_draft — schema invoices ha N campi obbligatori
// (invoice_number/year/progressive, document_type, issue_date, ecc.) gestiti
// dal flusso fatturazione standard. Per ora restituiamo successo informativo:
// la bozza va creata da Fatturazione → Nuova fattura. In futuro: chiamata a
// edge function ai-fattura-genera-bozza che orchestra correttamente.
async function createInvoiceDraft(
  payload: Record<string, unknown>,
  _ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown>; primaryRole: string },
): Promise<ExecutionResult> {
  const p = payload as {
    client_name?: string;
    total_estimate?: number;
    order_id?: string;
  };
  const clientName = (p.client_name ?? "").trim() || "Cliente";
  const total = typeof p.total_estimate === "number" ? p.total_estimate : 0;
  return {
    ok: true,
    message: `Promemoria registrato: emetti fattura a ${clientName}${total ? ` per € ${total}` : ""}. Vai in Fatturazione → Nuova fattura per completare l'intestazione (numerazione, data emissione, IVA).`,
    details: { client_name: clientName, total, order_id: p.order_id },
  };
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
  // Difesa in profondità: ricontrolla il RUOLO anche qui (oltre alla policy a monte),
  // così questo layer è autosufficiente e non dipende solo dal chiamante.
  if (tool.allowedRoles?.length && !tool.allowedRoles.includes(ctx.primaryRole) && !tool.allowedRoles.includes("*")) {
    return { ok: false, message: `Ruolo non autorizzato per ${actionType}` };
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

async function updatePurchaseOrderDelay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const purchaseOrderId = typeof payload.purchase_order_id === "string" && payload.purchase_order_id.trim()
    ? payload.purchase_order_id.trim()
    : null;
  const purchaseOrderNumber = typeof payload.purchase_order_number === "string" && payload.purchase_order_number.trim()
    ? payload.purchase_order_number.trim()
    : null;
  const newExpectedDeliveryDate = typeof payload.new_expected_delivery_date === "string"
    ? payload.new_expected_delivery_date.trim()
    : "";
  const reason = typeof payload.reason === "string" && payload.reason.trim()
    ? payload.reason.trim()
    : "Aggiornamento ricevuto via email fornitore";
  const sourceEmailId = typeof payload.source_email_id === "string" ? payload.source_email_id : null;

  if (!purchaseOrderId && !purchaseOrderNumber) {
    return { ok: false, message: "Serve purchase_order_id oppure purchase_order_number per aggiornare la consegna." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newExpectedDeliveryDate) || Number.isNaN(Date.parse(newExpectedDeliveryDate))) {
    return { ok: false, message: "new_expected_delivery_date deve essere in formato YYYY-MM-DD." };
  }

  let query = ctx.supabase
    .from("purchase_orders")
    .select("id, oda_number, status, expected_delivery_date, internal_notes, company_id")
    .eq("company_id", ctx.companyId);

  query = purchaseOrderId
    ? query.eq("id", purchaseOrderId)
    : query.eq("oda_number", purchaseOrderNumber);

  const { data: po, error: loadErr } = await query.maybeSingle();
  if (loadErr) return { ok: false, message: `Lettura ODA fallita: ${loadErr.message}` };
  if (!po) {
    return {
      ok: false,
      message: purchaseOrderNumber
        ? `ODA ${purchaseOrderNumber} non trovato. Controlla il riferimento estratto dall'AI.`
        : "ODA non trovato o non autorizzato per questa azienda.",
    };
  }

  const oldDate = po.expected_delivery_date ?? null;
  const auditLine = [
    `[AI Email ${new Date().toLocaleString("it-IT")}]`,
    `consegna aggiornata da ${oldDate ?? "non indicata"} a ${newExpectedDeliveryDate}.`,
    `Motivo: ${reason}`,
    sourceEmailId ? `Fonte email: ${sourceEmailId}` : null,
  ].filter(Boolean).join(" ");

  const nextInternalNotes = [po.internal_notes, auditLine]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");

  const { error: updateErr } = await ctx.supabase
    .from("purchase_orders")
    .update({
      expected_delivery_date: newExpectedDeliveryDate,
      internal_notes: nextInternalNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", po.id)
    .eq("company_id", ctx.companyId);

  if (updateErr) return { ok: false, message: `Aggiornamento ODA fallito: ${updateErr.message}` };

  return {
    ok: true,
    message: `Data consegna ODA ${po.oda_number ?? po.id} aggiornata al ${newExpectedDeliveryDate}.`,
    details: {
      purchase_order_id: po.id,
      oda_number: po.oda_number,
      old_expected_delivery_date: oldDate,
      new_expected_delivery_date: newExpectedDeliveryDate,
      source_email_id: sourceEmailId,
    },
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
  const emailItems = normalizeEmailPurchaseItems(payload.items);

  if (!stockId && emailItems.length > 0) {
    return await createProposedPurchaseOrderFromEmail(payload, emailItems, ctx);
  }

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

function normalizeEmailPurchaseItems(items: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" && row.name.trim()
        ? row.name.trim()
        : typeof row.description === "string" && row.description.trim()
          ? row.description.trim()
          : null;
      if (!name) return null;
      const qtyRaw = row.qty ?? row.quantity;
      const qty = typeof qtyRaw === "number"
        ? qtyRaw
        : Number(String(qtyRaw ?? "").replace(",", "."));
      return {
        material_sku: typeof row.material_sku === "string" ? row.material_sku : typeof row.sku === "string" ? row.sku : null,
        name,
        qty: Number.isFinite(qty) && qty > 0 ? qty : null,
        unit: typeof row.unit === "string" ? row.unit : null,
        price_estimate: typeof row.price_estimate === "number" ? row.price_estimate : null,
        note: typeof row.note === "string" ? row.note : null,
      };
    })
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 50);
}

async function findSupplierFromEmailPayload(
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; companyId: string },
): Promise<string | null> {
  const explicitSupplierId = typeof payload.supplier_id === "string" && payload.supplier_id.trim()
    ? payload.supplier_id.trim()
    : null;
  if (explicitSupplierId) return explicitSupplierId;

  const supplierEmail = typeof payload.supplier_email === "string" && payload.supplier_email.trim()
    ? payload.supplier_email.trim()
    : null;
  const supplierName = typeof payload.supplier_name === "string" && payload.supplier_name.trim()
    ? payload.supplier_name.trim()
    : null;

  if (supplierEmail) {
    const { data } = await ctx.supabase
      .from("suppliers")
      .select("id")
      .eq("company_id", ctx.companyId)
      .ilike("email", supplierEmail)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (supplierName) {
    const { data } = await ctx.supabase
      .from("suppliers")
      .select("id")
      .eq("company_id", ctx.companyId)
      .ilike("name", supplierName)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

async function createProposedPurchaseOrderFromEmail(
  payload: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const supplierId = await findSupplierFromEmailPayload(payload, ctx);
  const proposalReason = typeof payload.proposal_reason === "string" && payload.proposal_reason.trim()
    ? payload.proposal_reason.trim()
    : "Proposta ODA generata da email fornitore.";
  const expectedDeliveryDate = typeof payload.expected_delivery_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.expected_delivery_date)
    ? payload.expected_delivery_date
    : null;

  const { data, error } = await ctx.supabase
    .from("proposed_purchase_orders")
    .insert({
      company_id: ctx.companyId,
      ai_persona_used: "email_ai",
      proposal_reason: proposalReason,
      proposed_supplier_id: supplierId,
      alternative_suppliers: {
        email: typeof payload.supplier_email === "string" ? payload.supplier_email : null,
        name: typeof payload.supplier_name === "string" ? payload.supplier_name : null,
        source: "email_ai",
        source_thread_id: typeof payload.source_thread_id === "string" ? payload.source_thread_id : null,
        source_email_id: typeof payload.source_email_id === "string" ? payload.source_email_id : null,
      },
      items,
      expected_delivery_date: expectedDeliveryDate,
      status: "draft",
      reviewed_by: null,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: `Creazione proposta ODA fallita: ${error.message}` };
  if (!data?.id) return { ok: false, message: "Creazione proposta ODA: nessuna riga inserita." };

  return {
    ok: true,
    message: `Proposta ODA creata da email con ${items.length} ${items.length === 1 ? "riga" : "righe"}. Apri Acquisti/Magazzino per verificarla e trasformarla in ordine.`,
    details: {
      proposed_purchase_order_id: data.id,
      supplier_id: supplierId,
      items_count: items.length,
      expected_delivery_date: expectedDeliveryDate,
    },
  };
}

async function createLogisticsTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string },
): Promise<ExecutionResult> {
  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.trim().slice(0, 180)
    : "Verifica operativa da email";
  const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 3000) : null;
  const dueDate = typeof payload.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.due_date)
    ? payload.due_date
    : null;
  const rawPriority = typeof payload.priority === "string" ? payload.priority : "normale";
  const priority = ["bassa", "normale", "alta", "urgente"].includes(rawPriority) ? rawPriority : "normale";
  const category = typeof payload.category === "string" && payload.category.trim()
    ? payload.category.trim().slice(0, 80)
    : "logistica";

  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      company_id: ctx.companyId,
      title,
      notes,
      status: "da_fare",
      priority,
      due_date: dueDate,
      category,
      created_by: ctx.userId,
    })
    .select("id, title")
    .maybeSingle();

  if (error) return { ok: false, message: `Creazione task logistica fallita: ${error.message}` };
  if (!data?.id) return { ok: false, message: "Creazione task logistica: nessuna riga inserita." };

  return {
    ok: true,
    message: `Task creato: ${data.title}.`,
    details: { task_id: data.id, title: data.title, due_date: dueDate, priority },
  };
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
