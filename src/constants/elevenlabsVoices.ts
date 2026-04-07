/**
 * Voci ElevenLabs ottimizzate per italiano (Multilingual v2)
 * Usa il modello "eleven_multilingual_v2" per garantire qualità in italiano.
 */

export interface ElevenLabsVoice {
  id: string;
  name: string;
  desc: string;
  gender: "f" | "m";
  accent?: string;
}

export const ELEVENLABS_VOICES_IT: ElevenLabsVoice[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Giulia",
    desc: "Femminile, calda e professionale",
    gender: "f",
    accent: "Italiano",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "Giovanni",
    desc: "Maschile, autorevole e chiaro",
    gender: "m",
    accent: "Italiano",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Francesca",
    desc: "Femminile, naturale e amichevole",
    gender: "f",
    accent: "Italiano",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Marco",
    desc: "Maschile, cordiale e dinamico",
    gender: "m",
    accent: "Italiano",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Sofia",
    desc: "Femminile, vivace e coinvolgente",
    gender: "f",
    accent: "Italiano",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Luca",
    desc: "Maschile, energico e moderno",
    gender: "m",
    accent: "Italiano",
  },
];

/** Voce di default per nuovi agenti (Giulia) */
export const DEFAULT_VOICE_IT = ELEVENLABS_VOICES_IT[0];
