import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { userId } = await requireAuth(req, corsHeaders);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return json({ error: "No company" }, 400);
    }

    const { agentId } = await req.json();
    if (!agentId) {
      return json({ error: "agentId richiesto" }, 400);
    }

    // Get agent's LLM+TTS config
    const { data: legacyAgent } = await adminClient
      .from("ai_agents")
      .select("llm_model, tts_model")
      .eq("id", agentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    const { data: v2Agent } = legacyAgent ? { data: null } : await adminClient
      .from("ai_agents_v2")
      .select("llm_model")
      .eq("id", agentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    const agent = legacyAgent ?? v2Agent;

    if (!agent) {
      return json({ error: "Agent not found" }, 404);
    }

    // Get pricing for this combo
    const { data: pricing } = await adminClient
      .from("platform_pricing")
      .select("cost_billed_per_min")
      .eq("llm_model", agent.llm_model)
      .eq("tts_model", (agent as { tts_model?: string | null }).tts_model || "eleven_multilingual_v2")
      .eq("is_active", true)
      .maybeSingle();

    // Richiediamo almeno 1 minuto di chiamata come saldo minimo (non solo €0.04
    // che è il costo al minuto). Così evitiamo che una chiamata parta con saldo
    // sufficiente per 5 secondi e vada subito in negativo.
    const costPerMin = pricing?.cost_billed_per_min || 0.04;
    const minCostPerCall = Math.max(costPerMin * 1, 0.10);

    // Get credits
    const { data: credits } = await adminClient
      .from("ai_credits")
      .select("balance_eur, calls_blocked, blocked_reason")
      .eq("company_id", profile.company_id)
      .maybeSingle();

    const balance = credits?.balance_eur ?? 0;

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
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("check-credits-before-call error:", message);
    return json({ error: message }, 500);
  }
});
