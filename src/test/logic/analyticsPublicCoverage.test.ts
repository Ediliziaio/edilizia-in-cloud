import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { isPublicAnalyticsUrl } from "@/lib/site-analytics-scope";

const origin = "https://www.ediliziaincloud.com";

it("covers every explicit public prerender route, including the city landing pages", () => {
  const source = readFileSync(resolve("scripts/prerender.mjs"), "utf8");
  const routesBlock = source.split("const STATIC_ROUTES = [")[1]?.split("];", 1)[0];
  if (!routesBlock) throw new Error("Public prerender route inventory is missing");
  const routes = [...routesBlock.matchAll(/^\s*"(\/[^"\n]*)"/gm)].map((match) => match[1]);
  expect(routes.length).toBeGreaterThan(100);
  expect(routes.filter((route) => !isPublicAnalyticsUrl(origin + route))).toEqual([]);
});

it.each([
  "/software-gestionale-edilizia-citta-sconosciuta",
  "/azienda/clienti",
  "/admin",
  "/firma/token-riservato",
  "/preventivo/token-riservato",
  "/blog?email=persona@example.com",
  "/software-gestionale-edilizia-milano?token=riservato",
])("keeps unknown, private and personal-data URLs outside analytics: %s", (path) => {
  expect(isPublicAnalyticsUrl(origin + path)).toBe(false);
});

it("keeps the private app origin outside analytics even for a public path", () => {
  expect(isPublicAnalyticsUrl("https://app.ediliziaincloud.com/")).toBe(false);
});
