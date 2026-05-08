/**
 * Edge Function: silvio-transcribe-audio
 *
 * Riceve un file audio (multipart/form-data) e lo trascrive via OpenAI Whisper.
 * Ritorna il testo trascritto in italiano.
 *
 * Limiti:
 *   - Max 25 MB (Whisper API limit)
 *   - Formati: webm, mp3, wav, m4a, ogg, mp4
 *
 * Body:
 *   - multipart/form-data con campo "audio"
 *
 * Response:
 *   { text: "trascrizione...", duration_seconds: 12.5, model: "whisper-1" }
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chargeAndLogDirect, estimateWhisperCostUsd } from "../_shared/ai-provider/directApi.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const WHISPER_MODEL = "whisper-1"; // OpenAI

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    // Resolve company per logging
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId: string | null = profile?.company_id ?? null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    // Parse multipart
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    if (!(audioFile instanceof File)) return errorResponse("Campo 'audio' mancante", 400, corsHeaders);
    if (audioFile.size > MAX_SIZE_BYTES) {
      return errorResponse(`File troppo grande (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)`, 400, corsHeaders);
    }
    const audioHash = await fileSha256(audioFile);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return errorResponse("OPENAI_API_KEY non configurata", 500, corsHeaders);

    // Forward to OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, audioFile.name || "audio.webm");
    whisperForm.append("model", WHISPER_MODEL);
    whisperForm.append("language", "it");
    whisperForm.append("response_format", "verbose_json");

    const start = Date.now();
    const res = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: whisperForm,
      timeoutMs: 60_000,
    });
    const durationMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
      console.error("[silvio-transcribe] Whisper error:", res.status, errText.slice(0, 300));
      return errorResponse(`Whisper API ${res.status}: ${errText.slice(0, 200)}`, 500, corsHeaders);
    }

    const result = await res.json();
    const text = result?.text ?? "";
    const durationAudio = result?.duration ?? null;

    const charge = await chargeAndLogDirect({
      supabase: supabaseAdmin,
      company_id: companyId,
      task_kind: "audio_transcription",
      model_used: `openai/${WHISPER_MODEL}`,
      cost_usd_real: estimateWhisperCostUsd(durationAudio),
      cost_is_estimated: true,
      metadata: {
        user_id: userId,
        persona_key: "silvio",
        audio_seconds: durationAudio,
        file_size_bytes: audioFile.size,
        audio_sha256: audioHash,
        duration_ms: durationMs,
      },
    });

    return jsonResponse({
      text,
      duration_seconds: durationAudio,
      model: WHISPER_MODEL,
      duration_ms: durationMs,
      ledger_id: charge.usage_log_id ?? null,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-transcribe-audio] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
