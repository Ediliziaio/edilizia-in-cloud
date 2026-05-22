// supabase/functions/ai-ads-video-generate/index.ts
//
// Genera video brevi per Meta Ads via Replicate API.
//
// Modelli supportati:
//   • img2vid — stability-ai/stable-video-diffusion (foto → video 3-5s)
//   • txt2vid — minimax/video-01 (testo → video 5s, alta qualità)
//
// Flusso:
//   1. Avvia prediction su Replicate → restituisce { job_id, replicate_id }
//   2. Il client fa polling via ai-ads-video-status
//   3. Quando done: video scaricato e salvato in Storage → record in ad_media
//
// Config richiesta: REPLICATE_API_TOKEN nei Supabase Secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";

// ─── Replicate models ─────────────────────────────────────────────────────────

const MODELS = {
  // Stable Video Diffusion — immagine → video 3-5s
  img2vid: {
    version: "3f0457e4619daac51203dedb472816fd4af51f3aa966857c1d8a741f26c4df4",
    cost_eur_cents_est: 3,
  },
  // MiniMax Video-01 — testo → video 5s, qualità cinematica
  txt2vid: {
    model: "minimax/video-01",
    cost_eur_cents_est: 20,
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoGenRequest {
  company_id: string;
  mode: "img2vid" | "txt2vid";
  // img2vid
  image_url?: string;
  // txt2vid
  prompt?: string;
  // common
  effect_motion?: string;    // es. "slow zoom in, cinematic"
  duration_seconds?: 3 | 5 | 8;
  aspect_ratio?: "9:16" | "1:1" | "16:9";
  effect_id?: string;        // slug dell'effetto (es. "drone-rise")
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const fn = (payload: unknown, status: number, cors: Record<string, string>): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fn({ error: "method_not_allowed" }, 405, corsHeaders);

  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
  if (!replicateToken) {
    return fn({
      error: "provider_not_configured",
      provider: "replicate",
      detail: "REPLICATE_API_TOKEN non impostato nei Supabase Secrets.",
      setup_steps: [
        "1. Crea account su replicate.com (gratuito per iniziare)",
        "2. Dashboard → Account → API Tokens → Create token",
        "3. Supabase Dashboard → Project Settings → Secrets → Add REPLICATE_API_TOKEN",
        "4. Riavvia le edge functions dal Supabase Dashboard",
      ],
    }, 501, corsHeaders);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fn({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return fn({ error: "unauthorized" }, 401, corsHeaders);

    let body: VideoGenRequest;
    try {
      body = (await req.json()) as VideoGenRequest;
    } catch {
      return fn({ error: "invalid_json" }, 400, corsHeaders);
    }

    // Authz
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id !== body.company_id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isSA = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
      if (!isSA) return fn({ error: "forbidden" }, 403, corsHeaders);
    }

    // Validate input
    if (body.mode === "img2vid" && !body.image_url) {
      return fn({ error: "image_url_required" }, 400, corsHeaders);
    }
    if (body.mode === "txt2vid" && (!body.prompt || body.prompt.length < 10)) {
      return fn({ error: "prompt_too_short" }, 400, corsHeaders);
    }

    // Build Replicate prediction payload
    const duration = body.duration_seconds ?? 5;
    const fps = 6; // 6fps × 5s = 30 frames (SVD standard)
    const motionStrength = body.effect_motion?.includes("fast") ? 200 : body.effect_motion?.includes("slow") ? 60 : 127;

    let predictionPayload: Record<string, unknown>;
    let predictionUrl: string;

    if (body.mode === "img2vid") {
      // Stable Video Diffusion
      predictionUrl = "https://api.replicate.com/v1/predictions";
      predictionPayload = {
        version: MODELS.img2vid.version,
        input: {
          input_image: body.image_url,
          sizing_strategy: "crop_to_16_9",
          frames_per_second: fps,
          motion_bucket_id: motionStrength,
          cond_aug: 0.02,
          decoding_t: 7,
          video_length: duration <= 3 ? "14_frames_with_svd" : "25_frames_with_svd_xt",
        },
      };
    } else {
      // MiniMax Video-01 (text to video)
      predictionUrl = "https://api.replicate.com/v1/models/minimax/video-01/predictions";
      const aspectMap = { "9:16": "9:16", "1:1": "1:1", "16:9": "16:9" };
      const ar = aspectMap[body.aspect_ratio ?? "9:16"];

      // Build enriched prompt with motion effect
      const motionPart = body.effect_motion ? ` Motion: ${body.effect_motion}.` : "";
      const fullPrompt = `${body.prompt}${motionPart} High quality, professional, ${ar} aspect ratio, suitable for social media advertising.`;

      predictionPayload = {
        input: {
          prompt: fullPrompt,
          prompt_optimizer: true,
        },
      };
    }

    // Start Replicate prediction
    const replicateRes = await fetch(predictionUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${replicateToken}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify(predictionPayload),
    });

    if (!replicateRes.ok) {
      const err = await replicateRes.text();
      console.error("[ai-ads-video-generate] Replicate error", replicateRes.status, err);
      return fn({ error: "replicate_error", detail: err }, 502, corsHeaders);
    }

    const prediction = await replicateRes.json() as { id: string; status: string; urls?: { get: string } };

    // Store job in ad_video_jobs (best-effort — table might not exist yet)
    const jobData = {
      company_id: body.company_id,
      user_id: user.id,
      replicate_id: prediction.id,
      replicate_get_url: prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`,
      status: "processing",
      mode: body.mode,
      input_image_url: body.image_url ?? null,
      input_prompt: body.prompt ?? null,
      effect_id: body.effect_id ?? null,
      effect_motion: body.effect_motion ?? null,
      duration_seconds: duration,
      aspect_ratio: body.aspect_ratio ?? "9:16",
      cost_eur_cents_est: body.mode === "img2vid" ? MODELS.img2vid.cost_eur_cents_est : MODELS.txt2vid.cost_eur_cents_est,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jobRow, error: jobErr } = await (admin as any)
      .from("ad_video_jobs")
      .insert(jobData)
      .select("id")
      .single();

    if (jobErr) {
      // Table doesn't exist yet — return prediction ID anyway so client can poll
      console.warn("[ai-ads-video-generate] ad_video_jobs table not found, continuing without DB record:", jobErr.message);
    }

    return fn({
      success: true,
      job_id: jobRow?.id ?? `temp-${prediction.id}`,
      replicate_id: prediction.id,
      replicate_get_url: jobData.replicate_get_url,
      status: "processing",
      mode: body.mode,
      cost_eur_cents_est: jobData.cost_eur_cents_est,
    }, 200, corsHeaders);

  } catch (e) {
    console.error("[ai-ads-video-generate] uncaught", e);
    return fn({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});
