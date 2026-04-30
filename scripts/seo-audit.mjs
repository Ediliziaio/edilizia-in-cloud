import fs from "node:fs";
import { onRequest } from "../functions/_middleware.js";

const BASE = "https://www.ediliziaincloud.com";
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");
const robots = fs.readFileSync("public/robots.txt", "utf8");
const llms = fs.readFileSync("public/llms.txt", "utf8");
const llmsFull = fs.readFileSync("public/llms-full.txt", "utf8");
const headers = fs.readFileSync("public/_headers", "utf8");

const urls = [...sitemap.matchAll(/<loc>https:\/\/www\.ediliziaincloud\.com([^<]*)<\/loc>/g)]
  .map((match) => match[1] || "/");

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function unique(items) {
  return [...new Set(items)];
}

async function botResponse(path, hostname = "www.ediliziaincloud.com") {
  return onRequest({
    request: new Request(`https://${hostname}${path}`, {
      headers: { "user-agent": "Googlebot/2.1" },
    }),
    next: async () => new Response("SPA", { status: 200 }),
  });
}

assert(urls.length === 181, `Sitemap deve avere 181 URL, trovati ${urls.length}`);
assert(unique(urls).length === urls.length, "Sitemap contiene URL duplicati");
assert(urls.includes("/pianifica-migrazione"), "Sitemap non contiene /pianifica-migrazione");
assert(
  urls.filter((url) => url.startsWith("/software-gestionale-edilizia-")).length === 36,
  "Sitemap deve contenere 36 city landing page",
);
assert(!llms.includes("35 città") && !llmsFull.includes("35 città"), "llms contiene ancora il vecchio conteggio 35 città");
assert(llms.includes("/pianifica-migrazione") && llmsFull.includes("/pianifica-migrazione"), "llms non contiene la pagina migrazione");

const requiredDisallows = [
  "/azienda/",
  "/cliente/",
  "/dipendente/",
  "/venditore/",
  "/partner/",
  "/tecnico/",
  "/campo/",
  "/portale/",
  "/portale-cliente/",
  "/preventivo/",
  "/offerta/",
  "/firma/",
  "/firma-odv/",
  "/firma-fea/",
  "/prenota/",
  "/feedback/",
  "/ref/",
];
for (const path of requiredDisallows) {
  assert(robots.includes(`Disallow: ${path}`), `robots.txt non blocca ${path}`);
}

for (const path of ["/llms.txt", "/llms-full.txt", "/62ac6a799ade356135bf527565c13e17.txt", "/ref/*"]) {
  assert(headers.includes(path), `_headers non contiene regola per ${path}`);
}

let sitemapFailures = 0;
for (const path of urls) {
  const response = await botResponse(path);
  const robotsHeader = response.headers.get("x-robots-tag") || "";
  if (response.status !== 200 || !robotsHeader.includes("index, follow")) {
    sitemapFailures += 1;
  }
}
assert(sitemapFailures === 0, `${sitemapFailures} URL sitemap non rispondono 200 index,follow al bot`);

const noindexPaths = [
  ["/azienda/cruscotto", "www.ediliziaincloud.com"],
  ["/login", "www.ediliziaincloud.com"],
  ["/preventivo/test", "www.ediliziaincloud.com"],
  ["/ref/test", "www.ediliziaincloud.com"],
  ["/azienda/cruscotto", "app.ediliziaincloud.com"],
];

for (const [path, host] of noindexPaths) {
  const response = await botResponse(path, host);
  const robotsHeader = response.headers.get("x-robots-tag") || "";
  assert(robotsHeader.includes("noindex"), `${host}${path} non restituisce noindex ai bot`);
}

const unknown = await botResponse("/pagina-che-non-esiste");
assert(unknown.status === 404, "Route pubblica sconosciuta deve restituire 404 ai bot");
assert((unknown.headers.get("x-robots-tag") || "").includes("noindex"), "404 bot deve avere noindex");

if (failures.length) {
  console.error("SEO audit fallito:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SEO audit OK: ${urls.length} URL sitemap, ${requiredDisallows.length} disallow critici, noindex privato verificato.`);
