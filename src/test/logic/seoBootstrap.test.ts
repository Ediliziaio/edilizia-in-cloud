import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("index.html"), "utf8");
const script = source.split("<!-- Canonical + hreflang:")[1]?.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const selector = 'link[rel="canonical"],link[rel="alternate"][hreflang],meta[property="og:url"]';
afterEach(() => { document.querySelectorAll(selector).forEach(node => node.remove()); history.replaceState({}, "", "/"); });

it("reuses prerendered SEO tags across repeated bootstrap runs", () => {
  expect(script).toBeTruthy();
  history.replaceState({}, "", "/blog/controllo-ore-cantiere-prima-paghe");
  document.querySelectorAll(selector).forEach(node => node.remove());
  document.head.insertAdjacentHTML("beforeend", '<link rel="canonical" href="https://www.ediliziaincloud.com/old/"><link rel="canonical" href="https://www.ediliziaincloud.com/old/"><link rel="alternate" hreflang="it-IT" href="https://www.ediliziaincloud.com/old/"><link rel="alternate" hreflang="it-IT" href="https://www.ediliziaincloud.com/old/"><meta property="og:url" content="old"><meta property="og:url" content="old">');
  new Function(script!)();
  new Function(script!)();
  const canonical = document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]');
  expect(canonical).toHaveLength(1);
  expect(canonical[0].href).toBe("https://www.ediliziaincloud.com/blog/controllo-ore-cantiere-prima-paghe/");
  expect(document.querySelectorAll('link[rel="alternate"][hreflang="it-IT"]')).toHaveLength(1);
  expect(document.querySelectorAll('link[rel="alternate"][hreflang="x-default"]')).toHaveLength(1);
  expect(document.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);
  expect(document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content).toBe(canonical[0].href);
});
