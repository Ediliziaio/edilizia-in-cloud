import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
    } = body;

    if (!elevenlabsAgentId || !conversationId) {
      return json({ error: "Missing agent_id or conversation_id" }, 400);
    }

    // Look up internal agent
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("id, company_id, llm_model, tts_model")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .single();

    if (!agent) {
      return json({ error: "Agent not found" }, 404);
    }

    const companyId = agent.company_id;
    let contactId: string | null = null;
    let appointmentCreated = false;

    // Process tool calls for CRM integration
    for (const toolCall of tool_calls) {
      const { tool_name, parameters } = toolCall;

      switch (tool_name) {
        case "create_appointment": {
          const { data: appointment, error: aptErr } = await adminClient
            .from("appointments")
            .insert({
              company_id: companyId,
              title: parameters?.title || "Appuntamento da Agente AI",
              appointment_date: parameters?.date || new Date().toISOString().split("T")[0],
              appointment_time: parameters?.time || null,
              description: parameters?.note || `Creato da agente AI. Conversazione: ${conversationId}`,
              contact_id: parameters?.contact_id || contactId || null,
              created_by: agent.id,
              appointment_type: "agente_ai",
              status: "confermato",
            })
            .select("id")
            .single();

          if (!aptErr && appointment) {
            appointmentCreated = true;
          }
          break;
        }

        case "create_contact":
        case "get_lead_info": {
          if (parameters?.phone || parameters?.email) {
            let query = adminClient
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", companyId);

            if (parameters?.email) {
              query = query.eq("email", parameters.email);
            } else if (parameters?.phone) {
              query = query.eq("phone", parameters.phone);
            }

            const { data: existingContact } = await query.maybeSingle();

            if (existingContact) {
              contactId = existingContact.id;
            } else if (tool_name === "create_contact") {
              const { data: newContact } = await adminClient
                .from("marketing_contacts")
                .insert({
                  company_id: companyId,
                  first_name: parameters?.name || "Nuovo Contatto",
                  last_name: "",
                  email: parameters?.email || null,
                  phone: parameters?.phone || null,
                  source: "agente_ai",
                  contact_type: "lead",
                })
                .select("id")
                .single();

              if (newContact) {
                contactId = newContact.id;
              }
            }
          }
          break;
        }

        case "update_lead_status": {
          if (parameters?.contact_id && parameters?.status) {
            await adminClient
              .from("marketing_contacts")
              .update({ contact_type: parameters.status })
              .eq("id", parameters.contact_id)
              .eq("company_id", companyId);
          }
          break;
        }
      }
    }

    // Save conversation
    const { data: convRecord, error: convErr } = await adminClient
      .from("ai_agent_conversations")
      .insert({
        agent_id: agent.id,
        company_id: companyId,
        elevenlabs_conversation_id: conversationId,
        contact_id: contactId,
        appointment_created: appointmentCreated,
        duration_seconds: durationSeconds,
        messages_count: messagesCount,
        status,
      })
      .select("id")
      .single();

    if (convErr) {
      console.error("Error saving conversation:", convErr);
    }

    // ============ CREDIT SYSTEM ============
    const durationMin = Math.max(0.0167, durationSeconds / 60);
    const ttsModel = agent.tts_model || "eleven_multilingual_v2";

    // Get pricing for this LLM+TTS combo
    const { data: pricing } = await adminClient
      .from("platform_pricing")
      .select("cost_real_per_min, cost_billed_per_min")
      .eq("llm_model", agent.llm_model)
      .eq("tts_model", ttsModel)
      .maybeSingle();

    const costRealPerMin = pricing?.cost_real_per_min || 0.0200;
    const costBilledPerMin = pricing?.cost_billed_per_min || 0.0400;

    const costRealTotal = Number((durationMin * costRealPerMin).toFixed(4));
    const costBilledTotal = Number((durationMin * costBilledPerMin).toFixed(4));
    const marginTotal = Number((costBilledTotal - costRealTotal).toFixed(4));

    // Get current balance
    const { data: credits } = await adminClient
      .from("ai_credits")
      .select("balance_eur, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount, alert_threshold_eur, alert_email_sent_at")
      .eq("company_id", companyId)
      .maybeSingle();

    const balanceBefore = credits?.balance_eur || 0;
    const balanceAfter = Number((balanceBefore - costBilledTotal).toFixed(4));

    // Deduct balance
    if (credits) {
      await adminClient
        .from("ai_credits")
        .update({
          balance_eur: balanceAfter,
          total_spent_eur: Number(((credits as Record<string, number>).total_spent_eur || 0) + costBilledTotal).toFixed(4),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);
    } else {
      // Auto-create with negative balance
      await adminClient.from("ai_credits").insert({
        company_id: companyId,
        balance_eur: balanceAfter,
        total_spent_eur: costBilledTotal,
      });
    }

    // Record usage
    await adminClient.from("ai_credit_usage").insert({
      company_id: companyId,
      conversation_id: convRecord?.id || null,
      agent_id: agent.id,
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
    });

    // Handle low/zero balance
    if (balanceAfter <= 0) {
      await adminClient
        .from("ai_credits")
        .update({
          calls_blocked: true,
          blocked_at: new Date().toISOString(),
          blocked_reason: "balance_zero",
        })
        .eq("company_id", companyId);

      console.log(`[CREDITS] BLOCKED company ${companyId} — balance: €${balanceAfter}`);

    } else if (credits?.auto_recharge_enabled && balanceAfter <= (credits?.auto_recharge_threshold || 5)) {
      // Auto-recharge
      const rechargeAmount = credits.auto_recharge_amount || 20;
      const newBalance = Number((balanceAfter + rechargeAmount).toFixed(4));

      await adminClient
        .from("ai_credits")
        .update({
          balance_eur: newBalance,
          total_recharged_eur: Number(((credits as Record<string, number>).total_recharged_eur || 0) + rechargeAmount).toFixed(4),
        })
        .eq("company_id", companyId);

      await adminClient.from("ai_credit_topups").insert({
        company_id: companyId,
        amount_eur: rechargeAmount,
        type: "auto",
        status: "completed",
        payment_method: (credits as Record<string, string>).auto_recharge_method || "card",
        notes: `Ricarica automatica — saldo era €${balanceAfter.toFixed(2)}`,
        processed_at: new Date().toISOString(),
      });

      console.log(`[CREDITS] Auto-recharge €${rechargeAmount} for company ${companyId} — new balance: €${newBalance}`);

    } else if (balanceAfter <= (credits?.alert_threshold_eur || 5)) {
      // Low balance alert
      await adminClient
        .from("ai_credits")
        .update({ alert_email_sent_at: new Date().toISOString() })
        .eq("company_id", companyId);

      console.log(`[CREDITS] LOW balance alert for company ${companyId} — balance: €${balanceAfter}`);
    }

    // Audit log
    await adminClient.from("ai_agent_audit_log").insert({
      company_id: companyId,
      agent_id: agent.id,
      user_id: "00000000-0000-0000-0000-000000000000",
      action: "webhook_conversation_completed",
      details: {
        conversation_id: conversationId,
        duration_seconds: durationSeconds,
        messages_count: messagesCount,
        appointment_created: appointmentCreated,
        contact_id: contactId,
        tool_calls_count: tool_calls.length,
        cost_billed: costBilledTotal,
        cost_real: costRealTotal,
        balance_after: balanceAfter,
      },
    });

    return json({
      success: true,
      conversation_saved: true,
      appointment_created: appointmentCreated,
      cost_billed: costBilledTotal,
      balance_after: balanceAfter,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("elevenlabs-webhook error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
