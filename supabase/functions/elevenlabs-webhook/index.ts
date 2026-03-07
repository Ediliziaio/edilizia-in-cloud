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

    // ElevenLabs webhook payload
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

    // Look up internal agent by elevenlabs_agent_id
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("id, company_id")
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
            // Check if contact exists
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
    const { error: convErr } = await adminClient
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
      });

    if (convErr) {
      console.error("Error saving conversation:", convErr);
    }

    // Decrement credits
    const minutesUsed = Math.ceil(durationSeconds / 60);
    if (minutesUsed > 0) {
      const { data: credits } = await adminClient
        .from("ai_agent_credits")
        .select("minutes_used")
        .eq("company_id", companyId)
        .single();

      if (credits) {
        const currentUsed = credits.minutes_used ?? 0;
        await adminClient
          .from("ai_agent_credits")
          .update({
            minutes_used: currentUsed + minutesUsed,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId);
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
      },
    });

    return json({ success: true, conversation_saved: true, appointment_created: appointmentCreated });
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
