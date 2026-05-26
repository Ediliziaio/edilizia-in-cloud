/**
 * 03-embed-and-upload.ts — embed + upsert in ai_brain_documents.
 *
 * Idempotente: usa content_hash come check. Se identico → skip.
 *
 * Env richieste:
 *   OPENAI_API_KEY
 *   VITE_SUPABASE_URL    (oppure SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { CACHE_DIR } from "./persona-mapping";
import type { Chunk } from "./02-chunk";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error(
    "Missing env: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims — match ai_brain_documents.embedding
const BATCH_SIZE = 50;

async function existingHashes(): Promise<Map<string, string>> {
  // Mappa: (source_book + chunk_idx) → content_hash esistente
  const { data, error } = await supabase
    .from("ai_brain_documents")
    .select("id, kb_source_book, chunk_id, content_hash:metadata->>content_hash")
    .eq("scope", "silvio_admin")
    .not("kb_source_book", "is", null);

  if (error) {
    console.warn("[hash] errore lettura esistenti:", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.kb_source_book && row.chunk_id && row.content_hash) {
      map.set(`${row.kb_source_book}::${row.chunk_id}`, row.content_hash);
    }
  }
  return map;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const resp = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return resp.data.map((d) => d.embedding);
}

async function upsertChunks(chunks: (Chunk & { embedding: number[] })[]) {
  // Trasforma a row ai_brain_documents
  const rows = chunks.map((c) => ({
    scope: "silvio_admin",
    title: c.title,
    content: c.content,
    chunk_id: String(c.chunk_idx),
    kb_section: c.kb_section,
    kb_subsection: c.kb_subsection,
    kb_priority: c.kb_priority,
    kb_source_book: c.source_book,
    persona_keys: c.persona_keys,
    source_path: `kb/imprenditore-edile-3-0/${c.source_book}.md`,
    embedding: c.embedding,
    metadata: { content_hash: c.content_hash, char_count: c.char_count },
  }));

  // Idempotenza: upsert by (kb_source_book, chunk_id)
  // Per farlo serve unique constraint — fallback: delete + insert per (source_book, chunk_id)
  for (const row of rows) {
    const { error: delErr } = await supabase
      .from("ai_brain_documents")
      .delete()
      .eq("scope", "silvio_admin")
      .eq("kb_source_book", row.kb_source_book)
      .eq("chunk_id", row.chunk_id);

    if (delErr && delErr.code !== "PGRST116") {
      // PGRST116 = no rows — ignora
      console.warn(`[upsert] delete failed for ${row.kb_source_book}#${row.chunk_id}:`, delErr.message);
    }
  }

  const { error } = await supabase.from("ai_brain_documents").insert(rows);
  if (error) {
    console.error(`[upsert] insert failed:`, error.message);
    throw error;
  }
}

async function main() {
  const chunksPath = path.join(CACHE_DIR, "chunks.json");
  const raw = await fs.readFile(chunksPath, "utf-8");
  const chunks: Chunk[] = JSON.parse(raw);

  console.log(`[embed] ${chunks.length} chunk da processare`);

  const existing = await existingHashes();
  const toProcess = chunks.filter((c) => {
    const key = `${c.source_book}::${c.chunk_idx}`;
    return existing.get(key) !== c.content_hash;
  });

  console.log(
    `[embed] skippati (hash uguale): ${chunks.length - toProcess.length}`
  );
  console.log(`[embed] da embeddare: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log("[embed] niente da fare, idempotenza ok.");
    return;
  }

  let processed = 0;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch.map((c) => c.content));
    const enriched = batch.map((c, idx) => ({ ...c, embedding: embeddings[idx] }));
    await upsertChunks(enriched);

    processed += batch.length;
    console.log(`[embed] ${processed}/${toProcess.length}`);
  }

  console.log("[embed] done.");
}

main().catch((err) => {
  console.error("[embed] FAIL:", err);
  process.exit(1);
});
