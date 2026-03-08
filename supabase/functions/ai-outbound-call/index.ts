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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) return json({ error: "No company" }, 400);
    const companyId = profile.company_id;

    const { agent_id, contact_id, phone_number } = await req.json();

    if (!agent_id) return json({ error: "agent_id obbligatorio" }, 400);
    if (!contact_id && !phone_number) return json({ error: "contact_id o phone_number obbligatorio" }, 400);

    // Get agent
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("id, elevenlabs_agent_id, llm_model, tts_model, name")
      .eq("id", agent_id)
      .eq("company_id", companyId)
      .single();

    if (!agent) return json({ error: "Agente non trovato" }, 404);
    if (!agent.elevenlabs_agent_id) return json({ error: "Agente non configurato su ElevenLabs" }, 400);

    // Resolve phone number from contact
    let targetPhone = phone_number;
    let targetContactId = contact_id;

    if (contact_id) {
      const { data: contact } = await adminClient
        .from("marketing_contacts")
        .select("id, phone, optout_call")
        .eq("id", contact_id)
        .eq("company_id", companyId)
        .single();

      if (!contact) return json({ error: "Contatto non trovato" }, 404);

      // FIX 8: DND check
      if (contact.optout_call) {
        return json({ error: "Contatto in DND per chiamate. Chiamata non consentita." }, 403);
      }

      if (!contact.phone) return json({ error: "Contatto senza numero di telefono" }, 400);
      targetPhone = contact.phone;
      targetContactId = contact.id;
    }

    // Check AI subscription
    const { data: subscription } = await adminClient
      .from("ai_subscriptions")
      .select("status, trial_ends_at")
      .eq("company_id", companyId)
      .maybeSingle();

    // Check super_admin bypass
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      const isSubActive = subscription?.status === "active" ||
        (subscription?.status === "trial" && subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date());
      if (!isSubActive) {
        return json({ error: "Abbonamento AI non attivo. Attiva il modulo Agenti AI." }, 403);
      }
    }

    // Check credits
    const { data: credits } = await adminClient
      .from("ai_credits")
      .select("balance_eur, calls_blocked")
      .eq("company_id", companyId)
      .maybeSingle();

    if (credits?.calls_blocked || (credits?.balance_eur ?? 0) < 0.04) {
      return json({ error: "Crediti AI insufficienti. Ricarica il saldo." }, 402);
    }

    // Get ElevenLabs API key from platform_settings
    const { data: settings } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", "elevenlabs_api_key")
      .maybeSingle();

    const elevenLabsApiKey = settings?.value;
    if (!elevenLabsApiKey) {
      return json({ error: "ElevenLabs API key non configurata" }, 500);
    }

    // Get phone number config for this agent
    const { data: phoneConfig } = await adminClient
      .from("ai_agent_phone_numbers")
      .select("phone_number, elevenlabs_phone_id, provider")
      .eq("agent_id", agent_id)
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();

    if (!phoneConfig?.elevenlabs_phone_id) {
      return json({ error: "Nessun numero di telefono configurato per questo agente. Configura un numero nella sezione Numeri Telefono." }, 400);
    }

    // Initiate outbound call via ElevenLabs API
    const callRes = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: agent.elevenlabs_agent_id,
        agent_phone_number_id: phoneConfig.elevenlabs_phone_id,
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
      metadata: { outbound: true, phone: targetPhone, initiated_by: user.id },
    });

    // Audit log
    await adminClient.from("ai_agent_audit_log").insert({
      company_id: companyId,
      agent_id: agent.id,
      user_id: user.id,
      action: "outbound_call_initiated",
      details: {
        contact_id: targetContactId,
        phone: targetPhone,
        elevenlabs_conversation_id: callData.conversation_id,
      },
    });

    return json({
      success: true,
      conversation_id: callData.conversation_id,
      message: `Chiamata in uscita avviata verso ${targetPhone}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("ai-outbound-call error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
