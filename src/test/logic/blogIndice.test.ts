import { describe, expect, it } from "vitest";
import { blogPosts, categories } from "@/data/blogPosts";
import { blogIndice, categorieBlog } from "@/data/blogIndice";

/**
 * Le pagine del sito leggono blogIndice (i dati di scheda) invece di blogPosts
 * (circa 1 MB di testi). L'indice si genera con `node scripts/blog-indice.mjs`:
 * se un articolo cambia e l'indice no, qui si vede.
 */
describe("indice del blog", () => {
  it("ha gli stessi articoli del blog, nello stesso ordine, senza testo né FAQ", () => {
    const attese = blogPosts.map(({ content: _testo, faqs: _faq, ...scheda }) => scheda);
    expect(blogIndice, "Lancia `node scripts/blog-indice.mjs` e committa src/data/blogIndice.ts").toEqual(attese);
  });

  it("ha le stesse categorie", () => {
    expect(categorieBlog).toEqual(categories);
  });

  it("non porta con sé il testo degli articoli", () => {
    for (const scheda of blogIndice) {
      expect(scheda).not.toHaveProperty("content");
      expect(scheda).not.toHaveProperty("faqs");
    }
  });
});
