import { errorResponse, jsonResponse } from '../_shared/headers.ts';
import { aiRequestHash, runGuardedAiRequest, type GuardDb } from '../_shared/aiRequestGuard.ts';
import { buildStableAiIdempotencyKey } from '../_shared/directAiLedger.ts';
import { chargeAndLogDirect, estimateWhisperCostUsd } from '../_shared/ai-provider/directApi.ts';
import { quoteAudioBlob, QUOTE_AUDIO_MODEL, type QuoteAudioRequest, type QuoteAudioResult } from '../_shared/quoteAudio.ts';
import { segnalaErroreAI } from '../_shared/allarmeAI.ts';

/** Called only after JWT, company, edit permission and company payment gates. */
export async function transcribeQuoteAudio(request: QuoteAudioRequest, db: GuardDb, userId: string, signal: AbortSignal, headers: Record<string, string>): Promise<Response> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return errorResponse('Trascrizione audio non configurata. Registrazione conservata nel browser.', 503, headers);
  signal.throwIfAborted();
  const blob = quoteAudioBlob(request); const audioHash = await aiRequestHash(request.audio);
  const idempotencyKey = await buildStableAiIdempotencyKey('quote_audio_v1', [request.companyId, userId, request.sessionId, request.turnId]);
  let transcript: string | null = null;
  const receipt = await runGuardedAiRequest({ db, companyId: request.companyId, userId, taskKey: 'audio_transcription', idempotencyKey, providerKey: `whisper:${apiKey}`,
    fingerprint: [audioHash, QUOTE_AUDIO_MODEL, 'it'],
    execute: async guard => {
      const ctrl = new AbortController(); const abort = () => ctrl.abort(signal.reason); signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => ctrl.abort(), 60_000);
      const started = Date.now();
      try {
        signal.throwIfAborted();
        const form = new FormData();
        const ext = request.audio.mime === 'audio/mp4' ? 'm4a' : request.audio.mime.split('/')[1];
        form.append('file', blob, `registrazione.${ext}`); form.append('model', 'whisper-1'); form.append('language', 'it'); form.append('response_format', 'verbose_json'); form.append('temperature', '0');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: ctrl.signal });
        if (!response.ok) {
          segnalaErroreAI({provider:'openai',stato:response.status,messaggio:`OpenAI ${response.status}`}, {funzione:'quote_audio',modello:QUOTE_AUDIO_MODEL,companyId:request.companyId});
          await response.body?.cancel();
          await guard.checkpoint({ model: QUOTE_AUDIO_MODEL, generation_id: null, status: 'http_error', http_status: response.status, cost_usd: null, input_tokens: null, output_tokens: null }); throw new Error('AudioProviderError');
        }
        const reader = response.body?.getReader(); if (!reader) throw new Error('AudioEmptyResponse');
        let size = 0; let text = ''; const decoder = new TextDecoder();
        try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 100_000) { await reader.cancel(); throw new Error('AudioResponseTooLarge'); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
        const data = JSON.parse(text) as { text?: unknown; duration?: unknown };
        if (typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0 || typeof data.text !== 'string') throw new Error('AudioUnverifiableResponse');
        await guard.checkpoint({ model: QUOTE_AUDIO_MODEL, generation_id: response.headers.get('x-request-id'), status: 'response', cost_usd: null, input_tokens: null, output_tokens: null });
        const costUsd = estimateWhisperCostUsd(data.duration);
        // Billing follows the verified requested company, never the profile's default.
        const charge = await chargeAndLogDirect({ supabase: db as Parameters<typeof chargeAndLogDirect>[0]['supabase'], company_id: request.companyId, task_kind: 'audio_transcription', model_used: QUOTE_AUDIO_MODEL, cost_usd_real: costUsd, cost_is_estimated: true,
          metadata: { user_id: userId, scope: 'quote_chat_audio', request_key: guard.key, audio_sha256: audioHash, audio_seconds: data.duration, file_size_bytes: blob.size, duration_ms: Date.now() - started } });
        if (!charge.charged || !charge.usage_log_id) throw new Error('AudioLedgerUnconfirmed');
        if (data.duration > 125 || !data.text.trim() || data.text.length > 12000) throw new Error('AudioDurationOrTranscriptInvalid');
        transcript = data.text.trim();
        // Durable deduplication stores receipt/hash only, no audio or transcript.
        return { version: 1 as const, turnId: request.turnId, model: QUOTE_AUDIO_MODEL, durationSeconds: data.duration, receipt: { ledgerId: charge.usage_log_id, estimated: true as const, costUsd } };
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
    }, replay: result => result,
  });
  if (transcript === null) return jsonResponse({ code: 'AUDIO_ALREADY_PROCESSED', error: 'Audio già elaborato. Recupera il testo già ricevuto oppure registra un nuovo messaggio; non ripeto la chiamata a pagamento.' }, 409, headers);
  signal.throwIfAborted();
  return jsonResponse({ ...receipt, text: transcript } satisfies QuoteAudioResult, 200, headers);
}
