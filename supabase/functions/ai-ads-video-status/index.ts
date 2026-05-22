// supabase/functions/ai-ads-video-status/index.ts
//
// Polling endpoint: controlla lo stato di una prediction Replicate.
// Quando completed: scarica il video, lo carica su Supabase Storage,
// inserisce un record in ad_media e aggiorna ad_video_jobs.
//
// Chiamato dal frontend ogni 4s finché status = "succeeded" | "failed".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const STORAGE_BUCKET = "ad-media";

interface StatusRequest {
  company_id: string;
  job_id: string;
  replicate_id: string;
  replicate_get_url?: string;
  // Per salvare in ad_media quando done
  effect_id?: string;
  aspect_ratio?: string;
  duration_seconds?: number;
}

const fn = (payload: unknown, status: number, cors: Record<string, string>): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fn({ error: "method_not_allowed" }, 405, corsHeaders);

  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
  if (!replicateToken) return fn({ error: "provider_not_configured" }, 501, corsHeaders);

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

    let body: StatusRequest;
    try {
      body = (await req.json()) as StatusRequest;
    } catch {
      return fn({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.replicate_id) return fn({ error: "replicate_id_required" }, 400, corsHeaders);

    // Poll Replicate
    const getUrl = body.replicate_get_url
      ?? `https://api.replicate.com/v1/predictions/${body.replicate_id}`;

    const replicateRes = await fetch(getUrl, {
      headers: { Authorization: `Token ${replicateToken}` },
    });

    if (!replicateRes.ok) {
      return fn({ error: "replicate_error", status_code: replicateRes.status }, 502, corsHeaders);
    }

    const prediction = await replicateRes.json() as {
      id: string;
      status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
      output?: string | string[];
      error?: string;
      metrics?: { predict_time?: number };
    };

    // If still processing — return status immediately
    if (prediction.status === "starting" || prediction.status === "processing") {
      return fn({ status: "processing", replicate_status: prediction.status }, 200, corsHeaders);
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      // Update DB record if exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("ad_video_jobs")
        .update({ status: "failed", error_message: prediction.error ?? "Generation failed", completed_at: new Date().toISOString() })
        .eq("replicate_id", body.replicate_id)
        .eq("company_id", body.company_id)
        .catch(() => { /* table might not exist */ });

      return fn({ status: "failed", error: prediction.error ?? "Generation failed or canceled" }, 200, corsHeaders);
    }

    // ── succeeded ──────────────────────────────────────────────────────────────

    // Extract video URL (output can be a string or array)
    const rawOutput = prediction.output;
    const videoUrl: string | null = Array.isArray(rawOutput)
      ? (rawOutput[rawOutput.length - 1] as string ?? null)
      : (rawOutput ?? null);

    if (!videoUrl) {
      return fn({ status: "failed", error: "No video URL in Replicate output" }, 200, corsHeaders);
    }

    // Download video from Replicate CDN
    let storedPublicUrl = videoUrl; // fallback: use Replicate URL directly
    let mediaId: string | null = null;

    try {
      const videoRes = await fetch(videoUrl);
      if (videoRes.ok) {
        const arrayBuffer = await videoRes.arrayBuffer();
        const videoBytes = new Uint8Array(arrayBuffer);

        // Upload to Supabase Storage
        const ext = videoUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "mp4";
        const storagePath = `${body.company_id}/video-ai-${Date.now()}.${ext}`;

        const { data: uploadData } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, videoBytes, {
            contentType: "video/mp4",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadData) {
          const { data: urlData } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
          storedPublicUrl = urlData.publicUrl;

          // Insert in ad_media
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: mediaRow } = await (admin as any)
            .from("ad_media")
            .insert({
              company_id: body.company_id,
              name: `Video AI — ${body.effect_id ?? "generato"} — ${new Date().toLocaleDateString("it")}`,
              kind: "video",
              source: "ai_generated",
              storage_bucket: STORAGE_BUCKET,
              storage_path: storagePath,
              public_url: storedPublicUrl,
              aspect_ratio: body.aspect_ratio ?? "9:16",
              duration_seconds: body.duration_seconds ?? 5,
              file_size_bytes: videoBytes.byteLength,
              mime_type: "video/mp4",
              tags: ["video-ai", body.effect_id ?? "generated"],
              ai_prompt: body.effect_id,
            })
            .select("id")
            .single()
            .catch(() => ({ data: null }));

          mediaId = mediaRow?.id ?? null;
        }
      }
    } catch (e) {
      console.warn("[ai-ads-video-status] Storage upload failed, using Replicate URL:", e);
    }

    // Update DB job record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("ad_video_jobs")
      .update({
        status: "succeeded",
        output_url: storedPublicUrl,
        media_id: mediaId,
        completed_at: new Date().toISOString(),
        predict_time_seconds: prediction.metrics?.predict_time,
      })
      .eq("replicate_id", body.replicate_id)
      .eq("company_id", body.company_id)
      .catch(() => { /* table might not exist */ });

    return fn({
      status: "succeeded",
      video_url: storedPublicUrl,
      media_id: mediaId,
      predict_time_seconds: prediction.metrics?.predict_time,
    }, 200, corsHeaders);

  } catch (e) {
    console.error("[ai-ads-video-status] uncaught", e);
    return fn({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});
