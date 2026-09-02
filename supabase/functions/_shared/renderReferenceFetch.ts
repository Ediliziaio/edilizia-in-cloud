// Scarica le foto di riferimento pubbliche (public/render-references, servite
// dal sito) e le converte in data URL per il modello immagine. Estratto dalla
// logica degli infissi (generate-render) per usarlo anche su persiane e tetto:
// cache per URL, cache negativa sui fallimenti, filtro mimetype OpenAI, mai
// un'eccezione — le foto mancanti finiscono in `missing` e nei log.
import type { ImageReferenceInput } from "./ai-provider/image.ts";
import type { SharedReferenceImage } from "../../../shared/render-references/referenceUrl.ts";

const CACHE = new Map<string, string>();               // url -> dataUrl
const NEGATIVE = new Map<string, number>();            // url -> timestamp fallimento
const NEGATIVE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const SUPPORTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export interface FetchReferenceResult {
  references: ImageReferenceInput[];
  missing: Array<{ url: string; label: string; reason: string }>;
}

export async function fetchSharedReferenceImages(
  refs: SharedReferenceImage[],
  log?: (entry: Record<string, unknown>) => void,
): Promise<FetchReferenceResult> {
  const missing: FetchReferenceResult["missing"] = [];
  const results = await Promise.all(refs.map(async (ref): Promise<ImageReferenceInput | null> => {
    const cached = CACHE.get(ref.url);
    if (cached) return { label: ref.label, dataUrl: cached };
    const lastFail = NEGATIVE.get(ref.url);
    if (lastFail && Date.now() - lastFail < NEGATIVE_TTL_MS) {
      missing.push({ url: ref.url, label: ref.label.slice(0, 80), reason: "negative_cache" });
      return null;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(ref.url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!resp.ok) {
        NEGATIVE.set(ref.url, Date.now());
        missing.push({ url: ref.url, label: ref.label.slice(0, 80), reason: `http_${resp.status}` });
        return null;
      }
      const blob = await resp.blob();
      const mime = (blob.type || "image/webp").toLowerCase();
      if (!SUPPORTED.includes(mime)) {
        NEGATIVE.set(ref.url, Date.now());
        missing.push({ url: ref.url, label: ref.label.slice(0, 80), reason: `mimetype_${mime}` });
        return null;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dataUrl = `data:${mime};base64,${uint8ToBase64(bytes)}`;
      CACHE.set(ref.url, dataUrl);
      return { label: ref.label, dataUrl };
    } catch (e) {
      NEGATIVE.set(ref.url, Date.now());
      missing.push({ url: ref.url, label: ref.label.slice(0, 80), reason: `error_${String((e as Error)?.message ?? e).slice(0, 80)}` });
      return null;
    }
  }));
  const references = results.filter((r): r is ImageReferenceInput => r !== null);
  log?.({ lvl: "info", msg: "shared_reference_images_fetched", requested: refs.length, loaded: references.length, missing: missing.length });
  if (missing.length > 0) log?.({ lvl: "warn", msg: "shared_reference_images_missing", missing });
  return { references, missing };
}

/**
 * Legenda da appendere DOPO la prosa: dice al modello cosa sono le immagini
 * allegate (foto reali di prodotto/materiale) e come usarle.
 */
export function buildSharedReferenceLegend(refs: ImageReferenceInput[]): string {
  if (refs.length === 0) return "";
  return [
    "REFERENCE IMAGES ATTACHED — real photos of the requested product or material. Use each one ONLY for the property named in its label (shape, construction, texture, relief); never copy its background, building or framing into the scene, and never paste it as a flat rectangle.",
    ...refs.map((r, i) => `${i + 1}. ${r.label}`),
  ].join("\n");
}
