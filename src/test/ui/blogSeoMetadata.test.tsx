import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useSEO, type SEOOptions } from "@/hooks/useSEO";
import { BLOG_AUTHOR } from "@/data/blogAuthorProfile";
import { blogPosts } from "@/data/blogPosts";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
function Metadata({ options }: { options: SEOOptions }): null { useSEO(options); return null; }
function render(options: SEOOptions) {
  if (!root) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  act(() => root!.render(<Metadata options={options} />));
}
const values = () => [...document.querySelectorAll<HTMLMetaElement>('meta[property="article:tag"]')].map((meta) => meta.content);

afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = undefined; host = undefined; });

describe("autore e metadati degli articoli", () => {
  it("nessun articolo firmato Flo resta escluso dall'archivio di Florin Andriciuc", () => {
    expect(blogPosts.length).toBeGreaterThan(0);
    expect(blogPosts.every((post) => post.author.name === BLOG_AUTHOR.name)).toBe(true);
  });
  it("mantiene tutti i tag, senza duplicati, e collega il profilo dell'autore", () => {
    render({ title: "Cassa Edile", description: "Guida", type: "article", articleAuthor: BLOG_AUTHOR.url, tags: ["cassa edile", "CCNL", "contributi", "CCNL"] });
    expect(values()).toEqual(["cassa edile", "CCNL", "contributi"]);
    expect(document.querySelector<HTMLMetaElement>('meta[property="article:author"]')?.content).toBe(BLOG_AUTHOR.url);
    render({ title: "Cantieri", description: "Guida", type: "article", tags: ["cantieri"] });
    expect(values()).toEqual(["cantieri"]);
    render({ title: "Home", description: "Pagina", type: "website" });
    expect(values()).toEqual([]);
  });
  it("ripristina i tag già presenti quando il componente viene smontato", () => {
    const original = document.createElement("meta");
    original.setAttribute("property", "article:tag"); original.content = "tag prerender"; document.head.appendChild(original);
    render({ title: "Pagina", description: "Guida", type: "article", tags: ["tag aggiornato"] });
    expect(values()).toEqual(["tag aggiornato"]);
    act(() => root!.unmount()); root = undefined;
    expect(values()).toEqual(["tag prerender"]);
    original.remove();
  });
});
