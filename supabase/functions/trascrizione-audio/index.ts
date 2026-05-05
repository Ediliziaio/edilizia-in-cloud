import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import {
  buildStableAiIdempotencyKey,
  chargeDirectAiCall,
  estimateWhisperCostUsd,
} from "../_shared/directAiLedger.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

async function blobSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId: string | null = profile?.company_id ?? null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsH);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH);

    const formData = await req.formData();
    const audioBlob = formData.get("audio") as Blob;
    const language = (formData.get("language") as string) ?? "it";
    const hintedDuration = Number(formData.get("duration_seconds") ?? formData.get("duration_sec") ?? 0) || null;
    if (!(audioBlob instanceof Blob)) return errorResponse("Campo 'audio' mancante", 400, corsH);
    if (audioBlob.size > 25 * 1024 * 1024) return errorResponse("File audio troppo grande (max 25MB)", 413, corsH);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return errorResponse("OPENAI_API_KEY non configurata", 500, corsH);
    const audioHash = await blobSha256(audioBlob);

    const openaiFormData = new FormData();
    openaiFormData.append("file", audioBlob, "audio.webm");
    openaiFormData.append("model", "whisper-1");
    openaiFormData.append("language", language);
    openaiFormData.append("response_format", "verbose_json");

    const start = Date.now();
    const openaiRes = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: openaiFormData,
      timeoutMs: 60_000,
    });
    const durationMs = Date.now() - start;

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI error: ${openaiRes.status} ${errText}`);
    }

    const data = await openaiRes.json();
    const audioDuration = Number(data.duration ?? hintedDuration ?? 0) || null;
    const idempotencyKey = await buildStableAiIdempotencyKey("audio_transcription", [
      companyId,
      userId,
      language,
      audioBlob.size,
      audioDuration ?? hintedDuration ?? null,
      audioHash,
    ]);
    const charge = await chargeDirectAiCall({
      supabase: supabaseAdmin,
      idempotencyKey,
      companyId,
      userId,
      taskKey: "audio_transcription",
      tierKey: "t2_vision",
      modelUsed: "openai/whisper-1",
      personaKey: null,
      costRealUsd: estimateWhisperCostUsd(audioDuration),
      durationMs,
      metadata: {
        audio_seconds: audioDuration,
        file_size_bytes: audioBlob.size,
        language,
        audio_sha256: audioHash,
      },
    });

    return jsonResponse({ testo: data.text, duration_seconds: audioDuration, ledger_id: charge.ledger_id ?? null });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
});
