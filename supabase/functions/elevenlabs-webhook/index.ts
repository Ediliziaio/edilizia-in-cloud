import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders as baseCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers": baseCorsHeaders["Access-Control-Allow-Headers"] + ", xi-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- HMAC Signature Verification (FIX 11) ---
    const webhookSecret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("xi-signature");
      if (!signature) {
        console.warn("[WEBHOOK] Missing xi-signature header");
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
        console.warn("[WEBHOOK] Invalid signature");
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

    // Look up internal agent
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("id, company_id, llm_model, tts_model, send_confirmation_after_booking")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .single();

    if (!agent) {
      return json({ error: "Agent not found" }, 404);
    }

    const companyId = agent.company_id;
    let contactId: string | null = null;
    let appointmentCreated = false;
    let newContactCreated = false;

    // ============ DND CHECK FOR INBOUND CALLS (FIX 8) ============
    const callDirection = metadata?.call_direction || "inbound";
    if (callDirection === "inbound" && metadata?.caller_phone) {
      const { data: callerContact } = await adminClient
        .from("marketing_contacts")
        .select("id, optout_call")
        .eq("company_id", companyId)
        .eq("phone", metadata.caller_phone)
        .maybeSingle();
      if (callerContact?.optout_call) {
        console.warn(`[WEBHOOK] Inbound call from DND contact ${callerContact.id} (phone: ${metadata.caller_phone})`);
      }
      if (callerContact) {
        contactId = callerContact.id;
      }
    }

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
                newContactCreated = true;
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

        case "assign_to_user": {
          const targetContactId = parameters?.contact_id || contactId;
          const targetUserId = parameters?.user_id;
          if (targetContactId && targetUserId) {
            const { error: assignErr } = await adminClient
              .from("marketing_contacts")
              .update({ assigned_to: targetUserId })
              .eq("id", targetContactId)
              .eq("company_id", companyId);
            if (assignErr) {
              console.error("[WEBHOOK] assign_to_user error:", assignErr);
            } else {
              console.log(`[WEBHOOK] Contact ${targetContactId} assigned to user ${targetUserId}`);
            }
          }
          break;
        }
      }
    }

    // Resolve branch_id from metadata
    const branchId: string | null = metadata?.branch_id || null;

    // Save conversation
    const convInsert: Record<string, unknown> = {
      agent_id: agent.id,
      company_id: companyId,
      elevenlabs_conversation_id: conversationId,
      contact_id: contactId,
      appointment_created: appointmentCreated,
      duration_seconds: durationSeconds,
      messages_count: messagesCount,
      status,
      summary: summaryText,
      transcript: transcript.length > 0 ? transcript : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
    };
    if (branchId) {
      convInsert.branch_id = branchId;
    }

    const { data: convRecord, error: convErr } = await adminClient
      .from("ai_agent_conversations")
      .insert(convInsert)
      .select("id")
      .single();

    if (convErr) {
      console.error("Error saving conversation:", convErr);
    }

    // ============ UPDATE BRANCH STATS (FIX 10 A/B) ============
    if (branchId && !convErr) {
      // Increment counters
      const { data: currentBranch } = await adminClient
        .from("ai_agent_branches")
        .select("conversations_count, appointments_count, avg_duration_seconds")
        .eq("id", branchId)
        .maybeSingle();

      if (currentBranch) {
        const newConvCount = (currentBranch.conversations_count || 0) + 1;
        const newAptCount = (currentBranch.appointments_count || 0) + (appointmentCreated ? 1 : 0);
        const oldTotal = (currentBranch.avg_duration_seconds || 0) * (currentBranch.conversations_count || 0);
        const newAvg = (oldTotal + durationSeconds) / newConvCount;

        await adminClient
          .from("ai_agent_branches")
          .update({
            conversations_count: newConvCount,
            appointments_count: newAptCount,
            avg_duration_seconds: Number(newAvg.toFixed(2)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", branchId);
      }
    }

    // ============ CREDIT SYSTEM (ATOMIC) ============
    const durationMin = Math.max(0.0167, durationSeconds / 60);
    const ttsModel = agent.tts_model || "eleven_multilingual_v2";

    // Check billing override for AI
    const billingConfig = await getCompanyBillingConfig(adminClient, companyId, "ai_agents");

    // Get pricing for this LLM+TTS combo
    const { data: pricing } = await adminClient
      .from("platform_pricing")
      .select("cost_real_per_min, cost_billed_per_min")
      .eq("llm_model", agent.llm_model)
      .eq("tts_model", ttsModel)
      .maybeSingle();

    const costRealPerMin = pricing?.cost_real_per_min || 0.0200;
    let costBilledPerMin = pricing?.cost_billed_per_min || 0.0400;

    // Apply billing overrides
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

    // ATOMIC balance deduction — prevents race conditions with concurrent calls
    const { data: updatedCredits, error: deductErr } = await adminClient.rpc(
      "deduct_ai_credits" as never,
      {
        p_company_id: companyId,
        p_cost: costBilledTotal,
      }
    );

    let balanceBefore = 0;
    let balanceAfter = 0;

    if (deductErr) {
      console.error("Error deducting credits (falling back to manual):", deductErr);
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
          notes: `Ricarica automatica — saldo era €${balanceAfter.toFixed(2)}`,
          processed_at: new Date().toISOString(),
        });

        console.log(`[CREDITS] Auto-recharge €${rechargeAmount} for company ${companyId} — new balance: €${newBalance}`);

      } else if (balanceAfter <= (creditSettings?.alert_threshold_eur ?? 5)) {
        await adminClient
          .from("ai_credits")
          .update({ alert_email_sent_at: new Date().toISOString() })
          .eq("company_id", companyId);

        console.log(`[CREDITS] LOW balance alert for company ${companyId} — balance: €${balanceAfter}`);
      }
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

    // ============ AUTOMATION TRIGGER EVENTS (FIX 3b) ============
    const triggerPayload = {
      duration_seconds: durationSeconds,
      appointment_created: appointmentCreated,
      call_direction: metadata?.call_direction || "inbound",
      agent_name: agent.id,
      contact_id: contactId,
      conversation_id: conversationId,
    };

    // Always fire ai_conversation_ended
    await adminClient.from("automation_trigger_events").insert({
      company_id: companyId,
      trigger_event: "ai_conversation_ended",
      entity_id: contactId || agent.id,
      entity_type: "contact",
      payload: triggerPayload,
    });

    // Fire ai_appointment_booked if applicable
    if (appointmentCreated) {
      await adminClient.from("automation_trigger_events").insert({
        company_id: companyId,
        trigger_event: "ai_appointment_booked",
        entity_id: contactId || agent.id,
        entity_type: "contact",
        payload: triggerPayload,
      });
    }

    // Fire ai_contact_created if new contact was created
    if (newContactCreated && contactId) {
      await adminClient.from("automation_trigger_events").insert({
        company_id: companyId,
        trigger_event: "ai_contact_created",
        entity_id: contactId,
        entity_type: "contact",
        payload: triggerPayload,
      });
    }

    // ============ POST-CALL CONFIRMATION (FIX 4) ============
    if (appointmentCreated && (agent as any).send_confirmation_after_booking && contactId) {
      try {
        const { data: contact } = await adminClient
          .from("marketing_contacts")
          .select("phone, email, first_name")
          .eq("id", contactId)
          .single();

        if (contact?.phone || contact?.email) {
          const channel = contact.phone ? "whatsapp" : "email";
          const confirmMsg = `Ciao ${contact.first_name || ""}, confermiamo il tuo appuntamento prenotato con il nostro assistente. Ti aspettiamo!`;

          await fetch(`${supabaseUrl}/functions/v1/send-contact-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              company_id: companyId,
              contact_id: contactId,
              channel,
              content: confirmMsg,
            }),
          });
        }
      } catch (confirmErr) {
        console.error("[WEBHOOK] Post-call confirmation error:", confirmErr);
      }
    }

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
    headers: { ...secureHeaders, ...corsHeaders },
  });
}
