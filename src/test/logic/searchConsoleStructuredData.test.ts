import { describe, expect, it } from "vitest";
import { blogPosts } from "@/data/blogPosts";
import { buildBlogHowTo } from "@/lib/seo/blogHowTo";
import { serializeJsonLd } from "@/lib/seo/serializeJsonLd";
import { isVideoUploadDate, RENDER_INFISSI_VIDEO } from "@/lib/seo/videoMetadata";

describe("regressioni Search Console", () => {
  it("usa la data e la durata del video incorporato", () => {
    expect(isVideoUploadDate(RENDER_INFISSI_VIDEO.uploadDate)).toBe(true);
    expect(new Date(RENDER_INFISSI_VIDEO.uploadDate).toISOString()).toBe("2026-05-14T10:44:17.000Z");
    expect(RENDER_INFISSI_VIDEO.duration).toBe("PT38S");
  });
  it.each([undefined, "2026-04-27", "2026-04-27T10:00:00", "2026-02-30T10:00:00Z", "2026-13-01T10:00:00Z"])("non pubblica date incomplete o inesistenti: %s", (date) => {
    expect(isVideoUploadDate(date)).toBe(false);
  });
  it("Cassa Edile mantiene le FAQ ma non trasforma prestazioni ed errori in istruzioni", () => {
    const post = blogPosts.find((post) => post.slug === "cassa-edile-come-funziona")!;
    expect(post.faqs!.length).toBeGreaterThan(0);
    expect(buildBlogHowTo(post, post.coverImage)).toBeNull();
  });
  it("la numerazione delle istruzioni non riparte da 1 a ogni elenco", () => {
    const post = { ...blogPosts[0], slug: "come-eseguire-un-lavoro", content: [
      { type: "list" as const, items: ["Uno: testo", "Due: testo"] },
      { type: "list" as const, items: ["Tre: testo"] },
    ] };
    expect(buildBlogHowTo(post, post.coverImage)!.step.map((step) => step.position)).toEqual([1, 2, 3]);
  });
  it("il prerender conserva testo e virgolette senza chiudere prematuramente lo script", () => {
    const data = { "@type": "Article", description: 'Testo "citato" </script><p> & fine' };
    const encoded = serializeJsonLd(data);
    expect(encoded).not.toContain("</script>");
    expect(JSON.parse(encoded)).toEqual(data);
  });
});

describe("articolo Cassa Edile nel fallback dei crawler", () => {
  it("restituisce Article leggibile anche quando il prerender non è disponibile", async () => {
    const previousCaches = (globalThis as unknown as { caches?: unknown }).caches;
    (globalThis as unknown as { caches: unknown }).caches = {
      default: { match: async (): Promise<undefined> => undefined, put: async (): Promise<undefined> => undefined },
    };
    try {
      const middlewarePath = "../../../functions/_middleware.js";
      const { onRequest } = await import(/* @vite-ignore */ middlewarePath);
      const response = await onRequest({
        request: new Request("https://www.ediliziaincloud.com/blog/cassa-edile-come-funziona/", {
          headers: { "user-agent": "Googlebot" },
        }),
        next: async () => new Response("<div id=root></div>", { headers: { "content-type": "text/html" } }),
        env: { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
        waitUntil: () => {},
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((match) => JSON.parse(match[1]));
      expect(schemas.length).toBeGreaterThan(0);
      const article = schemas.find((schema) => schema["@type"] === "Article");
      expect(article.headline).toContain("Cassa Edile");
      expect(typeof article.datePublished).toBe("string");
      expect(schemas.some((schema) => schema["@type"] === "HowTo")).toBe(false);
    } finally {
      (globalThis as unknown as { caches?: unknown }).caches = previousCaches;
    }
  });
});
