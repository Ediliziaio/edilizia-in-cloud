import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error modulo .mjs degli script di build, senza tipi
import { dizionarioDaSorgente } from "../../../scripts/dizionarioInJson.mjs";

/**
 * Nella build i dizionari delle lingue si pubblicano come JSON (plugin `dizionariComeJson`), perché
 * 50 MB di TypeScript mandavano Cloudflare oltre gli 8 GB di memoria (24/11/2026). Il JSON deve
 * essere identico al dizionario vero: se un dizionario cambia forma, qui diventa rosso prima della build.
 */
const CARTELLA = resolve(__dirname, "../../lib/campo/lingua/dizionari");
const leggi = (nome: string) => readFileSync(resolve(CARTELLA, `${nome}.ts`), "utf8");
const file = readdirSync(CARTELLA).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, ""));

describe("dizionari pubblicati come JSON", () => {
  it("ci sono tutte le lingue", () => {
    expect(file.length).toBeGreaterThanOrEqual(10);
  });
  for (const nome of file) {
    it(`${nome}: il JSON è uguale al dizionario`, async () => {
      const vero = (await import(`../../lib/campo/lingua/dizionari/${nome}.ts`)).default as Record<string, string>;
      expect(dizionarioDaSorgente(leggi(nome), nome, leggi)).toEqual(vero);
    }, 60_000);
  }
  it("una forma che non si legge ferma la build col nome del file", () => {
    expect(() => dizionarioDaSorgente("const dizionario = { chiave: 1 };", "rotto")).toThrow(/rotto: il dizionario non si legge come JSON/);
    expect(() => dizionarioDaSorgente('import x from "./x";\nconst dizionario = {\n  ...x,\n};', "eredita")).toThrow(/eredita da «x»/);
  });
});
