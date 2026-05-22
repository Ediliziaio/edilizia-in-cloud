// supabase/functions/ai-ads-image-generate/index.ts
//
// Genera immagini per Meta Ads via OpenAI Images Generation API (gpt-image-1).
// Salva in storage Supabase + crea record in ad_media.
//
// SICUREZZA:
//   • Bearer token utente
//   • Validazione company ownership
//   • Tracking costo in ad_media (per audit)
//
// FLUSSO:
//   1. Riceve prompt + formato (1:1, 4:5, 9:16, 16:9)
//   2. Chiama OpenAI /v1/images/generations
//   3. Riceve immagine base64
//   4. Salva su Supabase Storage bucket `ad-media`
//   5. Insert in ad_media + ritorna public_url
//
// COSTI gpt-image-1 (2026):
//   • 1024x1024: ~0.04 USD
//   • 1024x1536 (4:5/9:16): ~0.06 USD

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-1";
const STORAGE_BUCKET = "ad-media";

interface ImageGenRequest {
  company_id: string;
  prompt: string;
  /** Aspect ratio: 1:1, 4:5, 9:16, 16:9 */
  aspect_ratio?: "1:1" | "4:5" | "9:16" | "16:9";
  /** Quality: standard | hd (più costoso) */
  quality?: "standard" | "hd";
  /** Optional tags per catalogazione */
  tags?: string[];
}

interface ImageGenResponse {
  success: boolean;
  media_id?: string;
  public_url?: string;
  width_px?: number;
  height_px?: number;
  cost_eur_cents?: number;
  error?: string;
  detail?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    if (!OPENAI_API_KEY) {
      return json({ error: "openai_api_key_missing" }, 503, corsHeaders);
    }

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

    let body: ImageGenRequest;
    try {
      body = (await req.json()) as ImageGenRequest;
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

    // Mapping aspect_ratio → size OpenAI
    const ar = body.aspect_ratio ?? "1:1";
    const size =
      ar === "1:1" ? "1024x1024" :
      ar === "4:5" ? "1024x1280" :
      ar === "9:16" ? "1024x1820" :
      ar === "16:9" ? "1820x1024" :
      "1024x1024";

    const quality = body.quality ?? "standard";

    // SAFETY filter: prompt rinforzato anti-claim
    const enhancedPrompt = `${body.prompt}

VINCOLI:
- Realistico, fotografico, no rendering 3D cartoonesco
- Italia, contesto edilizia residenziale realistico
- Niente testo sull'immagine (verrà aggiunto dopo)
- Niente persone con volti molto riconoscibili (privacy)
- Tono affidabile, professionale, no claim esagerati
- Light: naturale, ora dorata o studio neutro`;

    // CHIAMATA OPENAI
    const openaiResp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: enhancedPrompt,
        size,
        quality,
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!openaiResp.ok) {
      const text = await openaiResp.text();
      console.error("[ai-ads-image-generate] openai_failed", text);
      return json({
        success: false,
        error: "openai_api_error",
        detail: text.substring(0, 500),
      }, 502, corsHeaders);
    }

    const openaiData = await openaiResp.json() as {
      data?: Array<{ b64_json: string; revised_prompt?: string }>;
    };
    const b64 = openaiData.data?.[0]?.b64_json;
    if (!b64) {
      return json({ error: "no_image_returned" }, 502, corsHeaders);
    }

    // DECODE base64 → bytes
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // UPLOAD su Storage
    const ext = "png";
    const fileName = `${body.company_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, bytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadErr) {
      // Se bucket non esiste, crealo
      if (String(uploadErr.message).includes("not found")) {
        await admin.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10 MB
        });
        // Riprova
        const retry = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, bytes, { contentType: "image/png" });
        if (retry.error) {
          return json({ error: "upload_failed", detail: String(retry.error.message) }, 500, corsHeaders);
        }
      } else {
        return json({ error: "upload_failed", detail: String(uploadErr.message) }, 500, corsHeaders);
      }
    }

    const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    const publicUrl = pub.publicUrl;

    // Calcolo costo approssimativo (in centesimi EUR)
    const costEurCents =
      quality === "hd"
        ? ar === "1:1"
          ? 7
          : 12
        : ar === "1:1"
        ? 4
        : 6;

    // INSERT in ad_media
    const [widthStr, heightStr] = size.split("x");
    const { data: media, error: mediaErr } = await admin
      .from("ad_media")
      .insert({
        company_id: body.company_id,
        name: body.prompt.substring(0, 80),
        kind: "image",
        source: "ai_generated",
        storage_bucket: STORAGE_BUCKET,
        storage_path: fileName,
        public_url: publicUrl,
        width_px: parseInt(widthStr, 10),
        height_px: parseInt(heightStr, 10),
        mime_type: "image/png",
        aspect_ratio: ar,
        ai_prompt: body.prompt,
        ai_model: OPENAI_IMAGE_MODEL,
        ai_provider: "openai",
        ai_cost_eur_cents: costEurCents,
        tags: body.tags ?? [],
        created_by: user.id,
      })
      .select("id")
      .single();

    if (mediaErr) {
      const msg = String(mediaErr.message ?? "");
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({
          error: "schema_not_applied",
          detail: "Migration 20260522150000 (ad_media) non applicata.",
        }, 503, corsHeaders);
      }
      return json({ error: "ad_media_insert_failed", detail: msg }, 500, corsHeaders);
    }

    const result: ImageGenResponse = {
      success: true,
      media_id: media?.id,
      public_url: publicUrl,
      width_px: parseInt(widthStr, 10),
      height_px: parseInt(heightStr, 10),
      cost_eur_cents: costEurCents,
    };
    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-ads-image-generate] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
