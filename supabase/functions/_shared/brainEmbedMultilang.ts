/**
 * brainEmbedMultilang — wrapper di embedding language-aware.
 *
 * Strategia (in ordine di preferenza):
 *   1. Se la lingua è IT/EN → text-embedding-3-small (1536 dim, OpenAI)
 *      → economico, copertura buona per le 2 lingue principali del progetto.
 *   2. Per lingue non-IT/EN (ES, FR, DE, PT, RO, ...) → text-embedding-3-large
 *      (3072 dim) MA proiettato a 1536 con `dimensions` parameter (OpenAI lo
 *      supporta nativamente per i modelli v3) → performance multilingue
 *      sensibilmente migliore mantenendo compatibilità con la colonna vector(1536)
 *      e l'indice HNSW esistente.
 *   3. Se è impostato COHERE_API_KEY e il caller passa `prefer:'cohere'` →
 *      embed-multilingual-v3.0 di Cohere (1024 dim → upcast a 1536 con padding
 *      zeros). Questo è opt-in perché cambia lo "spazio" degli embedding.
 *
 * Tutti i modelli ritornano sempre vettori a 1536 dim per restare compatibili
 * con lo schema esistente (vector(1536) + HNSW). Il modello effettivo viene
 * salvato in `ai_brain_documents.embedding_model` per permettere migrazioni
 * future selettive.
 *
 * NB: la coesistenza nello stesso DB di embedding di modelli diversi è
 * "rumorosa" semanticamente — la similarity tra modelli diversi non è
 * direttamente confrontabile. Per questo il filtro per language nella RPC
 * `kb_test_query_multilang` è importante: garantisce che si confrontino
 * solo doc embeddati con lo stesso modello (per construction).
 */

import { fetchWithRetryAndTimeout } from "./fetchWithTimeout.ts";

export const TARGET_DIMS = 1536;

const OPENAI_SMALL = "text-embedding-3-small";
const OPENAI_LARGE = "text-embedding-3-large";
const COHERE_MULTI = "embed-multilingual-v3.0";

// Lingue per cui il modello "small" è sufficiente.
const SMALL_LANGS = new Set(["it", "en"]);

export type EmbedModel =
  | typeof OPENAI_SMALL
  | typeof OPENAI_LARGE
  | typeof COHERE_MULTI;

export interface MultilangEmbedOptions {
  language?: string;
  /** Forza un modello specifico, ignorando la language. */
  forceModel?: EmbedModel;
  /** Se true e COHERE_API_KEY presente, usa Cohere per non-IT/EN. */
  preferCohere?: boolean;
}

export interface MultilangEmbedResult {
  embedding: number[];
  model: EmbedModel;
  dim: number;
  language: string;
}

export function pickModel(opts: MultilangEmbedOptions = {}): EmbedModel {
  if (opts.forceModel) return opts.forceModel;

  const lang = (opts.language ?? "it").toLowerCase().slice(0, 2);

  if (SMALL_LANGS.has(lang)) return OPENAI_SMALL;

  if (opts.preferCohere && Deno.env.get("COHERE_API_KEY")) {
    return COHERE_MULTI;
  }

  return OPENAI_LARGE;
}

export async function generateEmbeddingMultilang(
  text: string,
  opts: MultilangEmbedOptions = {},
): Promise<MultilangEmbedResult> {
  const cleaned = (text ?? "").slice(0, 8000).trim();
  if (cleaned.length < 5) {
    throw new Error("Testo troppo corto per embedding");
  }

  const lang = (opts.language ?? "it").toLowerCase().slice(0, 2);
  const model = pickModel(opts);

  let embedding: number[];

  if (model === COHERE_MULTI) {
    embedding = await cohereEmbed([cleaned], "search_document").then(v => v[0]);
  } else {
    embedding = await openaiEmbed(cleaned, model);
  }

  // Tutti i path ritornano già 1536 dim (OpenAI con dimensions param,
  // Cohere via padding helper).
  if (embedding.length !== TARGET_DIMS) {
    throw new Error(`Embedding dim mismatch: expected ${TARGET_DIMS}, got ${embedding.length}`);
  }

  return { embedding, model, dim: TARGET_DIMS, language: lang };
}

async function openaiEmbed(text: string, model: EmbedModel): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const body: Record<string, unknown> = {
    model,
    input: text,
    encoding_format: "float",
  };
  // text-embedding-3-* supportano `dimensions` per ridurre la dimensione output
  if (model === OPENAI_LARGE || model === OPENAI_SMALL) {
    body.dimensions = TARGET_DIMS;
  }

  const res = await fetchWithRetryAndTimeout("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 45_000,
  }, 2);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embedding ${model} ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding as number[] | undefined;
  if (!Array.isArray(vec)) throw new Error("Embedding non valido");
  return vec;
}

async function cohereEmbed(
  texts: string[],
  inputType: "search_document" | "search_query",
): Promise<number[][]> {
  const apiKey = Deno.env.get("COHERE_API_KEY");
  if (!apiKey) throw new Error("COHERE_API_KEY non configurata");

  const res = await fetchWithRetryAndTimeout("https://api.cohere.com/v1/embed", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_MULTI,
      texts,
      input_type: inputType,
      embedding_types: ["float"],
    }),
    timeoutMs: 45_000,
  }, 2);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cohere embed ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = (data?.embeddings?.float ?? data?.embeddings) as number[][] | undefined;
  if (!Array.isArray(raw)) throw new Error("Cohere response non valida");

  // Cohere v3.0 → 1024 dim. Upcast a 1536 con zero-padding per restare
  // compatibili con vector(1536). NOTA: l'embedding resta semanticamente
  // valido ma NON è confrontabile con modelli OpenAI — usare sempre
  // filtro language per isolare i confronti same-model.
  return raw.map(v => {
    if (v.length === TARGET_DIMS) return v;
    if (v.length > TARGET_DIMS) return v.slice(0, TARGET_DIMS);
    const padded = new Array<number>(TARGET_DIMS).fill(0);
    for (let i = 0; i < v.length; i++) padded[i] = v[i];
    return padded;
  });
}
