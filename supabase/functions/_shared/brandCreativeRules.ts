/**
 * MP-SILVIO-CREATIVE-01 — Canoni di brand condivisi per la generazione visiva.
 *
 * SINGLE SOURCE OF TRUTH: usata SIA dal modulo social (ai-ads-image-generate)
 * SIA dalla chat di Silvio (silvio-generation-worker). Così non esistono
 * "due Silvio" con regole diverse.
 *
 * MODULO PURO: nessun import (né Deno né esm.sh) — gira tal quale nelle edge
 * function e nei test vitest del frontend. Tutta la logica decidibile a tavolino
 * (prompt, formati, prezzi, crop) vive qui ed è coperta da test.
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
 * Identità visiva dell'azienda, letta da `companies`. Tutti i campi opzionali:
 * un'azienda che non ha configurato il brand riceve il canone generico di prima
 * (nessuna regressione).
 */
export interface CompanyBrand {
  nome?: string | null;
  colorePrimario?: string | null;
  coloreSecondario?: string | null;
  coloreAccento?: string | null;
  logoUrl?: string | null;
  vertical?: string | null;
}

/** Colore esadecimale valido (#rgb o #rrggbb) — l'unico che ha senso citare nel prompt. */
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/**
 * Il mestiere dell'azienda in parole che un motore di immagini capisce.
 * Chiave = `companies.vertical` (stessi valori dei template preventivo).
 */
const SCENA_PER_VERTICAL: Record<string, string> = {
  bagni: "ristrutturazione bagno finita: rivestimenti posati, sanitari e box doccia puliti",
  serramenti: "finestre e portefinestre nuove installate, viste da interno luminoso",
  fotovoltaico: "impianto fotovoltaico su tetto residenziale italiano, pannelli allineati",
  tetti: "tetto residenziale rifatto, manto di copertura regolare e lattoneria pulita",
  pavimenti: "pavimento nuovo posato in ambiente residenziale arredato con sobrietà",
  facciate: "facciata di edificio residenziale italiano appena rifatta, intonaco uniforme",
  piscine: "piscina residenziale finita con bordo e pavimentazione esterna curata",
  climatizzazione: "unità di climatizzazione installata a regola d'arte in ambiente residenziale",
  elettrico: "quadro elettrico ordinato e impianto a regola d'arte in abitazione",
  termoidraulico: "centrale termica compatta e ordinata in locale tecnico residenziale",
  ristrutturazione: "ristrutturazione di interni completata, ambiente pulito e finito",
  pergole: "pergola bioclimatica installata in giardino residenziale italiano",
};

/**
 * Applica i canoni a un brief utente → prompt finale per il motore immagini.
 *
 * Con `brand` valorizzato l'immagine smette di essere anonima: entrano la
 * palette aziendale (solo colori esadecimali validi — un valore sporco nel DB
 * confonderebbe il modello) e la scena tipica del mestiere. Il logo NON viene
 * chiesto al modello (i motori generativi scrivono loghi illeggibili): si
 * sovrappone dopo, in fase di composizione del post.
 */
export function buildBrandedImagePrompt(userPrompt: string, brand?: CompanyBrand | null): string {
  const blocchi: string[] = [userPrompt.trim()];

  const scena = brand?.vertical ? SCENA_PER_VERTICAL[String(brand.vertical).toLowerCase()] : undefined;
  if (scena) blocchi.push(`CONTESTO DI MESTIERE: ${scena}.`);

  const colori = [brand?.colorePrimario, brand?.coloreSecondario, brand?.coloreAccento].filter(isHexColor);
  if (colori.length > 0) {
    blocchi.push(
      `PALETTE: l'immagine deve armonizzarsi con i colori del brand ${colori.join(", ")} — ` +
        "usali negli elementi di scena (complementi, dettagli, luce), MAI come filtro sopra la foto.",
    );
  }

  // Spazio libero per headline e logo che il compositore aggiunge dopo: senza
  // questa istruzione il soggetto finisce al centro e il testo lo copre.
  blocchi.push(
    "COMPOSIZIONE: lascia un'area libera e poco dettagliata nella parte alta o bassa " +
      "dell'inquadratura, dove verranno sovrapposti titolo e logo.",
  );

  blocchi.push(BRAND_CREATIVE_RULES);
  return blocchi.join("\n\n");
}

/**
 * Mappa aspect-ratio → size valido per gpt-image-1.
 * gpt-image-1 supporta SOLO 1024x1024 | 1024x1536 | 1536x1024 | auto.
 * I valori storici (1024x1280, 1024x1820, 1820x1024) erano INVALIDI → 400 e la
 * generazione immagini social falliva per ogni formato non quadrato.
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

/**
 * Dimensione REALE richiesta dai social per ogni formato. Non coincide con la
 * size generabile: gpt-image-1 non produce 9:16 (1024x1536 è 2:3), quindi
 * un'immagine "Storie" pubblicata così com'è viene ritagliata da Instagram in
 * un punto che non controlliamo. Il compositore porta l'immagine a QUESTA
 * dimensione con un crop centrato prima della pubblicazione.
 */
export const SOCIAL_TARGET_SIZE: Record<CreativeAspect, { w: number; h: number }> = {
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1200, h: 628 },
};

/** True se il formato richiesto NON è generabile nativamente e servirà un crop. */
export function richiedeRitaglio(ar: CreativeAspect): boolean {
  const [gw, gh] = aspectToOpenAiSize(ar).split("x").map(Number);
  const target = SOCIAL_TARGET_SIZE[ar];
  if (!target) return false;
  // Confronto tra proporzioni con tolleranza dell'1%: 1024x1536 (0.667) vs
  // 1080x1920 (0.5625) → ritaglio necessario; 1024x1024 vs 1080x1080 → no.
  const rGen = gw / gh;
  const rTarget = target.w / target.h;
  return Math.abs(rGen - rTarget) / rTarget > 0.01;
}

/**
 * Geometria del crop "cover": riempi il target mantenendo le proporzioni e
 * tagliando l'eccesso, con il soggetto centrato. Ritorna la finestra da
 * ritagliare nell'immagine sorgente.
 */
export function cropCoverBox(
  src: { w: number; h: number },
  target: { w: number; h: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const scala = Math.max(target.w / src.w, target.h / src.h);
  const sw = Math.min(src.w, Math.round(target.w / scala));
  const sh = Math.min(src.h, Math.round(target.h / scala));
  return {
    sx: Math.max(0, Math.round((src.w - sw) / 2)),
    sy: Math.max(0, Math.round((src.h - sh) / 2)),
    sw,
    sh,
  };
}

// ── PREZZI ────────────────────────────────────────────────────────────────────
// Un solo posto per il costo delle immagini: prima ogni funzione aveva la sua
// tabella hardcoded e il prezzo veniva calcolato sulla qualità RICHIESTA anche
// quando quella qualità non veniva mai inviata al modello (si pagava "hd" per
// un'immagine standard).

export type ImageQuality = "standard" | "hd";

/**
 * Qualità effettivamente applicabile al modello.
 * gpt-image-1 non accetta i valori DALL·E `standard`/`hd` (400 Unknown parameter):
 * accetta la propria scala. Mappiamo standard→medium e hd→high; per DALL·E si
 * mantengono i valori storici. `null` = parametro da NON inviare.
 */
export function qualityPerModello(model: string, quality: ImageQuality): string | null {
  if (model.startsWith("gpt-image")) return quality === "hd" ? "high" : "medium";
  if (model.startsWith("dall-e")) return quality; // standard | hd
  return null; // modello sconosciuto: non inviare nulla, meglio il default del provider
}

/**
 * Costo reale stimato in USD. Listino 2026 gpt-image-1 / DALL·E 3.
 * REGOLA: il prezzo dipende da ciò che viene DAVVERO applicato — se il modello
 * non riceve la qualità alta, non la si può addebitare.
 */
export function costoImmagineUsd(params: {
  model: string;
  size: string;
  quality: ImageQuality;
}): number {
  const { model, size, quality } = params;
  const qualitaApplicata = qualityPerModello(model, quality);
  const alta = qualitaApplicata === "high" || qualitaApplicata === "hd";
  const quadrata = size === "1024x1024";

  if (model.startsWith("dall-e")) {
    if (quadrata) return alta ? 0.08 : 0.04;
    return alta ? 0.12 : 0.08;
  }
  // gpt-image-1 (e default per modelli non riconosciuti)
  if (quadrata) return alta ? 0.08 : 0.04;
  return alta ? 0.13 : 0.065;
}

/** Costo da esporre al cliente, in centesimi di euro (ricarico di piattaforma incluso). */
export function costoImmagineCentesimiEur(params: {
  model: string;
  size: string;
  quality: ImageQuality;
  fxUsdEur?: number;
  markup?: number;
}): number {
  const usd = costoImmagineUsd(params);
  const fx = params.fxUsdEur ?? 0.92;
  const markup = params.markup ?? 1.1;
  return Math.max(1, Math.round(usd * fx * markup * 100));
}

// ── QUOTA ─────────────────────────────────────────────────────────────────────

/** Tetto giornaliero di immagini per azienda (default prudente, override da env). */
export const CREATIVE_DAILY_CAP_DEFAULT = 40;

/**
 * Decide se una nuova generazione è ammessa. Separata dalla lettura DB per
 * essere testabile: chi chiama passa il conteggio già fatto.
 */
export function quotaCreativitaSuperata(usateOggi: number, cap: number): boolean {
  if (!Number.isFinite(cap) || cap <= 0) return false; // cap disattivato
  return usateOggi >= cap;
}

/** Messaggio in italiano quando il tetto è raggiunto (letto dall'utente). */
export function messaggioQuotaSuperata(cap: number): string {
  return `Hai raggiunto il limite di ${cap} immagini generate per oggi. ` +
    "Riprova domani, oppure scrivi all'assistenza se ti serve un tetto più alto.";
}
