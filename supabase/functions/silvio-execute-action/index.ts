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
import { requireAuth } from "../_shared/auth.ts";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";

interface Payload {
  proposal_id: string;
  /** Override payload (es. utente ha modificato il testo email) */
  override_payload?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

interface ExecutionResult {
  ok: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
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
    const { data: proposal, error: pErr } = await supabaseAdmin
      .from("ai_action_proposals")
      .select("*")
      .eq("id", body.proposal_id)
      .maybeSingle();

    if (pErr || !proposal) return errorResponse("Proposta non trovata", 404, corsHeaders);
    if (proposal.user_id !== userId) return errorResponse("Proposta non autorizzata", 403, corsHeaders);
    if (proposal.status !== "pending") {
      return errorResponse(`Proposta già ${proposal.status}`, 400, corsHeaders);
    }
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      await supabaseAdmin.from("ai_action_proposals")
        .update({ status: "expired" }).eq("id", proposal.id);
      return errorResponse("Proposta scaduta", 400, corsHeaders);
    }

    const finalPayload = body.override_payload ?? proposal.payload ?? {};
    const ctx = {
      supabase: supabaseAdmin,
      userId,
      companyId: proposal.company_id,
      proposal,
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
    }).eq("id", proposal.id);

    // Resolve alert correlato SOLO se l'azione è andata a buon fine
    if (result.ok) {
      const alertId = (proposal.payload as { alert_id?: string })?.alert_id;
      if (alertId) {
        await supabaseAdmin.from("silvio_alerts").update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        }).eq("id", alertId);
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
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-execute-action] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

// ═══ DISPATCHER ════════════════════════════════════════════════════════════

async function dispatchAction(
  actionType: string,
  payload: Record<string, unknown>,
  ctx: { supabase: SupabaseAdmin; userId: string; companyId: string; proposal: Record<string, unknown> },
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
      return { ok: false, message: `Action type sconosciuto: ${actionType}` };
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
  let companyName: string | null = null;

  if (orderId) {
    const { data: order } = await ctx.supabase
      .from("orders")
      .select("client_email, client_name, client_company, order_code, total_amount, deposit_amount, balance_amount, deposit_expected_date, balance_expected_date")
      .eq("id", orderId)
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
  const body = customBody ?? buildOverdueEmailBody(clientName, orderCode, amount, rataType, companyName);

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
    .from("quotes").select("client_name, client_email, quote_number, total")
    .eq("id", quoteId).maybeSingle();

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
    .from("orders").select("id, company_id, order_code").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, message: "Ordine non trovato" };
  if (order.company_id !== ctx.companyId) return { ok: false, message: "Ordine non autorizzato" };

  // Aggiorna pagamento
  const updateObj: Record<string, unknown> = {};
  updateObj[cols.paid] = true;
  updateObj[cols.date] = new Date().toISOString();

  const { error: updateErr } = await ctx.supabase.from("orders").update(updateObj).eq("id", orderId);
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
    .from("warehouse_stock").select("name, internal_code, unit_cost, reorder_quantity, supplier_id")
    .eq("id", stockId).maybeSingle();
  if (!stock) return { ok: false, message: "Articolo magazzino non trovato" };

  const finalSupplierId = supplierId ?? stock.supplier_id;
  const finalQty = reorderQty ?? stock.reorder_quantity ?? 1;

  // Verifica fornitore
  if (!finalSupplierId) {
    return { ok: false, message: "Nessun fornitore associato. Specificalo manualmente in payload.supplier_id." };
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
