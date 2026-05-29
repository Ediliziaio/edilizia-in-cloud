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

/**
 * Mappa aspect-ratio → size valido per gpt-image-1.
 * FIX QA: gpt-image-1 supporta SOLO 1024x1024 | 1024x1536 | 1536x1024 | auto.
 * I valori storici (1024x1280, 1024x1820, 1820x1024) erano INVALIDI → 400 e la
 * generazione immagini social falliva per ogni formato non quadrato. Mappiamo
 * ai size verticale/orizzontale più vicini supportati.
 */
export function aspectToOpenAiSize(ar: CreativeAspect | string | undefined | null): string {
  switch (ar) {
    case "1:1": return "1024x1024";   // quadrato
    case "4:5": return "1024x1536";   // verticale
    case "9:16": return "1024x1536";  // verticale (più vicino supportato)
    case "16:9": return "1536x1024";  // orizzontale
    default: return "1024x1024";
  }
}

/** Applica i canoni a un brief utente → prompt finale per il motore immagini. */
export function buildBrandedImagePrompt(userPrompt: string): string {
  return `${userPrompt}\n\n${BRAND_CREATIVE_RULES}`;
}
