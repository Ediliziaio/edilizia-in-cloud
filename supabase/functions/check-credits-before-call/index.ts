import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return json({ error: "No company" }, 400);
    }

    const { agentId } = await req.json();

    // Get agent's LLM+TTS config
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("llm_model, tts_model")
      .eq("id", agentId)
      .eq("company_id", profile.company_id)
      .single();

    if (!agent) {
      return json({ error: "Agent not found" }, 404);
    }

    // Get pricing for this combo
    const { data: pricing } = await adminClient
      .from("platform_pricing")
      .select("cost_billed_per_min")
      .eq("llm_model", agent.llm_model)
      .eq("tts_model", agent.tts_model || "eleven_multilingual_v2")
      .eq("is_active", true)
      .maybeSingle();

    const minCostPerCall = pricing?.cost_billed_per_min || 0.04;

    // Get credits
    const { data: credits } = await adminClient
      .from("ai_credits")
      .select("balance_eur, calls_blocked, blocked_reason")
      .eq("company_id", profile.company_id)
      .maybeSingle();

    const balance = credits?.balance_eur || 0;

    if (credits?.calls_blocked || balance < minCostPerCall) {
      return json({
        allowed: false,
        reason: credits?.calls_blocked ? (credits.blocked_reason || "balance_zero") : "insufficient_balance",
        balance_eur: balance,
        min_required_eur: minCostPerCall,
      }, 402);
    }

    return json({
      allowed: true,
      balance_eur: balance,
      cost_per_min: minCostPerCall,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("check-credits-before-call error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
