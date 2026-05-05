/**
 * Track 2 — KB Universale Ingestion Script
 *
 * Carica i .md di knowledge-base/ in ai_brain_documents (scope='universal')
 * usando la RPC brain_upsert_kb_chunk (idempotente, hash-based).
 *
 * USO:
 *   # Dry-run (solo stima, no DB write)
 *   deno run -A scripts/kb-ingestion/ingest.ts --dry-run
 *
 *   # Solo una area
 *   deno run -A scripts/kb-ingestion/ingest.ts --area=02-finanza-cashflow
 *
 *   # Ingestion completa
 *   deno run -A scripts/kb-ingestion/ingest.ts
 *
 * ENV richiesti:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   KB_BASE_PATH (default: ./knowledge-base)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { walk } from "jsr:@std/fs@1/walk";
import { parse as parseYaml } from "jsr:@std/yaml@1";

// ════════════════════════════════════════════════════════════════════════════
// Config
// ════════════════════════════════════════════════════════════════════════════

const args = Deno.args;
const DRY_RUN = args.includes("--dry-run");
const ONLY_AREA = args.find((a) => a.startsWith("--area="))?.split("=")[1];

const CONFIG = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  supabaseKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  openaiKey: Deno.env.get("OPENAI_API_KEY")!,
  kbBasePath: Deno.env.get("KB_BASE_PATH") ?? "./knowledge-base",
  embeddingModel: "text-embedding-3-small",
  chunking: {
    maxChunkTokens: 1500,
    minChunkTokens: 50,
    windowSizeTokens: 1000,
    windowOverlapTokens: 150,
    includeDocTitlePrefix: true,
    includeSectionTitlePrefix: true,
  },
  excludeAreas: ["00-meta"],
  batch: { embeddingBatchSize: 50 },
};

if (!DRY_RUN) {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    console.error("FATAL: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obbligatori");
    Deno.exit(1);
  }
  if (!CONFIG.openaiKey) {
    console.error("FATAL: OPENAI_API_KEY obbligatorio");
    Deno.exit(1);
  }
}

const supabase = DRY_RUN ? null : createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

interface DocFrontmatter {
  area?: string;
  titolo?: string;
  tags?: string[];
  livello?: string;
  applicabile_a?: string[];
  kpi_correlati?: string[];
  versione?: string;
  aggiornato_il?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Chunk {
  doc_path: string;
  doc_title: string;
  section_title: string;
  section_number: number;
  chunk_index: number;
  chunk_total: number;
  content: string;
  source_path: string;
  source_hash: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
}

// ════════════════════════════════════════════════════════════════════════════
// Discovery
// ════════════════════════════════════════════════════════════════════════════

async function discoverDocs(basePath: string): Promise<string[]> {
  const docs: string[] = [];
  // Normalizza basePath rimuovendo ./ iniziale
  const cleanBase = basePath.replace(/^\.\//, "").replace(/[\/\\]$/, "");
  for await (const entry of walk(basePath, { exts: [".md"] })) {
    if (!entry.isFile) continue;
    if (entry.name === "_README.md") continue;
    if (entry.name === "README.md") continue;
    // Trova il path relativo rimuovendo qualsiasi prefisso che termina con cleanBase
    const idx = entry.path.indexOf(cleanBase);
    const relativePath = idx >= 0
      ? entry.path.substring(idx + cleanBase.length).replace(/^[\/\\]/, "")
      : entry.path;
    const areaId = relativePath.split(/[\/\\]/)[0];
    if (CONFIG.excludeAreas.includes(areaId)) continue;
    if (ONLY_AREA && areaId !== ONLY_AREA) continue;
    docs.push(entry.path);
  }
  return docs.sort();
}

// ════════════════════════════════════════════════════════════════════════════
// Parsing + chunking
// ════════════════════════════════════════════════════════════════════════════

function parseFrontmatter(content: string): { fm: DocFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: content };

  // YAML bug-fix: alcuni file hanno valori con % (es. "[ore-anno, % personale-formato]")
  // che YAML interpreta come comment. Pre-clean: aggiungi quote ai valori con %.
  let yamlText = match[1];
  // Aggiungi quote ai valori con % all'interno di array flow [a, b, % c]
  yamlText = yamlText.replace(/\[([^\]]*)\]/g, (_full, inner: string) => {
    const items = inner.split(",").map((it) => {
      const t = it.trim();
      // Se contiene caratteri YAML-problematici (% : #) e non e gia quoted, quote it
      if ((t.includes("%") || t.startsWith("#")) && !t.startsWith('"') && !t.startsWith("'")) {
        return ` "${t.replace(/"/g, '\\"')}"`;
      }
      return ` ${t}`;
    });
    return `[${items.join(",").trim()}]`;
  });

  try {
    const fm = parseYaml(yamlText) as DocFrontmatter;
    return { fm: fm ?? {}, body: match[2] };
  } catch (e) {
    console.warn(`     [warn] yaml parse failed, using empty frontmatter: ${(e as Error).message.slice(0, 80)}`);
    return { fm: {}, body: match[2] };
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 80);
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Section {
  title: string;
  level: number;
  content: string;
  startLine: number;
}

function splitByHeading(body: string, headingLevel: number): Section[] {
  const headingPrefix = "#".repeat(headingLevel) + " ";
  const lines = body.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(headingPrefix) && !line.startsWith(headingPrefix + "#")) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        title: line.replace(headingPrefix, "").trim(),
        level: headingLevel,
        content: "",
        startLine: i,
      };
    } else if (currentSection) {
      currentSection.content += line + "\n";
    } else {
      if (sections.length === 0) {
        sections.push({ title: "Introduzione", level: headingLevel, content: line + "\n", startLine: 0 });
        currentSection = sections[0];
      } else {
        currentSection!.content += line + "\n";
      }
    }
  }

  if (currentSection && !sections.includes(currentSection)) sections.push(currentSection);
  return sections.filter((s) => s.content.trim().length > 0);
}

function slidingWindow(text: string, sizeTokens: number, overlapTokens: number): string[] {
  const sizeChars = sizeTokens * 4;
  const overlapChars = overlapTokens * 4;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + sizeChars, text.length);
    chunks.push(text.substring(start, end));
    if (end >= text.length) break;
    start = end - overlapChars;
  }
  return chunks;
}

async function chunkDocument(docPath: string, basePath: string): Promise<Chunk[]> {
  const fullText = await Deno.readTextFile(docPath);
  const { fm, body } = parseFrontmatter(fullText);

  const relativePath = docPath
    .replace(basePath, "")
    .replace(/^[\/\\]/, "")
    .replace(/\\/g, "/");

  const docTitle = String(fm.titolo ?? relativePath);
  // Category dal frontmatter o dalla cartella
  const category = String(fm.area ?? relativePath.split("/")[0]);

  const h2Sections = splitByHeading(body, 2);
  if (h2Sections.length === 0) {
    h2Sections.push({ title: docTitle, level: 2, content: body, startLine: 0 });
  }

  const chunks: Chunk[] = [];
  for (let sIdx = 0; sIdx < h2Sections.length; sIdx++) {
    const section = h2Sections[sIdx];
    const tokenCount = estimateTokens(section.content);

    let subContents: string[];
    if (tokenCount <= CONFIG.chunking.maxChunkTokens) {
      subContents = [section.content];
    } else {
      const h3Sections = splitByHeading(section.content, 3);
      if (h3Sections.length > 1 && h3Sections.every((h) => estimateTokens(h.content) <= CONFIG.chunking.maxChunkTokens)) {
        subContents = h3Sections.map((h) => `### ${h.title}\n${h.content}`);
      } else {
        subContents = slidingWindow(section.content, CONFIG.chunking.windowSizeTokens, CONFIG.chunking.windowOverlapTokens);
      }
    }

    for (let cIdx = 0; cIdx < subContents.length; cIdx++) {
      const content = subContents[cIdx];
      const contentTrimmed = content.trim();
      if (estimateTokens(contentTrimmed) < CONFIG.chunking.minChunkTokens) continue;

      let chunkContent = "";
      if (CONFIG.chunking.includeDocTitlePrefix) chunkContent += `[Titolo doc: ${docTitle}]\n`;
      if (CONFIG.chunking.includeSectionTitlePrefix && section.title !== "Introduzione") {
        chunkContent += `[Sezione: ${section.title}]\n\n`;
      }
      chunkContent += contentTrimmed;

      const sectionSlug = slugify(section.title) || `s${sIdx + 1}`;
      const sourcePath = `${relativePath}#${sectionSlug}#${cIdx + 1}`;
      const sourceHash = await sha256(chunkContent);

      chunks.push({
        doc_path: relativePath,
        doc_title: docTitle,
        section_title: section.title,
        section_number: sIdx + 1,
        chunk_index: cIdx + 1,
        chunk_total: subContents.length,
        content: chunkContent,
        source_path: sourcePath,
        source_hash: sourceHash,
        category,
        metadata: {
          doc_path: relativePath,
          doc_title: docTitle,
          section_title: section.title,
          section_number: sIdx + 1,
          tags: fm.tags ?? [],
          livello: fm.livello ?? null,
          kpi_correlati: fm.kpi_correlati ?? [],
          versione_doc: fm.versione ?? "1.0",
          aggiornato_il: fm.aggiornato_il ?? null,
          chunk_index: cIdx + 1,
          chunk_total: subContents.length,
          char_count: contentTrimmed.length,
          token_count_estimate: estimateTokens(contentTrimmed),
        },
      });
    }
  }
  return chunks;
}

// ════════════════════════════════════════════════════════════════════════════
// Embedding
// ════════════════════════════════════════════════════════════════════════════

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.openaiKey}` },
    body: JSON.stringify({ model: CONFIG.embeddingModel, input: texts }),
  });
  if (!response.ok) {
    throw new Error(`Embedding API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// ════════════════════════════════════════════════════════════════════════════
// Upsert
// ════════════════════════════════════════════════════════════════════════════

async function upsertChunk(chunk: Chunk, embedding: number[]): Promise<{ id: string; action: string }> {
  if (!supabase) throw new Error("supabase client not initialized (dry-run?)");
  const { data, error } = await supabase.rpc("brain_upsert_kb_chunk", {
    p_source_path: chunk.source_path,
    p_title: `${chunk.doc_title} — ${chunk.section_title}`,
    p_content: chunk.content,
    p_embedding: `[${embedding.join(",")}]`,
    p_category: chunk.category,
    p_metadata: chunk.metadata,
    p_source_hash: chunk.source_hash,
  });
  if (error) throw new Error(`upsert ${chunk.source_path}: ${error.message}`);
  return data as { id: string; action: string };
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=".repeat(70));
  console.log(`KB INGESTION — ${DRY_RUN ? "DRY RUN" : "LIVE"}${ONLY_AREA ? ` (area: ${ONLY_AREA})` : ""}`);
  console.log("=".repeat(70));
  console.log(`KB Base Path: ${CONFIG.kbBasePath}`);
  console.log(`Embedding Model: ${CONFIG.embeddingModel}`);

  // 1. Discovery
  console.log("\n[1/4] Discovery documenti...");
  const docPaths = await discoverDocs(CONFIG.kbBasePath);
  console.log(`     ${docPaths.length} file .md trovati`);

  // 2. Chunking
  console.log("\n[2/4] Chunking...");
  const allChunks: Chunk[] = [];
  const chunksByCategory: Record<string, number> = {};
  const docsByCategory: Record<string, number> = {};
  for (const docPath of docPaths) {
    try {
      const chunks = await chunkDocument(docPath, CONFIG.kbBasePath);
      allChunks.push(...chunks);
      const cat = chunks[0]?.category ?? "unknown";
      chunksByCategory[cat] = (chunksByCategory[cat] ?? 0) + chunks.length;
      docsByCategory[cat] = (docsByCategory[cat] ?? 0) + 1;
    } catch (e) {
      console.error(`     ERROR ${docPath}: ${(e as Error).message}`);
    }
  }
  const totalTokens = allChunks.reduce((s, c) => s + (c.metadata.token_count_estimate as number), 0);
  console.log(`     Totale chunk: ${allChunks.length}`);
  console.log(`     Tokens stimati: ${totalTokens.toLocaleString()}`);
  console.log(`     Costo embedding stimato: $${(totalTokens / 1_000_000 * 0.02).toFixed(4)} (text-embedding-3-small @ $0.02/1M tok)`);
  console.log("\n     Per categoria:");
  Object.keys(chunksByCategory).sort().forEach((cat) => {
    console.log(`       ${cat.padEnd(40)} → ${docsByCategory[cat]} doc, ${chunksByCategory[cat]} chunk`);
  });

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Stop qui. Nessun embedding generato, nessun DB write.");
    return;
  }

  // 3. Embeddings
  console.log("\n[3/4] Generazione embeddings...");
  const embeddings = new Map<string, number[]>();
  const batchSize = CONFIG.batch.embeddingBatchSize;
  let embeddedCount = 0;
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    try {
      const batchEmb = await generateEmbeddingsBatch(batch.map((c) => c.content));
      batch.forEach((c, idx) => embeddings.set(c.source_path, batchEmb[idx]));
      embeddedCount += batch.length;
      console.log(`     ${embeddedCount}/${allChunks.length}`);
    } catch (e) {
      console.error(`     ERROR batch @${i}: ${(e as Error).message}`);
      throw e;
    }
  }

  // 4. Upsert
  console.log("\n[4/4] Upsert in ai_brain_documents...");
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  for (const chunk of allChunks) {
    const emb = embeddings.get(chunk.source_path);
    if (!emb) {
      console.error(`     SKIP no embedding: ${chunk.source_path}`);
      errors++;
      continue;
    }
    try {
      const r = await upsertChunk(chunk, emb);
      if (r.action === "insert") inserted++;
      else if (r.action === "update") updated++;
      else skipped++;
      if ((inserted + updated + skipped) % 50 === 0) {
        console.log(`     ${inserted + updated + skipped}/${allChunks.length} (ins ${inserted}, upd ${updated}, skip ${skipped})`);
      }
    } catch (e) {
      console.error(`     ERROR ${chunk.source_path}: ${(e as Error).message}`);
      errors++;
    }
  }

  // 5. Soft-delete obsoleti (solo se ingestion completa, no --area)
  let deletedCount = 0;
  if (!ONLY_AREA && supabase) {
    console.log("\n[5/5] Soft-delete chunks obsoleti...");
    const activePaths = allChunks.map((c) => c.source_path);
    const { data, error } = await supabase.rpc("brain_soft_delete_kb_chunks", {
      p_active_source_paths: activePaths,
    });
    if (error) console.error(`     ERROR: ${error.message}`);
    else deletedCount = data as number;
    console.log(`     Soft-deleted ${deletedCount} chunks`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("INGESTION COMPLETED");
  console.log("=".repeat(70));
  console.log(`Documenti: ${docPaths.length}`);
  console.log(`Chunk processati: ${allChunks.length}`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated: ${updated}`);
  console.log(`  skipped (hash invariato): ${skipped}`);
  console.log(`  errors: ${errors}`);
  console.log(`Soft-deleted: ${deletedCount}`);
  console.log("=".repeat(70));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("FATAL:", e);
    Deno.exit(1);
  });
}
