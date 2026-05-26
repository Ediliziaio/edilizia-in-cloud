/**
 * 02-chunk.ts — split semantico dei .md in chunk da ~800 token.
 *
 * Strategia:
 *   1. Split per H2/H3 (sezioni naturali del manuale)
 *   2. Se sezione > 800 token → split per paragrafi mantenendo H2 come prefisso
 *   3. Se sezione < 200 token → merge col successivo
 *
 * Token estimate: ~4 char/token italiano.
 *
 * Output: scripts/kb-ingest/.cache/chunks.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DOCX_MAPPING, CACHE_DIR } from "./persona-mapping";

const TARGET_TOKENS = 800;
const MIN_TOKENS = 200;
const MAX_TOKENS = 1100;
const CHAR_PER_TOKEN = 4;

const TARGET_CHARS = TARGET_TOKENS * CHAR_PER_TOKEN;
const MIN_CHARS = MIN_TOKENS * CHAR_PER_TOKEN;
const MAX_CHARS = MAX_TOKENS * CHAR_PER_TOKEN;

export type Chunk = {
  source_book: string;
  kb_section: string;
  kb_subsection: string | null;
  kb_priority: "detail" | "verifica" | "esercizio";
  persona_keys: string[];
  chunk_idx: number;
  title: string;
  content: string;
  content_hash: string;
  char_count: number;
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function splitByHeaders(md: string): { header: string; body: string }[] {
  // Split su H2 e H3. H1 lo trattiamo come titolo del libro (skippato).
  const lines = md.split("\n");
  const sections: { header: string; body: string }[] = [];
  let currentHeader = "Introduzione";
  let buffer: string[] = [];

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2 || h3) {
      if (buffer.length > 0) {
        sections.push({ header: currentHeader, body: buffer.join("\n").trim() });
      }
      currentHeader = (h2 ?? h3)![1].trim();
      buffer = [];
    } else if (!line.match(/^#\s+/)) {
      // skip H1 (titolo libro)
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    sections.push({ header: currentHeader, body: buffer.join("\n").trim() });
  }
  return sections.filter((s) => s.body.length > 0);
}

function splitOversized(section: { header: string; body: string }): {
  header: string;
  body: string;
}[] {
  if (section.body.length <= MAX_CHARS) return [section];

  const paragraphs = section.body.split(/\n\n+/);
  const result: { header: string; body: string }[] = [];
  let buf = "";

  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > TARGET_CHARS && buf.length > MIN_CHARS) {
      result.push({ header: section.header, body: buf.trim() });
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.length > 0) {
    result.push({ header: section.header, body: buf.trim() });
  }
  return result;
}

function mergeUndersized(
  sections: { header: string; body: string }[]
): { header: string; body: string }[] {
  const result: { header: string; body: string }[] = [];
  for (const sec of sections) {
    if (
      result.length > 0 &&
      result[result.length - 1].body.length < MIN_CHARS &&
      result[result.length - 1].body.length + sec.body.length < TARGET_CHARS
    ) {
      const prev = result[result.length - 1];
      result[result.length - 1] = {
        header: prev.header,
        body: `${prev.body}\n\n## ${sec.header}\n\n${sec.body}`,
      };
    } else {
      result.push(sec);
    }
  }
  return result;
}

async function processBook(
  entry: (typeof DOCX_MAPPING)[number]
): Promise<Chunk[]> {
  const mdPath = path.join(CACHE_DIR, `${entry.slug}.md`);
  let md: string;
  try {
    md = await fs.readFile(mdPath, "utf-8");
  } catch {
    console.warn(`[skip] ${entry.slug}.md mancante (lancia 01-parse prima?)`);
    return [];
  }

  const raw = splitByHeaders(md);
  const sized = raw.flatMap(splitOversized);
  const merged = mergeUndersized(sized);

  return merged.map((sec, idx) => {
    const fullContent = `## ${sec.header}\n\n${sec.body}`;
    return {
      source_book: entry.slug,
      kb_section: entry.kb_section,
      kb_subsection: sec.header.slice(0, 100),
      kb_priority: entry.kb_priority,
      persona_keys: entry.persona_keys,
      chunk_idx: idx,
      title: `${entry.slug} — ${sec.header}`.slice(0, 200),
      content: fullContent,
      content_hash: sha256(fullContent),
      char_count: fullContent.length,
    };
  });
}

async function main() {
  console.log(`[chunk] target tokens: ${TARGET_TOKENS}`);
  const allChunks: Chunk[] = [];

  for (const entry of DOCX_MAPPING) {
    const chunks = await processBook(entry);
    if (chunks.length > 0) {
      console.log(`[chunk] ${entry.slug}: ${chunks.length} chunk`);
      allChunks.push(...chunks);
    }
  }

  const outPath = path.join(CACHE_DIR, "chunks.json");
  await fs.writeFile(outPath, JSON.stringify(allChunks, null, 2), "utf-8");
  console.log(`[chunk] done. ${allChunks.length} chunk → ${outPath}`);

  // Stats
  const totalChars = allChunks.reduce((s, c) => s + c.char_count, 0);
  const estTokens = Math.round(totalChars / CHAR_PER_TOKEN);
  const estCost = (estTokens * 0.00002) / 1000; // text-embedding-3-small
  console.log(
    `[chunk] tot ${totalChars} char ≈ ${estTokens} token → embedding cost ≈ $${estCost.toFixed(2)}`
  );
}

main().catch((err) => {
  console.error("[chunk] FAIL:", err);
  process.exit(1);
});
