import { createHash } from "node:crypto";

export const LOCAL_FISH_MODEL = "drama-3";
export const LOCAL_FISH_VOICE = "0e36e185d0654d5bac3d24331562a0cc";
export const MAX_LOCAL_AUDIO = 4 * 1024 * 1024;
export const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
export class LocalVoiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Only speech leaves this computer. No agents, webhooks, phone calls or CRM API. */
export function createLocalFishVoice(apiKey = "", fetcher = fetch) {
  const key = apiKey.trim();
  const speechCache = new Map(),
    transcriptionCache = new Map();
  let busy = false;
  const attempts = [];
  const status = () => ({
    configured: !!key,
    provider: "fish_audio",
    model: LOCAL_FISH_MODEL,
    voice: "Giulia",
    asrModel: "transcribe-1",
    maxSeconds: 45,
  });
  async function external(operation) {
    if (!key)
      throw new LocalVoiceError(
        "Manca FISH_API_KEY nel file privato .env.fish.local del server locale.",
        503,
      );
    if (busy)
      throw new LocalVoiceError(
        "La voce sta completando una richiesta. Riprova tra poco.",
        409,
      );
    const now = Date.now();
    while (attempts.length && attempts[0] < now - 60_000) attempts.shift();
    if (attempts.length >= 30)
      throw new LocalVoiceError(
        "Troppe richieste vocali. Attendi un minuto.",
        429,
      );
    attempts.push(now);
    busy = true;
    try {
      return await operation();
    } finally {
      busy = false;
    }
  }
  async function upstream(path, options) {
    let response;
    try {
      response = await fetcher("https://api.fish.audio" + path, {
        ...options,
        headers: { ...options.headers, Authorization: "Bearer " + key },
        signal: AbortSignal.timeout(45_000),
        redirect: "error",
      });
    } catch {
      throw new LocalVoiceError(
        "Fish non risponde. Puoi continuare per iscritto o riprovare la voce.",
        502,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      const messages = {
        401: "La chiave Fish locale non è valida.",
        402: "Credito Fish insufficiente per la prova vocale.",
        403: "La chiave Fish non può usare questa voce o questo modello.",
        429: "Limite Fish raggiunto. Attendi e riprova.",
      };
      throw new LocalVoiceError(
        messages[response.status] ||
          "Fish non ha completato la richiesta vocale.",
        502,
      );
    }
    return response;
  }
  async function speech(text) {
    if (typeof text !== "string" || !text.trim() || text.length > 2000)
      throw new LocalVoiceError("Risposta vocale non valida.");
    const id = digest(text);
    if (speechCache.has(id)) return speechCache.get(id);
    return external(async () => {
      const response = await upstream("/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          model: LOCAL_FISH_MODEL,
        },
        body: JSON.stringify({
          text,
          reference_id: LOCAL_FISH_VOICE,
          format: "mp3",
          language: "it-IT",
          latency: "balanced",
          normalize: true,
          temperature: 0.6,
          prosody: { speed: 1.02 },
        }),
      });
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024)
          throw new LocalVoiceError("Audio Fish troppo lungo.", 502);
        chunks.push(Buffer.from(chunk));
      }
      const audio = Buffer.concat(chunks);
      if (audio.length < 100)
        throw new LocalVoiceError("Fish ha restituito un audio vuoto.", 502);
      if (speechCache.size >= 30)
        speechCache.delete(speechCache.keys().next().value);
      speechCache.set(id, audio);
      return audio;
    });
  }
  async function transcribe(audio, mime) {
    if (
      !AUDIO_TYPES.has(mime) ||
      audio.length < 100 ||
      audio.length > MAX_LOCAL_AUDIO
    )
      throw new LocalVoiceError(
        "Registrazione non valida. Registra una risposta breve e riprova.",
      );
    const id = digest(audio);
    if (transcriptionCache.has(id)) return transcriptionCache.get(id);
    return external(async () => {
      const form = new FormData();
      form.set(
        "audio",
        new Blob([audio], { type: mime }),
        "risposta." +
          {
            "audio/webm": "webm",
            "audio/ogg": "ogg",
            "audio/mp4": "m4a",
            "audio/wav": "wav",
            "audio/x-wav": "wav",
            "audio/mpeg": "mp3",
          }[mime],
      );
      form.set("language", "it");
      form.set("ignore_timestamps", "true");
      const response = await upstream("/v1/asr", {
        method: "POST",
        headers: { model: "transcribe-1" },
        body: form,
      });
      const result = await response.json().catch(() => null);
      if (
        !result ||
        typeof result.text !== "string" ||
        !result.text.trim() ||
        result.text.length > 2000 ||
        !Number.isFinite(result.duration) ||
        result.duration > 50
      )
        throw new LocalVoiceError(
          "Non ho capito la registrazione. Registra una frase più breve oppure scrivi la risposta.",
          502,
        );
      const transcript = {
        text: result.text.trim(),
        duration: result.duration,
      };
      if (transcriptionCache.size >= 15)
        transcriptionCache.delete(transcriptionCache.keys().next().value);
      transcriptionCache.set(id, transcript);
      return transcript;
    });
  }
  return { status, speech, transcribe };
}
