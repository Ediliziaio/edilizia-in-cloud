/**
 * Track 2 — KB Ingestion Client (via edge function)
 *
 * Pattern client-server diviso (sicuro: secret restano server-side):
 *   Locale: discovery + parse + chunking
 *   Edge function (kb-ingest-batch): embedding (OpenAI) + upsert (service_role)
 *
 * USO:
 *   # Servono: SUPABASE_URL, SUPABASE_ANON_KEY (per JWT), USER_JWT (token super_admin)
 *   deno run -A scripts/kb-ingestion/ingest-via-edge.ts --dry-run
 *   deno run -A scripts/kb-ingestion/ingest-via-edge.ts --area=02-finanza-cashflow
 *   deno run -A scripts/kb-ingestion/ingest-via-edge.ts
 */

import { walk } from "jsr:@std/fs@1/walk";
import { parse as parseYaml } from "jsr:@std/yaml@1";

const args = Deno.args;
const DRY_RUN = args.includes("--dry-run");
const ONLY_AREA = args.find((a) => a.startsWith("--area="))?.split("=")[1];
const BATCH_SIZE = parseInt(args.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? "50", 10);

const CONFIG = {
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "https://rsbrguhkodgnqfomrevo.supabase.co",
  userJwt: Deno.env.get("USER_JWT") ?? "",  // JWT super_admin
  kbBasePath: Deno.env.get("KB_BASE_PATH") ?? "./knowledge-base",
  excludeAreas: ["00-meta"],
  chunking: {
    maxChunkTokens: 1500,
    minChunkTokens: 50,
    windowSizeTokens: 1000,
    windowOverlapTokens: 150,
    includeDocTitlePrefix: true,
    includeSectionTitlePrefix: true,
  },
};

if (!DRY_RUN && !CONFIG.userJwt) {
  console.error("FATAL: USER_JWT (super_admin token) richiesto. Estrai dal browser.");
  Deno.exit(1);
}

// ============ Types ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

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
  source_path: string;
  title: string;
  content: string;
  category: string;
  source_hash: string;
  metadata: AnyObj;
}

// ============ Discovery + parsing ============

async function discoverDocs(basePath: string): Promise<string[]> {
  const cleanBase = basePath.replace(/^\.\//, "").replace(/[\/\\]$/, "");
  const docs: string[] = [];
  for await (const entry of walk(basePath, { exts: [".md"] })) {
    if (!entry.isFile) continue;
    if (entry.name === "_README.md" || entry.name === "README.md") continue;
    const idx = entry.path.indexOf(cleanBase);
    const rel = idx >= 0 ? entry.path.substring(idx + cleanBase.length).replace(/^[\/\\]/, "") : entry.path;
    const areaId = rel.split(/[\/\\]/)[0];
    if (CONFIG.excludeAreas.includes(areaId)) continue;
    if (ONLY_AREA && areaId !== ONLY_AREA) continue;
    docs.push(entry.path);
  }
  return docs.sort();
}

function parseFrontmatter(content: string): { fm: DocFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: content };

  let yamlText = match[1];
  yamlText = yamlText.replace(/\[([^\]]*)\]/g, (_full, inner: string) => {
    const items = inner.split(",").map((it) => {
      const t = it.trim();
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
  } catch {
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
}

function splitByHeading(body: string, level: number): Section[] {
  const prefix = "#".repeat(level) + " ";
  const lines = body.split("\n");
  const sections: Section[] = [];
  let cur: Section | null = null;

  for (const line of lines) {
    if (line.startsWith(prefix) && !line.startsWith(prefix + "#")) {
      if (cur) sections.push(cur);
      cur = { title: line.replace(prefix, "").trim(), level, content: "" };
    } else if (cur) {
      cur.content += line + "\n";
    } else {
      if (sections.length === 0) {
        cur = { title: "Introduzione", level, content: line + "\n" };
        sections.push(cur);
      }
    }
  }
  if (cur && !sections.includes(cur)) sections.push(cur);
  return sections.filter((s) => s.content.trim().length > 0);
}

function slidingWindow(text: string, sizeTok: number, overTok: number): string[] {
  const sizeC = sizeTok * 4;
  const overC = overTok * 4;
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + sizeC, text.length);
    out.push(text.substring(start, end));
    if (end >= text.length) break;
    start = end - overC;
  }
  return out;
}

async function chunkDocument(docPath: string, basePath: string): Promise<Chunk[]> {
  const fullText = await Deno.readTextFile(docPath);
  const { fm, body } = parseFrontmatter(fullText);

  const cleanBase = basePath.replace(/^\.\//, "").replace(/[\/\\]$/, "");
  const idx = docPath.indexOf(cleanBase);
  const rel = (idx >= 0 ? docPath.substring(idx + cleanBase.length).replace(/^[\/\\]/, "") : docPath).replace(/\\/g, "/");

  const docTitle = String(fm.titolo ?? rel);
  const category = String(fm.area ?? rel.split("/")[0]);

  const h2 = splitByHeading(body, 2);
  if (h2.length === 0) h2.push({ title: docTitle, level: 2, content: body });

  const chunks: Chunk[] = [];
  for (let sIdx = 0; sIdx < h2.length; sIdx++) {
    const section = h2[sIdx];
    const tokenCount = estimateTokens(section.content);

    let parts: string[];
    if (tokenCount <= CONFIG.chunking.maxChunkTokens) parts = [section.content];
    else {
      const h3 = splitByHeading(section.content, 3);
      if (h3.length > 1 && h3.every((h) => estimateTokens(h.content) <= CONFIG.chunking.maxChunkTokens)) {
        parts = h3.map((h) => `### ${h.title}\n${h.content}`);
      } else {
        parts = slidingWindow(section.content, CONFIG.chunking.windowSizeTokens, CONFIG.chunking.windowOverlapTokens);
      }
    }

    for (let cIdx = 0; cIdx < parts.length; cIdx++) {
      const trimmed = parts[cIdx].trim();
      if (estimateTokens(trimmed) < CONFIG.chunking.minChunkTokens) continue;

      let content = "";
      if (CONFIG.chunking.includeDocTitlePrefix) content += `[Titolo doc: ${docTitle}]\n`;
      if (CONFIG.chunking.includeSectionTitlePrefix && section.title !== "Introduzione") {
        content += `[Sezione: ${section.title}]\n\n`;
      }
      content += trimmed;

      const sectionSlug = slugify(section.title) || `s${sIdx + 1}`;
      const sourcePath = `${rel}#${sectionSlug}#${cIdx + 1}`;

      chunks.push({
        source_path: sourcePath,
        title: `${docTitle} — ${section.title}`,
        content,
        category,
        source_hash: await sha256(content),
        metadata: {
          doc_path: rel,
          doc_title: docTitle,
          section_title: section.title,
          section_number: sIdx + 1,
          tags: fm.tags ?? [],
          livello: fm.livello ?? null,
          kpi_correlati: fm.kpi_correlati ?? [],
          versione_doc: fm.versione ?? "1.0",
          aggiornato_il: fm.aggiornato_il ?? null,
          chunk_index: cIdx + 1,
          chunk_total: parts.length,
          char_count: trimmed.length,
          token_count_estimate: estimateTokens(trimmed),
        },
      });
    }
  }
  return chunks;
}

// ============ Edge function call ============

async function ingestBatch(chunks: Chunk[]): Promise<AnyObj> {
  const url = `${CONFIG.supabaseUrl}/functions/v1/kb-ingest-batch`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.userJwt}`,
      "apikey": CONFIG.userJwt,
    },
    body: JSON.stringify({ chunks }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function softDeleteOrphans(activePaths: string[]): Promise<number> {
  const url = `${CONFIG.supabaseUrl}/rest/v1/rpc/brain_soft_delete_kb_chunks`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.userJwt}`,
      "apikey": CONFIG.userJwt,
    },
    body: JSON.stringify({ p_active_source_paths: activePaths }),
  });
  if (!res.ok) {
    console.warn(`     soft-delete RPC call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return 0;
  }
  const data = await res.json();
  return Number(data) || 0;
}

// ============ Main ============

async function main() {
  console.log("=".repeat(70));
  console.log(`KB INGESTION via Edge — ${DRY_RUN ? "DRY RUN" : "LIVE"}${ONLY_AREA ? ` (area: ${ONLY_AREA})` : ""}`);
  console.log("=".repeat(70));
  console.log(`KB Path: ${CONFIG.kbBasePath}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  // Discovery
  console.log("\n[1/4] Discovery...");
  const docPaths = await discoverDocs(CONFIG.kbBasePath);
  console.log(`     ${docPaths.length} file .md`);

  // Chunking
  console.log("\n[2/4] Chunking...");
  const allChunks: Chunk[] = [];
  for (const p of docPaths) {
    try {
      const chunks = await chunkDocument(p, CONFIG.kbBasePath);
      allChunks.push(...chunks);
    } catch (e) {
      console.error(`     ERROR ${p}: ${(e as Error).message}`);
    }
  }
  console.log(`     ${allChunks.length} chunk totali`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Stop. No DB write.");
    return;
  }

  // Ingestion via edge
  console.log(`\n[3/4] Ingestion via kb-ingest-batch (batch ${BATCH_SIZE})...`);
  let totIns = 0, totUpd = 0, totSkip = 0, totErr = 0;
  const startAt = Date.now();
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    try {
      const res = await ingestBatch(batch);
      const s = res.stats ?? {};
      totIns += s.inserted ?? 0;
      totUpd += s.updated ?? 0;
      totSkip += s.skipped ?? 0;
      totErr += s.errors ?? 0;
      const elapsed = Math.round((Date.now() - startAt) / 1000);
      const progress = i + batch.length;
      console.log(
        `     ${progress}/${allChunks.length} (${Math.round(100 * progress / allChunks.length)}%) — ${elapsed}s — ins ${totIns}, upd ${totUpd}, skip ${totSkip}, err ${totErr}`,
      );
    } catch (e) {
      console.error(`     BATCH @${i} FAILED: ${(e as Error).message}`);
      totErr += batch.length;
    }
  }

  // Soft-delete orphans (solo se ingestion completa)
  let deleted = 0;
  if (!ONLY_AREA) {
    console.log("\n[4/4] Soft-delete chunks orfani...");
    deleted = await softDeleteOrphans(allChunks.map((c) => c.source_path));
    console.log(`     ${deleted} chunks soft-deleted`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("INGESTION COMPLETED");
  console.log("=".repeat(70));
  console.log(`Documenti: ${docPaths.length}`);
  console.log(`Chunks: ${allChunks.length}`);
  console.log(`  inserted: ${totIns}`);
  console.log(`  updated: ${totUpd}`);
  console.log(`  skipped: ${totSkip}`);
  console.log(`  errors: ${totErr}`);
  console.log(`Soft-deleted: ${deleted}`);
  console.log(`Tempo totale: ${Math.round((Date.now() - startAt) / 1000)}s`);
  console.log("=".repeat(70));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("FATAL:", e);
    Deno.exit(1);
  });
}
