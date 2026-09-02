import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verificaFirmaElevenLabs, normalizzaPostCall } from "../_shared/elevenlabsWebhook.ts";
import { corsHeaders as baseCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { prezzoMinutoVoce } from "../_shared/voicePricing.ts";

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

    // ── Firma ElevenLabs (formato vero + legacy dello sweeper) ──
    // Prima si pretendeva `xi-signature` sull'HMAC del solo body: ElevenLabs
    // manda `elevenlabs-signature: t=<unix>,v0=<hex>` su "<t>.<body>". Anche
    // con il secret giusto, ogni webhook vero veniva rifiutato con 401.
    const rawBody = await req.text();
    const firma = await verificaFirmaElevenLabs(req, rawBody);
    if (!firma.ok) {
      console.warn("[WEBHOOK] firma rifiutata:", firma.motivo);
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

    // ============ IDEMPOTENCY ============
    // ElevenLabs ritenta i webhook su errore transitorio. Senza guard, ogni
    // retry addebitava crediti, duplicava conversazioni e ri-sparava i trigger
    // automation.
    //
    // ⚠️ MA: initiate-outbound-call inserisce la conversazione PRIMA della
    // chiamata (status='in_progress', stesso elevenlabs_conversation_id).
    // La vecchia guardia "esiste → skippa" trattava quel segnaposto come
    // "già processato": OGNI chiamata outbound usciva di qui senza transcript,
    // senza statistiche e SENZA ADDEBITO CREDITI — chiamate gratis, appese per
    // sempre in_progress. Skippa solo se la riga è già FINALIZZATA; il
    // segnaposto in_progress va invece completato (update, non insert).
    const { data: existingConv } = await adminClient
      .from("ai_agent_conversations")
      .select("id, status, metadata, contact_id")
      .eq("elevenlabs_conversation_id", conversationId)
      .maybeSingle();

    const placeholderConvId: string | null =
      existingConv?.status === "in_progress" ? (existingConv.id as string) : null;

    if (existingConv && !placeholderConvId) {
      console.log(`[WEBHOOK] Conversation ${conversationId} already processed, skipping`);
      return json({
        success: true,
        already_processed: true,
        conversation_id: existingConv.id,
      });
    }

    // Look up internal agent (try v2 first, then legacy)
    let agent: { id: string; company_id: string; llm_model: string; tts_model?: string | null; send_confirmation_after_booking?: boolean; sms_postcall_enabled?: boolean; sms_postcall_trigger?: string; sms_postcall_template?: string } | null = null;
    let agentV2Id: string | null = null;

    const { data: agentV2 } = await adminClient
      .from("ai_agents_v2")
      .select("id, company_id, llm_model")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .maybeSingle();

    if (agentV2) {
      agentV2Id = agentV2.id;
      agent = { id: agentV2.id, company_id: agentV2.company_id, llm_model: agentV2.llm_model || "gemini-2.5-flash" };
    }

    if (!agent) {
      const { data: agentLegacy } = await adminClient
        .from("ai_agents")
        .select("id, company_id, llm_model, tts_model, send_confirmation_after_booking, sms_postcall_enabled, sms_postcall_trigger, sms_postcall_template")
        .eq("elevenlabs_agent_id", elevenlabsAgentId)
        .single();
      agent = agentLegacy;
    }

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
      // Match sul suffisso (9 cifre) come telnyx-webhook e call-init: il
      // confronto esatto con il formato di ElevenLabs non combaciava mai, e il
      // contatto restava scollegato dalla conversazione in entrata.
      const suffisso = String(metadata.caller_phone).replace(/\D/g, "").slice(-9);
      const { data: callerContact } = suffisso.length >= 6
        ? await adminClient
            .from("marketing_contacts")
            .select("id, optout_call")
            .eq("company_id", companyId)
            .ilike("phone", `%${suffisso}%`)
            .limit(1)
            .maybeSingle()
        : { data: null };
      if (callerContact?.optout_call) {
        console.warn("[WEBHOOK] Inbound call from DND contact", {
          contact_id: callerContact.id,
          company_id: companyId,
        });
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
            // P2-03: Push to Google Calendar (fire-and-forget)
            // Find the agent owner to determine which Google Calendar to sync to
            // profiles.role non esiste: la query tornava sempre null e la
            // sync col calendario dopo un appuntamento non partiva mai.
            const { data: membri } = await adminClient
              .from("profiles").select("id").eq("company_id", companyId).limit(50);
            const ids = ((membri ?? []) as Array<{ id: string }>).map((m) => m.id);
            let ownerId: string | null = null;
            if (ids.length) {
              const { data: ruoli } = await adminClient
                .from("user_roles").select("user_id").in("user_id", ids).eq("role", "company_admin").limit(1);
              ownerId = (ruoli as Array<{ user_id: string }> | null)?.[0]?.user_id ?? null;
            }
            const agentProfile = ownerId ? { id: ownerId } : null;
            if (agentProfile?.id && appointment.id) {
              fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-sync`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  action: "push_event",
                  user_id: agentProfile.id,
                  company_id: companyId,
                  appointment_id: appointment.id,
                }),
              }).catch((e) => console.error("[WEBHOOK] Google Calendar sync error:", e));
            }
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

    // P2-01: Sentiment analysis
    const { sentiment, score: sentimentScore } = transcript.length > 0
      ? analyzeSentiment(transcript as { role?: string; message?: string }[])
      : { sentiment: "neutral", score: 0 };

    // Save conversation
    const convInsert: Record<string, unknown> = {
      // Agente v2 → agent_v2_id (FK su ai_agents_v2); legacy → agent_id.
      // Prima si scriveva sempre agent_id: con un agente v2 l'insert violava
      // la FK su ai_agents e la conversazione andava persa.
      ...(agentV2Id ? { agent_v2_id: agentV2Id, agent_id: null } : { agent_id: agent.id }),
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
      sentiment,
      sentiment_score: sentimentScore,
    };
    if (branchId) {
      convInsert.branch_id = branchId;
    }

    let convRecord: { id: string } | null = null;
    let convErr: { code?: string; message?: string } | null = null;

    if (placeholderConvId) {
      // Chiamata OUTBOUND: completa il segnaposto creato da
      // initiate-outbound-call invece di inserire un doppione. Il metadata del
      // segnaposto (phone, initiated_by, provider) va preservato: il payload
      // del webhook non li conosce.
      const placeholder = existingConv as unknown as {
        metadata?: Record<string, unknown>;
        contact_id?: string | null;
      };
      const { data: updated, error: updErr } = await adminClient
        .from("ai_agent_conversations")
        .update({
          ...convInsert,
          // Il webhook risolve il contatto dal numero CHIAMANTE: nelle
          // outbound il chiamante è il numero dell'azienda, quindi qui
          // contactId è quasi sempre null — il contatto vero lo conosce solo
          // il segnaposto. Mai sovrascrivere un valore buono con un null.
          contact_id: (convInsert.contact_id as string | null) ?? placeholder.contact_id ?? null,
          metadata: {
            ...(placeholder.metadata ?? {}),
            ...(convInsert.metadata as Record<string, unknown>),
          },
        })
        .eq("id", placeholderConvId)
        .eq("status", "in_progress") // guard: se un webhook concorrente ha già finalizzato, 0 righe
        .select("id")
        .maybeSingle();
      convErr = updErr;
      convRecord = (updated as { id: string } | null) ?? null;
      if (!updErr && !convRecord) {
        console.log(`[WEBHOOK] Conversation ${conversationId} finalized by concurrent webhook, skipping billing`);
        return json({ success: true, already_processed: true, concurrent_duplicate: true });
      }
    } else {
      const { data: inserted, error: insErr } = await adminClient
        .from("ai_agent_conversations")
        .insert(convInsert)
        .select("id")
        .single();
      convErr = insErr;
      convRecord = (inserted as { id: string } | null) ?? null;
    }

    if (convErr) {
      console.error("Error saving conversation:", convErr);
      if ((convErr as { code?: string }).code === "23505") {
        console.log(`[WEBHOOK] Conversation ${conversationId} inserted by concurrent webhook, skipping billing`);
        return json({
          success: true,
          already_processed: true,
          concurrent_duplicate: true,
        });
      }
    }

    // ============ DUAL-WRITE TO ai_conversations_v2 ============
    if (agentV2Id) {
      try {
        const durationMin = Math.max(0.0167, durationSeconds / 60);
        await adminClient.from("ai_conversations_v2").insert({
          agent_id: agentV2Id,
          company_id: companyId,
          elevenlabs_conversation_id: conversationId,
          contact_id: contactId,
          stato: status === "completed" ? "completata" : status,
          canale: "telefono",
          direzione: callDirection,
          durata_secondi: durationSeconds,
          riassunto: summaryText,
          trascrizione_json: transcript.length > 0 ? transcript : null,
          numero_chiamante: metadata?.caller_phone || null,
          numero_chiamato: metadata?.called_phone || null,
        } as never);

        // Increment v2 agent stats atomically
        await adminClient.rpc("increment_agent_stats" as never, {
          p_agent_id: agentV2Id,
          p_chiamate: 1,
          p_chiamate_completate: status === "completed" ? 1 : 0,
          p_minuti: Number(durationMin.toFixed(2)),
          p_chat: 0,
          p_costo: 0, // will be set after billing calc
        } as never);
      } catch (v2Err) {
        console.error("[WEBHOOK] v2 dual-write error:", v2Err);
      }
    }

    // ============ UPDATE BRANCH STATS (atomic, no race) ============
    if (branchId && !convErr) {
      const { error: rpcErr } = await adminClient.rpc("increment_branch_stats" as never, {
        p_branch_id: branchId,
        p_duration_seconds: durationSeconds,
        p_appointment_created: appointmentCreated,
      } as never);
      if (rpcErr) {
        console.error("[WEBHOOK] increment_branch_stats failed:", rpcErr);
      }
    }

    // ============ CREDIT SYSTEM (ATOMIC) ============
    const durationMin = Math.max(0.0167, durationSeconds / 60);
    // Tariffa al minuto dal helper condiviso (platform_pricing + override
    // azienda). Prima si cercava "eleven_multilingual_v2" per gli agenti v2,
    // che invece parlano con eleven_flash_v2_5: nessuna riga, prezzo hardcodato.
    const tariffa = await prezzoMinutoVoce(adminClient, companyId, agent.llm_model, agent.tts_model);
    const ttsModel = tariffa.ttsModel;
    const costRealPerMin = tariffa.costoRealePerMin;
    const costBilledPerMin = tariffa.prezzoPerMin;
    if (tariffa.fonte === "ripiego") console.error("[WEBHOOK] tariffa di ripiego usata per", agent.llm_model, ttsModel);

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
    const { error: usageErr } = await adminClient.from("ai_credit_usage").insert({
      company_id: companyId,
      conversation_id: convRecord?.id || null,
      ...(agentV2Id ? { agent_id: null, agent_v2_id: agentV2Id } : { agent_id: agent.id }),
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
    if (usageErr) console.error("[WEBHOOK] ai_credit_usage NON salvato:", usageErr.message);

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
      // FIX: rimpiazzato SELECT-then-UPDATE con RPC atomica (maybe_auto_recharge)
      // che fa FOR UPDATE lock su ai_credits + UPDATE condizionale con WHERE
      // balance <= threshold. Due webhook concorrenti sulla stessa company non
      // possono più causare doppia ricarica.
      const { data: rechargeResult, error: rechargeErr } = await adminClient.rpc(
        "maybe_auto_recharge" as never,
        { p_company_id: companyId }
      );

      if (rechargeErr) {
        console.error("[CREDITS] maybe_auto_recharge error:", rechargeErr);
      } else {
        const rows = rechargeResult as unknown as Array<{ recharged: boolean; amount_recharged: number; new_balance: number }> | null;
        const r = rows?.[0];
        if (r?.recharged) {
          console.log(`[CREDITS] Auto-recharge €${r.amount_recharged} for company ${companyId} — new balance: €${r.new_balance}`);
        } else {
          const { data: alertCfg } = await adminClient
            .from("ai_credits")
            .select("alert_threshold_eur")
            .eq("company_id", companyId)
            .maybeSingle();
          if (balanceAfter <= (alertCfg?.alert_threshold_eur ?? 5)) {
            await adminClient
              .from("ai_credits")
              .update({ alert_email_sent_at: new Date().toISOString() })
              .eq("company_id", companyId);
            console.log(`[CREDITS] LOW balance alert for company ${companyId} — balance: €${balanceAfter}`);
          }
        }
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

    // ============ WHATSAPP AFTER-CALL (P2-04) ============
    // If appointment was created, send WhatsApp template confirmation
    if (appointmentCreated && contactId) {
      try {
        const { data: waContact } = await adminClient
          .from("marketing_contacts")
          .select("phone, first_name")
          .eq("id", contactId)
          .single();

        if (waContact?.phone) {
          const waMsg = `Ciao ${waContact.first_name || ""}! Il tuo appuntamento è stato confermato. Ti aspettiamo!`;
          // Fire-and-forget WhatsApp
          fetch(`${supabaseUrl}/functions/v1/send-contact-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              company_id: companyId,
              contact_id: contactId,
              channel: "whatsapp",
              content: waMsg,
            }),
          }).catch((e) => console.error("[WEBHOOK] WhatsApp after-call error:", e));
        }
      } catch (waErr) {
        console.error("[WEBHOOK] WhatsApp after-call setup error:", waErr);
      }
    }

    // ============ SMS POST-CALL (P1-06) ============
    const smsAgent = agent as typeof agent & { sms_postcall_enabled?: boolean; sms_postcall_trigger?: string; sms_postcall_template?: string };
    if (smsAgent?.sms_postcall_enabled && contactId) {
      try {
        const trigger = smsAgent.sms_postcall_trigger || "missed_call";
        const callDuration = durationSeconds ?? 0;
        const isMissedCall = callDuration < 10; // < 10s = missed/unanswered
        const shouldSend =
          trigger === "always" ||
          (trigger === "missed_call" && isMissedCall) ||
          (trigger === "appointment_created" && appointmentCreated);

        if (shouldSend) {
          const { data: contact } = await adminClient
            .from("marketing_contacts")
            .select("phone, first_name")
            .eq("id", contactId)
            .single();

          if (contact?.phone) {
            const template = smsAgent.sms_postcall_template ||
              "Ciao {nome}, abbiamo tentato di chiamarti. Richiamaci al più presto.";
            const smsText = template
              .replace("{nome}", contact.first_name || "")
              .replace("{data}", new Date().toLocaleDateString("it-IT"))
              .replace("{ora}", new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));

            await fetch(`${supabaseUrl}/functions/v1/send-contact-message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                company_id: companyId,
                contact_id: contactId,
                channel: "sms",
                content: smsText,
              }),
            });
            console.log(`[WEBHOOK] SMS post-call inviato a contatto ${contactId} (trigger: ${trigger})`);
          }
        }
      } catch (smsErr) {
        console.error("[WEBHOOK] SMS post-call error:", smsErr);
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

// P2-01: Keyword-based sentiment analysis on transcript
function analyzeSentiment(transcript: { role?: string; message?: string }[]): { sentiment: string; score: number } {
  const userMessages = transcript
    .filter((m) => m.role === "user" && m.message)
    .map((m) => m.message!.toLowerCase())
    .join(" ");

  if (!userMessages) return { sentiment: "neutral", score: 0 };

  const positiveWords = ["grazie", "ottimo", "perfetto", "benissimo", "sì", "certo", "confermo", "disponibile",
    "interessato", "bene", "buono", "eccellente", "fantastico", "volentieri", "ovviamente", "assolutamente"];
  const negativeWords = ["no", "non voglio", "non mi interessa", "stop", "basta", "problema", "errore",
    "deluso", "arrabbiato", "sbagliato", "impossibile", "mai", "cancella", "annulla", "fastidio"];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (userMessages.includes(word)) positiveCount++;
  }
  for (const word of negativeWords) {
    if (userMessages.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return { sentiment: "neutral", score: 0 };

  const score = Number(((positiveCount - negativeCount) / total).toFixed(2));
  const sentiment = score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";
  return { sentiment, score };
}
