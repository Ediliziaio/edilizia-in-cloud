import { describe, expect, it, vi } from "vitest";
import { onRequest } from "../../../functions/_middleware.js";
import { blogPosts } from "@/data/blogPosts";

describe("video delle guide nel fallback pubblico per i motori di ricerca", () => {
  it("mantiene video visibile e metadati coerenti quando manca il prerender", async () => {
    for (const post of blogPosts.filter((p) => p.video)) {
      const response = await onRequest({
        request: new Request(`https://www.ediliziaincloud.com/blog/${post.slug}/`, { headers: { "user-agent": "Googlebot" } }),
        env: { ASSETS: { fetch: vi.fn(async () => new Response("Missing", { status: 404 })) } },
        next: vi.fn(),
      });
      expect(response.status).toBe(200);
      const document = new DOMParser().parseFromString(await response.text(), "text/html");
      expect(document.querySelector("iframe")?.getAttribute("src")).toBe(`https://www.youtube-nocookie.com/embed/${post.video.youtubeId}`);
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) => JSON.parse(el.textContent));
      const article = schemas.find((schema) => schema["@type"] === "Article");
      expect(article.video).toMatchObject({ "@type": "VideoObject", duration: post.video.duration, uploadDate: post.video.uploadedAt, embedUrl: document.querySelector("iframe").getAttribute("src") });
    }
  });
});
