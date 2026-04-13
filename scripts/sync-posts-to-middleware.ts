/**
 * Sync blog post metadata and content from blogPosts.ts into _middleware.js
 * Usage: bun run scripts/sync-posts-to-middleware.ts
 */

import { blogPosts } from "../src/data/blogPosts";
import { readFileSync, writeFileSync } from "fs";

function escJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function renderContentToHtml(
  content: typeof blogPosts[0]["content"]
): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "intro" && block.body) {
      // intro is already used as the <p> intro in buildHtml
      continue;
    }
    if (block.type === "section" && block.heading && block.body) {
      parts.push(
        `<h2>${escapeHtml(block.heading)}</h2><p>${escapeHtml(block.body)}</p>`
      );
    }
    if (block.type === "list" && block.heading && block.items) {
      const items = block.items
        .map((i: string) => `<li>${escapeHtml(i)}</li>`)
        .join("");
      parts.push(
        `<h2>${escapeHtml(block.heading)}</h2><ul>${items}</ul>`
      );
    }
    if (block.type === "quote" && block.quote) {
      const attr = block.author ? ` — ${escapeHtml(block.author)}` : "";
      parts.push(`<blockquote><p>${escapeHtml(block.quote)}${attr}</p></blockquote>`);
    }
  }
  return parts.join("\n    ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Build POST_META entries
const postMetaLines: string[] = [];
const postContentLines: string[] = [];

for (const post of blogPosts) {
  const titleParts = post.title.split("|");
  const h1 = titleParts[0].trim();
  const metaTitle = post.title.includes("|")
    ? post.title
    : `${post.title} | Blog Edilizia in Cloud`;

  postMetaLines.push(
    `      "${post.slug}": { title: "${escJs(metaTitle)}", description: "${escJs(post.excerpt)}", h1: "${escJs(h1)}", publishedAt: "${post.publishedAt}", category: "${escJs(post.category)}", tags: [${post.tags.map((t) => `"${escJs(t)}"`).join(", ")}], coverImage: "${escJs(post.coverImage)}" },`
  );

  const contentHtml = renderContentToHtml(post.content);
  postContentLines.push(
    `      "${post.slug}": \`${contentHtml.replace(/`/g, "\\`")}\`,`
  );
}

const postMetaBlock = `    const POST_META = {\n${postMetaLines.join("\n")}\n    };`;
const postContentBlock = `    const POST_CONTENT = {\n${postContentLines.join("\n")}\n    };`;

// Read middleware
const middlewarePath = "functions/_middleware.js";
let middleware = readFileSync(middlewarePath, "utf8");

// Replace POST_META block (between "const POST_META = {" and its closing "};")
const metaStart = middleware.indexOf("    const POST_META = {");
const metaEnd = middleware.indexOf("\n    };", metaStart) + 7; // include "    };"
if (metaStart === -1) {
  console.error("Could not find POST_META in middleware");
  process.exit(1);
}
middleware =
  middleware.slice(0, metaStart) +
  postMetaBlock +
  middleware.slice(metaEnd);

// Insert POST_CONTENT right after POST_META block
const metaEndNew = middleware.indexOf("    const POST_META = {");
const insertAfter = middleware.indexOf("\n    };", metaEndNew) + 7;

// Check if POST_CONTENT already exists
if (middleware.includes("const POST_CONTENT = {")) {
  const contentStart = middleware.indexOf("    const POST_CONTENT = {");
  const contentEnd = middleware.indexOf("\n    };", contentStart) + 7;
  middleware =
    middleware.slice(0, contentStart) +
    postContentBlock +
    middleware.slice(contentEnd);
} else {
  middleware =
    middleware.slice(0, insertAfter) +
    "\n" +
    postContentBlock +
    middleware.slice(insertAfter);
}

writeFileSync(middlewarePath, middleware, "utf8");
console.log(`✓ Updated ${middlewarePath}`);
console.log(`  ${blogPosts.length} posts synced to POST_META and POST_CONTENT`);
