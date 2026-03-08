import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

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

    // --- HMAC Signature Verification ---
    const webhookSecret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("xi-signature");
      if (!signature) {
        console.warn("[INTERNAL-WEBHOOK] Missing xi-signature header");
        return json({ error: "Missing signature" }, 401);
      }

      const rawBody = await req.clone().text();
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
      const expectedSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (signature !== expectedSig) {
        console.warn("[INTERNAL-WEBHOOK] Invalid signature");
        return json({ error: "Invalid signature" }, 401);
      }
    }

    const body = await req.json();

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

    // ── Contact Lookup by Phone ──
    if (callerPhone) {
      const cleanPhone = String(callerPhone).replace(/[^0-9]/g, "");
      const { data: contact } = await adminClient
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .or(`phone.ilike.%${cleanPhone.slice(-9)}%`)
        .limit(1)
        .maybeSingle();

      if (contact) {
        contactId = contact.id;
        contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
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

    const costRealPerMin = pricing?.cost_real_per_min || 0.0200;
    let costBilledPerMin = pricing?.cost_billed_per_min || 0.0400;

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
      console.error("[INTERNAL-WEBHOOK] deduct_ai_credits error, manual fallback:", deductErr);
      const { data: credits } = await adminClient
        .from("ai_credits")
        .select("balance_eur, total_spent_eur")
        .eq("company_id", companyId)
        .maybeSingle();

      balanceBefore = credits?.balance_eur ?? 0;
      balanceAfter = Number((balanceBefore - costBilledTotal).toFixed(4));

      if (credits) {
        await adminClient
          .from("ai_credits")
          .update({
            balance_eur: balanceAfter,
            total_spent_eur: Number(((credits.total_spent_eur ?? 0) + costBilledTotal).toFixed(4)),
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId);
      } else {
        await adminClient.from("ai_credits").insert({
          company_id: companyId,
          balance_eur: -costBilledTotal,
          total_spent_eur: costBilledTotal,
        });
        balanceAfter = -costBilledTotal;
      }
    } else {
      const result = updatedCredits as unknown as { balance_before: number; balance_after: number } | null;
      balanceBefore = result?.balance_before ?? 0;
      balanceAfter = result?.balance_after ?? 0;
    }

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
      const { data: creditSettings } = await adminClient
        .from("ai_credits")
        .select("auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount, auto_recharge_method, alert_threshold_eur, total_recharged_eur")
        .eq("company_id", companyId)
        .maybeSingle();

      if (creditSettings?.auto_recharge_enabled && balanceAfter <= (creditSettings.auto_recharge_threshold ?? 5)) {
        const rechargeAmount = creditSettings.auto_recharge_amount ?? 20;
        const newBalance = Number((balanceAfter + rechargeAmount).toFixed(4));

        await adminClient
          .from("ai_credits")
          .update({
            balance_eur: newBalance,
            total_recharged_eur: Number(((creditSettings.total_recharged_eur ?? 0) + rechargeAmount).toFixed(4)),
          })
          .eq("company_id", companyId);

        await adminClient.from("ai_credit_topups").insert({
          company_id: companyId,
          amount_eur: rechargeAmount,
          type: "auto",
          status: "completed",
          payment_method: creditSettings.auto_recharge_method ?? "card",
          notes: `Ricarica automatica (interno) — saldo era €${balanceAfter.toFixed(2)}`,
          processed_at: new Date().toISOString(),
        });

        console.log(`[INTERNAL-WEBHOOK] Auto-recharge €${rechargeAmount} for company ${companyId}`);
      } else if (balanceAfter <= (creditSettings?.alert_threshold_eur ?? 5)) {
        await adminClient
          .from("ai_credits")
          .update({ alert_email_sent_at: new Date().toISOString() })
          .eq("company_id", companyId);
        console.log(`[INTERNAL-WEBHOOK] LOW balance alert for company ${companyId}`);
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
