import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verificaFirmaElevenLabs, normalizzaPostCall } from "../_shared/elevenlabsWebhook.ts";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers": baseCorsHeaders["Access-Control-Allow-Headers"] + ", xi-signature",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Firma ElevenLabs (formato vero + legacy dello sweeper) ──
    // Prima si pretendeva `xi-signature` sull'HMAC del solo body: ElevenLabs
    // manda `elevenlabs-signature: t=<unix>,v0=<hex>` su "<t>.<body>". Anche
    // con il secret giusto, ogni webhook vero veniva rifiutato con 401.
    const rawBody = await req.text();
    const firma = await verificaFirmaElevenLabs(req, rawBody);
    if (!firma.ok) {
      console.warn("[INTERNAL-WEBHOOK] firma rifiutata:", firma.motivo);
      return json({ error: firma.motivo }, firma.status);
    }

    const grezzo = JSON.parse(rawBody) as Record<string, unknown>;
    const norm = normalizzaPostCall(grezzo);
    if (norm.ignora) return json({ success: true, ignored: true });
    const body = norm.piatto as unknown as Record<string, any>;

    const {
      agent_id: elevenlabsAgentId,
      conversation_id: conversationId,
      duration_seconds: durationSeconds = 0,
      messages_count: messagesCount = 0,
      status = "completed",
      tool_calls = [],
      transcript = [],
      metadata = {},
      summary: payloadSummary,
    } = body;

    // Generate summary from transcript if not provided
    const summaryText = payloadSummary
      || (() => {
          const agentMsgs = (transcript as { role?: string; message?: string }[])
            .filter((m) => m.role === "agent" && m.message);
          const last = agentMsgs[agentMsgs.length - 1];
          return last ? last.message!.slice(0, 150) : null;
        })();

    if (!elevenlabsAgentId || !conversationId) {
      return json({ error: "Missing agent_id or conversation_id" }, 400);
    }

    // ── Idempotency guard ──
    // I webhook ElevenLabs possono essere riconsegnati. Senza questo controllo
    // una doppia delivery causerebbe doppia detrazione crediti, doppio trigger
    // automazioni, ecc. Ritorniamo 200 con flag per impedire nuovi retry.
    const { data: existingCall } = await adminClient
      .from("internal_call_logs")
      .select("id")
      .eq("elevenlabs_conversation_id", conversationId)
      .maybeSingle();
    if (existingCall) {
      console.log(`[INTERNAL-WEBHOOK] Conversation ${conversationId} already processed — skip`);
      return json({ success: true, already_processed: true, call_id: existingCall.id });
    }

    // Look up internal agent by elevenlabs_agent_id
    const { data: agent } = await adminClient
      .from("internal_ai_agents")
      .select("id, company_id, llm_model, voice_id, enabled_tools")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .single();

    if (!agent) {
      console.warn(`[INTERNAL-WEBHOOK] No internal agent found for EL ID ${elevenlabsAgentId}`);
      return json({ error: "Internal agent not found" }, 404);
    }

    const companyId = agent.company_id;
    const callDirection = metadata?.call_direction || "inbound";
    const callerPhone = metadata?.caller_phone || metadata?.from_number || null;
    let contactId: string | null = null;
    let contactName: string | null = null;

    // ── Contact Lookup by Phone ── (P2-2: sanitize via helper)
    if (callerPhone) {
      const safePhone = sanitizePhoneForQuery(callerPhone);
      if (safePhone) {
        const suffix = safePhone.replace(/\+/g, "").slice(-9);
        const { data: contact } = await adminClient
          .from("marketing_contacts")
          .select("id, first_name, last_name")
          .eq("company_id", companyId)
          .ilike("phone", `%${suffix}%`)
          .limit(1)
          .maybeSingle();

        if (contact) {
          contactId = contact.id;
          contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
        }
      }
    }

    // ── Save Call Log ──
    const { data: callLog, error: callLogErr } = await adminClient
      .from("internal_call_logs")
      .insert({
        agent_id: agent.id,
        company_id: companyId,
        elevenlabs_conversation_id: conversationId,
        contact_id: contactId,
        contact_name: contactName,
        caller_phone: callerPhone,
        call_direction: callDirection,
        duration_seconds: durationSeconds,
        messages_count: messagesCount,
        status,
        summary: summaryText,
        transcript: transcript.length > 0 ? transcript : null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select("id")
      .single();

    if (callLogErr) {
      console.error("[INTERNAL-WEBHOOK] Error saving call log:", callLogErr);
    }

    const callId = callLog?.id;

    // ── Save CRM Actions from tool_calls ──
    if (callId && tool_calls.length > 0) {
      const actionInserts = tool_calls.map((tc: {
        tool_name: string;
        parameters?: Record<string, unknown>;
        result?: unknown;
        error?: string;
      }) => {
        // Map tool_name to action_type category
        const toolCategoryMap: Record<string, string> = {
          identify_caller: "read",
          get_client_info: "read",
          get_order_status: "read",
          get_orders_list: "read",
          get_appointment_info: "read",
          create_note: "create",
          create_activity: "create",
          create_support_ticket: "create",
          schedule_callback: "create",
          update_order_date: "update",
          send_sms_confirmation: "send",
        };

        return {
          call_id: callId,
          company_id: companyId,
          tool_name: tc.tool_name,
          action_type: toolCategoryMap[tc.tool_name] || "custom",
          entity_type: "contact",
          entity_id: contactId,
          input_params: tc.parameters || null,
          result: tc.result || null,
          status: tc.error ? "error" : "success",
          error_message: tc.error || null,
        };
      });

      const { error: actionsErr } = await adminClient
        .from("internal_agent_actions")
        .insert(actionInserts);

      if (actionsErr) {
        console.error("[INTERNAL-WEBHOOK] Error saving actions:", actionsErr);
      }
    }

    // ── Credit Deduction (reuses same atomic RPC) ──
    const durationMin = Math.max(0.0167, durationSeconds / 60);
    const ttsModel = "eleven_multilingual_v2"; // default TTS for internal agents

    const billingConfig = await getCompanyBillingConfig(adminClient, companyId, "ai_agents");

    const { data: pricing } = await adminClient
      .from("platform_pricing")
      .select("cost_real_per_min, cost_billed_per_min")
      .eq("llm_model", agent.llm_model)
      .eq("tts_model", ttsModel)
      .maybeSingle();

    // FIX: ?? invece di || — un piano con cost_real_per_min=0 veniva
    // sovrascritto con 0.02 e gonfiava i costi reportati.
    const costRealPerMin = pricing?.cost_real_per_min ?? 0.0200;
    let costBilledPerMin = pricing?.cost_billed_per_min ?? 0.0400;

    if (billingConfig.isFree) {
      costBilledPerMin = 0;
    } else if (billingConfig.pricePerUnitEur != null) {
      costBilledPerMin = billingConfig.pricePerUnitEur;
    } else if (billingConfig.markupMultiplier != null) {
      costBilledPerMin = costRealPerMin * billingConfig.markupMultiplier;
    }

    const costRealTotal = Number((durationMin * costRealPerMin).toFixed(4));
    const costBilledTotal = Number((durationMin * costBilledPerMin).toFixed(4));
    const marginTotal = Number((costBilledTotal - costRealTotal).toFixed(4));

    // Atomic deduction
    const { data: updatedCredits, error: deductErr } = await adminClient.rpc(
      "deduct_ai_credits" as never,
      { p_company_id: companyId, p_cost: costBilledTotal }
    );

    let balanceBefore = 0;
    let balanceAfter = 0;

    if (deductErr) {
      // FIX: rimosso manual fallback SELECT-then-UPDATE che causava lost-update
      // sotto concorrenza. Se la RPC atomica fallisce, ritorniamo errore e
      // lasciamo che ElevenLabs ritenti il webhook (che troverà l'idempotency
      // guard e non duplicherà nulla).
      console.error("[INTERNAL-WEBHOOK] deduct_ai_credits RPC failed:", deductErr);
      return json({ error: "Credit deduction failed", details: deductErr.message }, 500);
    }

    const result = updatedCredits as unknown as { balance_before: number; balance_after: number } | null;
    balanceBefore = result?.balance_before ?? 0;
    balanceAfter = result?.balance_after ?? 0;

    // Record usage (reuses same ai_credit_usage table)
    await adminClient.from("ai_credit_usage").insert({
      company_id: companyId,
      conversation_id: null, // internal agents use internal_call_logs, not ai_agent_conversations
      agent_id: null, // this field references ai_agents, not internal_ai_agents
      duration_sec: durationSeconds,
      duration_min: Number(durationMin.toFixed(4)),
      llm_model: agent.llm_model,
      tts_model: ttsModel,
      cost_real_per_min: costRealPerMin,
      cost_billed_per_min: costBilledPerMin,
      cost_real_total: costRealTotal,
      cost_billed_total: costBilledTotal,
      margin_total: marginTotal,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      call_direction: callDirection,
    });

    // ── Auto-recharge / Block logic ──
    if (balanceAfter <= 0) {
      await adminClient
        .from("ai_credits")
        .update({
          calls_blocked: true,
          blocked_at: new Date().toISOString(),
          blocked_reason: "balance_zero",
        })
        .eq("company_id", companyId);
      console.log(`[INTERNAL-WEBHOOK] BLOCKED company ${companyId} — balance: €${balanceAfter}`);
    } else {
      // FIX: rimpiazzato SELECT-then-UPDATE con RPC atomica che fa lock sulla
      // row di ai_credits ed esegue UPDATE condizionale. Evita doppie ricariche
      // sotto webhook concorrenti.
      const { data: rechargeResult, error: rechargeErr } = await adminClient.rpc(
        "maybe_auto_recharge" as never,
        { p_company_id: companyId }
      );

      if (rechargeErr) {
        console.error("[INTERNAL-WEBHOOK] maybe_auto_recharge error:", rechargeErr);
      } else {
        const rows = rechargeResult as unknown as Array<{ recharged: boolean; amount_recharged: number; new_balance: number }> | null;
        const r = rows?.[0];
        if (r?.recharged) {
          console.log(`[INTERNAL-WEBHOOK] Auto-recharge €${r.amount_recharged} for company ${companyId} — new balance: €${r.new_balance}`);
        } else {
          // Controlla alert_threshold solo se non abbiamo ricaricato
          const { data: alertCfg } = await adminClient
            .from("ai_credits")
            .select("alert_threshold_eur, alert_email_sent_at")
            .eq("company_id", companyId)
            .maybeSingle();
          if (balanceAfter <= (alertCfg?.alert_threshold_eur ?? 5)) {
            await adminClient
              .from("ai_credits")
              .update({ alert_email_sent_at: new Date().toISOString() })
              .eq("company_id", companyId);
            console.log(`[INTERNAL-WEBHOOK] LOW balance alert for company ${companyId}`);
          }
        }
      }
    }

    // ── Automation Trigger ──
    await adminClient.from("automation_trigger_events").insert({
      company_id: companyId,
      trigger_event: "internal_call_completed",
      entity_id: contactId || agent.id,
      entity_type: "contact",
      payload: {
        duration_seconds: durationSeconds,
        call_direction: callDirection,
        agent_name: agent.id,
        contact_id: contactId,
        conversation_id: conversationId,
        tool_calls_count: tool_calls.length,
        cost_billed: costBilledTotal,
      },
    });

    console.log(`[INTERNAL-WEBHOOK] Processed conversation ${conversationId} for agent ${agent.id}, cost €${costBilledTotal}`);

    return json({
      success: true,
      call_id: callId,
      cost_billed: costBilledTotal,
      balance_after: balanceAfter,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[INTERNAL-WEBHOOK] Error:", message);
    return json({ error: message }, 500);
  }
});
