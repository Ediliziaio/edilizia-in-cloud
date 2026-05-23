/**
 * brainEmbed — utility shared per generare embedding via OpenAI/OpenRouter
 *
 * Modello: text-embedding-3-small (1536 dim, ~€0.02/1M token = molto economico)
 *
 * Strategia provider:
 *   1. Se OPENROUTER_API_KEY disponibile → OpenRouter (multi-provider)
 *      MA al momento OpenRouter non supporta embedding endpoint.
 *   2. Default: OpenAI direct (api.openai.com/v1/embeddings)
 *      richiede OPENAI_API_KEY su Supabase secrets.
 *
 * Se manca OPENAI_API_KEY → throw. L'edge caller decide se bloccare l'ingest
 * o salvare il documento senza embedding.
 */

import { fetchWithRetryAndTimeout } from "./fetchWithTimeout.ts";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = (text ?? "").slice(0, 8000).trim();
  if (cleaned.length < 5) {
    throw new Error("Testo troppo corto per embedding");
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurata");
  }

  const res = await fetchWithRetryAndTimeout("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: cleaned,
      encoding_format: "float",
    }),
    timeoutMs: 45_000,
  }, 2);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embedding ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const vec = data?.data?.[0]?.embedding as number[] | undefined;

  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`Embedding dim invalida: ${vec?.length}`);
  }

  return vec;
}

/**
 * Genera embeddings batch (più input in una sola call OpenAI, max 100).
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const cleaned = texts
    .map(t => (t ?? "").slice(0, 8000).trim())
    .filter(t => t.length >= 5);

  if (cleaned.length === 0) return [];

  // OpenAI accepts up to 2048 inputs per call, ma stiamo conservativi a 100
  const chunks: string[][] = [];
  for (let i = 0; i < cleaned.length; i += 100) {
    chunks.push(cleaned.slice(i, i + 100));
  }

  const all: number[][] = [];

  for (const chunk of chunks) {
    const res = await fetchWithRetryAndTimeout("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: chunk,
        encoding_format: "float",
      }),
      timeoutMs: 60_000,
    }, 3);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI batch embedding ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vecs: number[][] = (data?.data ?? []).map((d: any) => d.embedding as number[]);
    if (vecs.length !== chunk.length) {
      throw new Error(`Embedding count mismatch: expected ${chunk.length}, got ${vecs.length}`);
    }
    all.push(...vecs);
  }

  return all;
}

/**
 * Hash sha256 (hex) del contenuto — per idempotenza/dedup.
 */
export async function contentHash(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text.slice(0, 8000));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Splitting semplice (LEGACY): split per newline, max 2000 char per chunk.
 * Mantenuto per retrocompatibilità — preferire chunkTextSliding per nuovo codice.
 */
export function chunkText(text: string, maxChars = 2000): string[] {
  const cleaned = (text ?? "").trim();
  if (cleaned.length === 0) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let buf = "";
  const lines = cleaned.split(/\n+/);

  for (const line of lines) {
    if ((buf + "\n" + line).length > maxChars) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  return chunks.flatMap(c => {
    if (c.length <= maxChars) return c;
    const subs: string[] = [];
    for (let i = 0; i < c.length; i += maxChars) {
      subs.push(c.slice(i, i + maxChars));
    }
    return subs;
  });
}

/**
 * SLIDING-WINDOW chunking con overlap — strategia raccomandata.
 *
 * Vantaggi vs chunkText legacy:
 *   - Overlap (default 50 token / ~200 char) preserva il contesto a cavallo
 *     dei chunk → l'embedding dei chunk vicini "vede" anche un po' del
 *     chunk adiacente, migliorando il recall del vector search per concetti
 *     che attraversano boundaries naturali.
 *   - Split su sentence boundaries (. ! ? \n\n) per coesione semantica
 *   - Target token-aware (default 500 token = ~2000 char con tokenizer GPT)
 *
 * Parametri di default ottimizzati per text-embedding-3-small (1536 dim):
 *   - chunkChars 2000 (~500 token)
 *   - overlapChars 200 (~50 token)
 *   - splitOn boundary regex /[.!?]\s+|\n{2,}/g
 */
export function chunkTextSliding(
  text: string,
  options: { chunkChars?: number; overlapChars?: number } = {}
): Array<{ content: string; index: number; total: number }> {
  const cleaned = (text ?? "").trim();
  if (cleaned.length === 0) return [];

  const chunkChars = options.chunkChars ?? 2000;
  const overlapChars = options.overlapChars ?? 200;

  if (cleaned.length <= chunkChars) {
    return [{ content: cleaned, index: 0, total: 1 }];
  }

  // 1. Split su sentence boundaries — tieni i delimiter
  const sentences: string[] = [];
  let lastEnd = 0;
  const boundaryRe = /[.!?](?:\s+|$)|\n{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = boundaryRe.exec(cleaned)) !== null) {
    sentences.push(cleaned.slice(lastEnd, m.index + m[0].length));
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < cleaned.length) {
    sentences.push(cleaned.slice(lastEnd));
  }

  // 2. Aggrega frasi fino al limite chunkChars
  const rawChunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > chunkChars && buf.length > 0) {
      rawChunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
    // Se una singola frase supera chunkChars (raro), spezzala hard
    while (buf.length > chunkChars * 1.5) {
      rawChunks.push(buf.slice(0, chunkChars).trim());
      buf = buf.slice(chunkChars);
    }
  }
  if (buf.trim()) rawChunks.push(buf.trim());

  // 3. Applica overlap: ogni chunk include la coda del precedente
  if (rawChunks.length === 1 || overlapChars <= 0) {
    return rawChunks.map((c, i) => ({ content: c, index: i, total: rawChunks.length }));
  }

  const overlapped: string[] = [rawChunks[0]];
  for (let i = 1; i < rawChunks.length; i++) {
    const prev = rawChunks[i - 1];
    const tail = prev.slice(Math.max(0, prev.length - overlapChars));
    // Trova un boundary di parola per non spezzare a metà
    const cutAt = tail.search(/\s/);
    const cleanTail = cutAt > 0 ? tail.slice(cutAt + 1) : tail;
    overlapped.push((cleanTail + " " + rawChunks[i]).trim());
  }

  return overlapped.map((c, i) => ({
    content: c,
    index: i,
    total: overlapped.length,
  }));
}

export const BRAIN_EMBED_MODEL = EMBED_MODEL;
export const BRAIN_EMBED_DIMS = EMBED_DIMS;
