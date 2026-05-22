// supabase/functions/ai-ads-video-generate/index.ts
//
// Genera video brevi per Meta Ads via provider AI (Runway Gen-3 / Pika).
//
// STATO: SCAFFOLD v1 — l'integrazione richiede:
//   • API key Runway / Pika / Luma (a scelta)
//   • Polling job status (la generazione video richiede minuti)
//   • Upload finale su Supabase Storage + record ad_media
//
// COSTI tipici (2026):
//   • Runway Gen-3 Alpha Turbo 5s: ~0.50 USD
//   • Pika 2.0 5s: ~0.30 USD
//
// Per ora ritorna 501 not_implemented con istruzioni per attivare.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface VideoGenRequest {
  company_id: string;
  prompt: string;
  duration_seconds?: 5 | 10 | 15;
  aspect_ratio?: "1:1" | "9:16" | "16:9";
  provider?: "runway" | "pika" | "luma";
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: VideoGenRequest;
    try {
      body = (await req.json()) as VideoGenRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }
    if (!body.company_id || !body.prompt || body.prompt.length < 10) {
      return json({ error: "prompt_too_short" }, 400, corsHeaders);
    }

    // AUTHZ
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id !== body.company_id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isSA = (roles ?? []).some((r) => r.role === "super_admin");
      if (!isSA) return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // Verifica disponibilità provider
    const provider = body.provider ?? "runway";
    const apiKeyMap: Record<string, string | undefined> = {
      runway: Deno.env.get("RUNWAY_API_KEY"),
      pika: Deno.env.get("PIKA_API_KEY"),
      luma: Deno.env.get("LUMA_API_KEY"),
    };
    const apiKey = apiKeyMap[provider];

    if (!apiKey) {
      return json({
        error: "provider_not_configured",
        detail: `${provider.toUpperCase()}_API_KEY non configurato nei Supabase Secrets.`,
        available_providers: Object.entries(apiKeyMap)
          .filter(([, v]) => !!v)
          .map(([k]) => k),
        next_steps: [
          "1. Crea account su Runway (runwayml.com) / Pika (pika.art) / Luma (lumalabs.ai)",
          "2. Genera API key dalla dashboard provider",
          `3. Salva in Supabase Dashboard > Settings > Secrets come ${provider.toUpperCase()}_API_KEY`,
        ],
      }, 501, corsHeaders);
    }

    // TODO v2: implementazione reale
    // Runway esempio:
    // const res = await fetch("https://api.runwayml.com/v1/text-to-video", {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     prompt: body.prompt,
    //     duration: body.duration_seconds ?? 5,
    //     ratio: body.aspect_ratio ?? "9:16",
    //   }),
    // });
    // Poi polling job_id finché complete, scarica url, upload su Storage, insert ad_media.

    return json({
      success: false,
      status: "not_implemented",
      detail: "Video generation in roadmap. Per ora usa solo immagini AI o upload video manualmente.",
      provider_requested: provider,
    }, 501, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-video-generate] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
