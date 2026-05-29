/**
 * ai-voice-push-to-talk — Feature #14
 *
 * Endpoint per app mobile: operaio in cantiere preme bottone, parla, audio
 * arriva qui → trascritto → intent extraction → azioni DB:
 *
 *   "Abbiamo finito 30 pannelli bancale 3 e usato 25 ottimizzatori"
 *   →
 *   - update orders.progress_percentage per il cantiere corrente
 *   - decremento stock_units degli ottimizzatori
 *   - crea evento giornale_lavori
 *
 * STATO: skeleton opt-in. La trascrizione vera (Whisper / ElevenLabs STT)
 * parte SOLO se OPENAI_API_KEY o ELEVENLABS_API_KEY è settato.
 * Il NLU di intent extraction passa via Claude se ANTHROPIC_API_KEY presente.
 *
 * Senza env: ritorna 503 "feature disabled" e crea proposta `voice_command_received`
 * che il capocantiere può rivedere manualmente nell'app.
 *
 * Input (multipart o body):
 *   {
 *     audio_url: string,         // Storage Supabase del file audio
 *     order_id?: string,         // cantiere corrente dell'operaio
 *     speaker_id: string,        // user_id dell'operaio (auth richiesta)
 *     duration_sec?: number,
 *   }
 *
 * Output:
 *   {
 *     transcription: string,
 *     detected_intents: Array<{kind, payload, confidence}>,
 *     actions_executed: number,
 *     proposals_created: number,
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { anthropicMessages, hasAiProvider } from "../_shared/anthropicMessages.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  audio_url: string;
  order_id?: string;
  speaker_id: string;
  duration_sec?: number;
}

const NLU_SYSTEM_PROMPT = `Sei un assistente per cantieri edili. Estrai dal testo vocale dell'operaio:
- progress_update: { percentage?: number, milestone?: string, posts?: number }
- materials_used: Array<{ name: string, quantity: number, unit?: string }>
- materials_received: Array<{ name: string, quantity: number, supplier?: string }>
- generic_note: string (se nient'altro matcha)
Restituisci JSON con keys: intents (array), confidence (0-1), summary (string IT).
NIENTE testo extra, solo JSON.`;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as Payload;
    if (!body.audio_url) return errorResponse("audio_url mancante", 400, cors);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey || !hasAiProvider()) {
      return jsonResponse({
        ok: false,
        reason: "no_provider",
        hint: "Configura OPENAI_API_KEY (STT Whisper) + OPENROUTER_API_KEY (NLU)",
      }, 503, cors);
    }

    // Risolvi company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) return errorResponse("company not found", 400, cors);

    // 1) STT via OpenAI Whisper
    let transcription = "";
    try {
      // Download audio bytes via fetch del signed URL
      const audioRes = await fetch(body.audio_url);
      if (!audioRes.ok) throw new Error(`download audio: HTTP ${audioRes.status}`);
      const audioBlob = await audioRes.blob();
      const form = new FormData();
      form.append("file", audioBlob, "audio.webm");
      form.append("model", "whisper-1");
      form.append("language", "it");
      const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}` },
        body: form,
      });
      if (!sttRes.ok) throw new Error(`STT: ${(await sttRes.text()).slice(0, 200)}`);
      const sttJson = await sttRes.json();
      transcription = sttJson.text ?? "";
    } catch (e) {
      return errorResponse(`STT error: ${e instanceof Error ? e.message : String(e)}`, 500, cors);
    }

    if (!transcription.trim()) {
      return jsonResponse({ ok: false, reason: "empty_transcription" }, 200, cors);
    }

    // 2) Intent extraction via Claude
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let intents: any = null;
    try {
      const nluJson = await anthropicMessages({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: NLU_SYSTEM_PROMPT,
        messages: [{ role: "user", content: transcription }],
      });
      const text = nluJson?.content?.[0]?.text ?? "{}";
      const match = text.match(/\{[\s\S]*\}/);
      intents = match ? JSON.parse(match[0]) : null;
    } catch (e) {
      console.warn("[voice-ptt] NLU error:", e);
    }

    // 3) Crea proposta `voice_command_received` per audit + revisione
    //    Le azioni concrete (update progress, decremento stock) sono delegate
    //    al handler silvio-execute-action quando la policy company è settata.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).rpc("create_proactive_proposal", {
      p_company_id: companyId,
      p_user_id: userId,
      p_persona_key: "operations",
      p_action_type: "voice_command_received",
      p_summary: `Voice (${body.duration_sec ?? "?"}s): "${transcription.slice(0, 100)}…"`,
      p_payload: {
        order_id: body.order_id ?? null,
        speaker_id: body.speaker_id,
        audio_url: body.audio_url,
        transcription,
        intents,
        duration_sec: body.duration_sec ?? null,
      },
      p_signal_type: "voice_push_to_talk",
      p_signal_entity_id: body.order_id ?? null,
      p_signal_metadata: { duration_sec: body.duration_sec ?? null },
      p_risk_level: "yellow",
      p_ttl_days: 3,
    });

    return jsonResponse({
      ok: true,
      transcription,
      intents,
      proposals_created: 1,
    }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(e instanceof Error ? e.message : String(e), 500, cors);
  }
});
