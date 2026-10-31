#!/usr/bin/env node
// Rigenera src/data/blogIndice.ts: i dati di scheda di ogni articolo (titolo,
// estratto, copertina, categoria…) senza il testo né le FAQ.
//
// Le pagine del sito che mostrano «articoli correlati» o l'elenco del blog
// importavano src/data/blogPosts.ts intero: circa 1 MB di testi per tre righe
// di titolo. Ora leggono l'indice; solo la pagina dell'articolo carica il
// testo. Il test blogIndice.test.ts fallisce se l'indice resta indietro.
//
//   node scripts/blog-indice.mjs

import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RADICE = resolve(import.meta.dirname, "..");
const cartella = mkdtempSync(join(tmpdir(), "blog-indice-"));
const uscita = join(cartella, "blog.mjs");

try {
  await build({
    entryPoints: [join(RADICE, "src/data/blogPosts.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: uscita,
    logLevel: "error",
  });
  const { blogPosts, FLO_AVATAR } = await import(pathToFileURL(uscita).href);
  const indice = blogPosts.map(({ content: _testo, faqs: _faq, ...scheda }) => scheda);
  // L'avatar è un'immagine in base64 di quasi 4 KB, uguale in ogni articolo:
  // nell'indice resta un riferimento alla costante condivisa.
  const SEGNAPOSTO = "__FLO_AVATAR__";
  const dati = JSON.stringify(
    indice.map((p) => (p.author?.avatar === FLO_AVATAR ? { ...p, author: { ...p.author, avatar: SEGNAPOSTO } } : p)),
    null,
    2,
  ).replaceAll(`"${SEGNAPOSTO}"`, "FLO_AVATAR");
  const testo = `// GENERATO da scripts/blog-indice.mjs: non modificare a mano.
// Dati di scheda degli articoli del blog, senza testo né FAQ (vedi lo script).
import type { BlogPost } from "./blogPosts";
import { FLO_AVATAR } from "./blogAuthor";

export type BlogPostScheda = Omit<BlogPost, "content" | "faqs">;

export const blogIndice: BlogPostScheda[] = ${dati};

export const categorieBlog = [...new Set(blogIndice.map((post) => post.category))] as string[];
`;
  writeFileSync(join(RADICE, "src/data/blogIndice.ts"), testo);
  console.log(`blogIndice.ts: ${indice.length} articoli`);
} finally {
  rmSync(cartella, { recursive: true, force: true });
}
