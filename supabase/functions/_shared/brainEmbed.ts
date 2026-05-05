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
 * Se entrambi mancano → throw, e l'ingest skippa l'embedding (documento
 * salvato comunque con embedding=NULL, da reindexare in seguito).
 */

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

  const res = await fetch("https://api.openai.com/v1/embeddings", {
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
  });

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
    const res = await fetch("https://api.openai.com/v1/embeddings", {
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
    });

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
 * Splitting semplice: split per newline, max 2000 char per chunk.
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

  // Se un chunk supera comunque maxChars (riga lunga), spezza ulteriormente
  return chunks.flatMap(c => {
    if (c.length <= maxChars) return c;
    const subs: string[] = [];
    for (let i = 0; i < c.length; i += maxChars) {
      subs.push(c.slice(i, i + maxChars));
    }
    return subs;
  });
}

export const BRAIN_EMBED_MODEL = EMBED_MODEL;
export const BRAIN_EMBED_DIMS = EMBED_DIMS;
