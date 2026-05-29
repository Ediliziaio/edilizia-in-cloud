/**
 * MP-SILVIO-CREATIVE-01 — Canoni di brand condivisi per la generazione visiva.
 *
 * SINGLE SOURCE OF TRUTH: usata SIA dal modulo social (ai-ads-image-generate)
 * SIA dalla chat di Silvio (worker creatività). Estratta dai vincoli che prima
 * erano inline in ai-ads-image-generate, a parità di valore (nessun cambio di
 * comportamento). Così non esistono "due Silvio" con regole diverse.
 */

export type CreativeAspect = "1:1" | "4:5" | "9:16" | "16:9";

/** Vincoli di brand applicati a ogni immagine generata. */
export const BRAND_CREATIVE_RULES = `VINCOLI:
- Realistico, fotografico, no rendering 3D cartoonesco
- Italia, contesto edilizia residenziale realistico
- Niente testo sull'immagine (verrà aggiunto dopo)
- Niente persone con volti molto riconoscibili (privacy)
- Tono affidabile, professionale, no claim esagerati
- Light: naturale, ora dorata o studio neutro`;

/** Mappa aspect-ratio → size OpenAI Images (identica al mapping storico). */
export function aspectToOpenAiSize(ar: CreativeAspect | string | undefined | null): string {
  switch (ar) {
    case "1:1": return "1024x1024";
    case "4:5": return "1024x1280";
    case "9:16": return "1024x1820";
    case "16:9": return "1820x1024";
    default: return "1024x1024";
  }
}

/** Applica i canoni a un brief utente → prompt finale per il motore immagini. */
export function buildBrandedImagePrompt(userPrompt: string): string {
  return `${userPrompt}\n\n${BRAND_CREATIVE_RULES}`;
}
