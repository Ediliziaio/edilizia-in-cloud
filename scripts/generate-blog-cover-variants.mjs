// List only variants present in public: a JPG remains usable without a WebP pair.
import { readdirSync, writeFileSync } from "node:fs";
const covers = new URL("../public/blog/covers/", import.meta.url);
const variants = readdirSync(covers).filter(name => name.endsWith(".webp")).sort()
  .map(name => `/blog/covers/${name}`);
writeFileSync(new URL("../src/data/blog-cover-variants.json", import.meta.url), JSON.stringify(variants, null, 2) + "\n");
console.log(`Blog image variants: ${variants.length} existing files`);
