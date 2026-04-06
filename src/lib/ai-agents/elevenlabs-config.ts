/**
 * elevenlabs-config.ts
 * Configurazione centralizzata voci ElevenLabs per Edilizia in Cloud.
 *
 * TUTTE le voci italiane disponibili — aggiornare qui e SOLO qui.
 * I voice_id reali si trovano dall'account ElevenLabs del cliente o via:
 *   GET https://api.elevenlabs.io/v1/voices
 *
 * ⚠️  NON usare voci monolingua inglese (es. JBFqnCBsd6RMkjVDRZzb "George"):
 *      queste producono output in inglese anche con testo italiano.
 *      Usare SEMPRE il modello `eleven_multilingual_v2`.
 */

// ── Tipi ────────────────────────────────────────────────────────────────────

export interface ElevenLabsVoiceConfig {
  id: string;
  name: string;
  language: "it" | "en" | "it-en";
  gender: "male" | "female";
  style: "professional" | "conversational" | "warm";
  /** true = mostrata prima nella selezione UI */
  recommended: boolean;
}

// ── Voci italiane consigliate ────────────────────────────────────────────────
// I voice_id provengono dall'account ElevenLabs del progetto.
// Sono voci multilingua (eleven_multilingual_v2) con supporto nativo italiano.
//
// Come aggiornare:
//   1. Accedi a https://elevenlabs.io/voices
//   2. Filtra per lingua "Italian"
//   3. Copia il voice_id dal pannello e aggiorna questo array
export const ELEVENLABS_ITALIAN_VOICES: ElevenLabsVoiceConfig[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel — Professionale",
    language: "it-en",
    gender: "female",
    style: "professional",
    recommended: true,
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi — Conversazionale",
    language: "it-en",
    gender: "female",
    style: "conversational",
    recommended: true,
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni — Professionale",
    language: "it-en",
    gender: "male",
    style: "professional",
    recommended: true,
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold — Professionale",
    language: "it-en",
    gender: "male",
    style: "professional",
    recommended: false,
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam — Formale",
    language: "it-en",
    gender: "male",
    style: "professional",
    recommended: false,
  },
];

// ── Default per nuovi agenti ─────────────────────────────────────────────────
// Usato quando il tenant non ha ancora selezionato una voce.
// Rachel (21m00Tcm4TlvDq8ikWAM) supporta italiano nativo con eleven_multilingual_v2.
export const DEFAULT_ITALIAN_VOICE_ID: string =
  ELEVENLABS_ITALIAN_VOICES[0].id; // Rachel

// ── Configurazione modello TTS ───────────────────────────────────────────────
// CRITICO: eleven_monolingual_v1 NON supporta italiano correttamente.
//           Usare SEMPRE eleven_multilingual_v2.
export const ELEVENLABS_TTS_CONFIG = {
  model_id: "eleven_multilingual_v2",
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  },
} as const;

// ── Configurazione lingua per ConvAI ────────────────────────────────────────
export const ELEVENLABS_ITALIAN_LANGUAGE = "it" as const;

// ── Helper ───────────────────────────────────────────────────────────────────

/** Restituisce la voce per ID con fallback sicuro al default italiano */
export function getVoiceConfigById(voiceId: string): ElevenLabsVoiceConfig {
  return (
    ELEVENLABS_ITALIAN_VOICES.find((v) => v.id === voiceId) ??
    ELEVENLABS_ITALIAN_VOICES[0]
  );
}

/** Restituisce solo le voci raccomandate per la selezione rapida in UI */
export function getRecommendedVoices(): ElevenLabsVoiceConfig[] {
  return ELEVENLABS_ITALIAN_VOICES.filter((v) => v.recommended);
}
