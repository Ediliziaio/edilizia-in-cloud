import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === serviceRoleKey;

    let userId: string | null = null;
    let companyId: string | null = null;

    if (isServiceCall) {
      // Internal call (e.g. from process-automation)
      const body = await req.json();
      const { agent_id, contact_id, phone_number } = body;
      companyId = body.company_id;
      userId = body.user_id || "00000000-0000-0000-0000-000000000000";

      return await handleOutboundCall(adminClient, {
        agentId: agent_id,
        contactId: contact_id,
        phoneNumber: phone_number,
        companyId: companyId!,
        userId: userId!,
        skipSubscriptionCheck: body.skip_subscription_check || false,
      });
    }

    // User auth
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    userId = user.id;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) return json({ error: "No company" }, 400);
    companyId = profile.company_id;

    const body = await req.json();
    const { agent_id, contact_id, phone_number } = body;

    return await handleOutboundCall(adminClient, {
      agentId: agent_id,
      contactId: contact_id,
      phoneNumber: phone_number,
      companyId,
      userId,
      skipSubscriptionCheck: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("initiate-outbound-call error:", message);
    return json({ error: message }, 500);
  }
});

interface OutboundCallParams {
  agentId: string;
  contactId?: string;
  phoneNumber?: string;
  companyId: string;
  userId: string;
  skipSubscriptionCheck: boolean;
}

async function handleOutboundCall(
  adminClient: ReturnType<typeof createClient>,
  params: OutboundCallParams
) {
  const { agentId, contactId, phoneNumber, companyId, userId, skipSubscriptionCheck } = params;

  if (!agentId) return json({ error: "agent_id obbligatorio" }, 400);
  if (!contactId && !phoneNumber) return json({ error: "contact_id o phone_number obbligatorio" }, 400);

  // Get agent
  const { data: agent } = await adminClient
    .from("ai_agents")
    .select("id, elevenlabs_agent_id, name")
    .eq("id", agentId)
    .eq("company_id", companyId)
    .single();

  if (!agent) return json({ error: "Agente non trovato" }, 404);
  if (!agent.elevenlabs_agent_id) return json({ error: "Agente non configurato su ElevenLabs" }, 400);

  // Resolve phone number
  let targetPhone = phoneNumber;
  let targetContactId = contactId;

  if (contactId) {
    const { data: contact } = await adminClient
      .from("marketing_contacts")
      .select("id, phone, optout_call")
      .eq("id", contactId)
      .eq("company_id", companyId)
      .single();

    if (!contact) return json({ error: "Contatto non trovato" }, 404);
    if (contact.optout_call) return json({ error: "Contatto in DND per chiamate." }, 403);
    if (!contact.phone) return json({ error: "Contatto senza numero di telefono" }, 400);

    targetPhone = contact.phone;
    targetContactId = contact.id;
  }

  // Subscription check
  if (!skipSubscriptionCheck) {
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      const { data: subscription } = await adminClient
        .from("ai_subscriptions")
        .select("status, trial_ends_at")
        .eq("company_id", companyId)
        .maybeSingle();

      const isSubActive = subscription?.status === "active" ||
        (subscription?.status === "trial" && subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date());
      if (!isSubActive) {
        return json({ error: "Abbonamento AI non attivo." }, 403);
      }
    }
  }

  // Credit check
  const { data: credits } = await adminClient
    .from("ai_credits")
    .select("balance_eur, calls_blocked")
    .eq("company_id", companyId)
    .maybeSingle();

  if (credits?.calls_blocked || (credits?.balance_eur ?? 0) < 0.04) {
    return json({ error: "Crediti AI insufficienti." }, 402);
  }

  // Get ElevenLabs API key
  const elevenLabsApiKey = await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY");
  if (!elevenLabsApiKey) return json({ error: "ElevenLabs API key non configurata" }, 500);

  // Get phone number config — prefer elevenlabs_phone_number_id (Telnyx-linked)
  const { data: phoneConfig } = await adminClient
    .from("ai_agent_phone_numbers")
    .select("phone_number, elevenlabs_phone_id, elevenlabs_phone_number_id, provider")
    .eq("agent_id", agentId)
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const elPhoneId = phoneConfig?.elevenlabs_phone_number_id || phoneConfig?.elevenlabs_phone_id;
  if (!elPhoneId) {
    return json({ error: "Nessun numero di telefono configurato per questo agente." }, 400);
  }

  // Initiate outbound call via ElevenLabs Telnyx endpoint
  const callRes = await fetch("https://api.elevenlabs.io/v1/convai/telnyx/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": elevenLabsApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agent.elevenlabs_agent_id,
      agent_phone_number_id: elPhoneId,
      to_number: targetPhone,
    }),
  });

  const callData = await callRes.json();

  if (!callRes.ok) {
    console.error("[OUTBOUND] ElevenLabs error:", callData);
    return json({ error: callData?.detail?.message || callData?.detail || "Errore ElevenLabs" }, callRes.status);
  }

  // Save conversation record
  await adminClient.from("ai_agent_conversations").insert({
    agent_id: agent.id,
    company_id: companyId,
    contact_id: targetContactId || null,
    elevenlabs_conversation_id: callData.conversation_id || null,
    call_direction: "outbound",
    status: "in_progress",
    duration_seconds: 0,
    messages_count: 0,
    metadata: { outbound: true, phone: targetPhone, initiated_by: userId, provider: "telnyx" },
  });

  // Audit log
  await adminClient.from("ai_agent_audit_log").insert({
    company_id: companyId,
    agent_id: agent.id,
    user_id: userId,
    action: "outbound_call_initiated",
    details: {
      contact_id: targetContactId,
      phone: targetPhone,
      elevenlabs_conversation_id: callData.conversation_id,
      provider: "telnyx",
    },
  });

  return json({
    success: true,
    conversation_id: callData.conversation_id,
    message: `Chiamata in uscita avviata verso ${targetPhone}`,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
