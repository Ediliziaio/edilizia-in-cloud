/**
 * 01-parse-docx.ts — converte i 22 .docx in markdown puliti.
 *
 * Input:  /Users/agenteai/Downloads/libri me manuali/*.docx
 * Output: scripts/kb-ingest/.cache/<slug>.md
 *
 * Usa mammoth con styleMap per preservare H1/H2/H3 → semantic chunking dopo.
 */

import mammoth from "mammoth";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DOCX_MAPPING, SOURCE_DIR, CACHE_DIR } from "./persona-mapping";

const STYLE_MAP = [
  "p[style-name='Titolo 1'] => h1:fresh",
  "p[style-name='Titolo 2'] => h2:fresh",
  "p[style-name='Titolo 3'] => h3:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "b => strong",
  "i => em",
];

async function parseOne(filename: string, slug: string): Promise<void> {
  const srcPath = path.join(SOURCE_DIR, filename);

  try {
    await fs.access(srcPath);
  } catch {
    console.warn(`[skip] file mancante: ${filename}`);
    return;
  }

  const buffer = await fs.readFile(srcPath);
  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    { styleMap: STYLE_MAP }
  );

  // HTML → Markdown semplice (basic — preserva H1/H2/H3 + paragrafi)
  const md = html
    .replace(/<h1>(.*?)<\/h1>/g, "\n\n# $1\n\n")
    .replace(/<h2>(.*?)<\/h2>/g, "\n\n## $1\n\n")
    .replace(/<h3>(.*?)<\/h3>/g, "\n\n### $1\n\n")
    .replace(/<h4>(.*?)<\/h4>/g, "\n\n#### $1\n\n")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, inner) =>
      inner
        .split("\n")
        .map((line: string) => `> ${line.trim()}`)
        .join("\n")
    )
    .replace(/<p>(.*?)<\/p>/g, "\n$1\n")
    .replace(/<ul>([\s\S]*?)<\/ul>/g, (_, inner: string) =>
      "\n" +
      inner
        .replace(/<li>(.*?)<\/li>/g, "- $1\n")
        .replace(/<\/?ul>/g, "")
    )
    .replace(/<ol>([\s\S]*?)<\/ol>/g, (_, inner: string) =>
      "\n" +
      inner
        .replace(/<li>(.*?)<\/li>/g, (_m, t, idx) => `1. ${t}\n`)
        .replace(/<\/?ol>/g, "")
    )
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  await fs.mkdir(CACHE_DIR, { recursive: true });
  const outPath = path.join(CACHE_DIR, `${slug}.md`);
  await fs.writeFile(outPath, md, "utf-8");

  const chars = md.length;
  const warns = messages.filter((m) => m.type === "warning").length;
  console.log(
    `[ok] ${filename} → ${slug}.md (${chars} char, ${warns} warning)`
  );
}

async function main() {
  console.log(`[parse] source dir: ${SOURCE_DIR}`);
  console.log(`[parse] cache  dir: ${CACHE_DIR}`);
  console.log(`[parse] file:        ${DOCX_MAPPING.length}`);

  for (const entry of DOCX_MAPPING) {
    await parseOne(entry.filename, entry.slug);
  }

  console.log("[parse] done.");
}

main().catch((err) => {
  console.error("[parse] FAIL:", err);
  process.exit(1);
});
