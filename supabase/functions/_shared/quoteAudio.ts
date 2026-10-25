export const QUOTE_AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export const QUOTE_AUDIO_BODY_MAX_BYTES = 2_850_000;
export const QUOTE_AUDIO_MODEL = 'openai/whisper-1' as const;
export type QuoteAudioRequest = { version: 1; companyId: string; sessionId: string; turnId: string; audio: { mime: string; base64: string } };
export type QuoteAudioResult = { version: 1; turnId: string; text: string; model: typeof QUOTE_AUDIO_MODEL; durationSeconds: number; receipt: { ledgerId: string; estimated: true; costUsd: number } };
const uuid = (v: unknown): string => { if (typeof v !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v)) throw new Error('Identificativo audio non valido.'); return v; };
export function readQuoteAudioRequest(value: unknown): QuoteAudioRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Richiesta audio non valida.');
  const r = value as Record<string, unknown>; const a = r.audio as Record<string, unknown> | undefined;
  if (r.version !== 1 || !a || typeof a !== 'object' || Array.isArray(a) || typeof a.mime !== 'string' || !['audio/webm', 'audio/mp4', 'audio/wav', 'audio/ogg'].includes(a.mime)
    || typeof a.base64 !== 'string' || a.base64.length > Math.ceil(QUOTE_AUDIO_MAX_BYTES / 3) * 4 || a.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64)) throw new Error('Audio non valido o oltre 2 MB.');
  const bytes = atob(a.base64);
  if (bytes.length < 44 || bytes.length > QUOTE_AUDIO_MAX_BYTES) throw new Error('Audio vuoto o troppo grande.');
  const magic = a.mime === 'audio/webm' ? bytes.startsWith('\x1a\x45\xdf\xa3') : a.mime === 'audio/mp4' ? bytes.slice(4, 8) === 'ftyp' : a.mime === 'audio/ogg' ? bytes.startsWith('OggS') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WAVE';
  if (!magic) throw new Error('Il formato non corrisponde alla registrazione.');
  return { version: 1, companyId: uuid(r.companyId), sessionId: uuid(r.sessionId), turnId: uuid(r.turnId), audio: { mime: a.mime, base64: a.base64 } };
}
export function quoteAudioBlob(request: QuoteAudioRequest): Blob {
  return new Blob([Uint8Array.from(atob(request.audio.base64), c => c.charCodeAt(0))], { type: request.audio.mime });
}
export function readQuoteAudioResult(value: unknown): QuoteAudioResult {
  const r = value as QuoteAudioResult | null;
  if (!r || r.version !== 1 || r.model !== QUOTE_AUDIO_MODEL || typeof r.text !== 'string' || !r.text.trim() || r.text.length > 12000 || typeof r.durationSeconds !== 'number' || !Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0 || r.durationSeconds > 125
    || !r.receipt || r.receipt.estimated !== true || typeof r.receipt.ledgerId !== 'string' || !r.receipt.ledgerId || typeof r.receipt.costUsd !== 'number' || !Number.isFinite(r.receipt.costUsd) || r.receipt.costUsd < 0) throw new Error('Trascrizione o ricevuta non verificabili.');
  return { ...r, turnId: uuid(r.turnId), text: r.text.trim() };
}
