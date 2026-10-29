/**
 * I bundle dei PDF (preventivoRenderer.mjs, bgn-genera-pdf/_render.mjs) portano
 * dentro js-md5, dipendenza di @react-pdf. js-md5 decide dove attaccarsi così:
 *
 *   a = typeof process == "object" && process.versions && process.versions.node;
 *   a ? n = global : ...
 *
 * Il banner dei due build installa `globalThis.process` da `node:process`, che
 * ha `versions.node`: il ramo scatta sempre, e in Deno `global` non esiste. Il
 * 27/10/2026 generate-quote-pdf ha risposto 500 cinque volte con
 * «event loop error: ReferenceError: global is not defined». La cura è una riga
 * in più nel banner, qui sotto verificata in entrambi i sensi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

const BUNDLE = [
  "supabase/functions/_shared/preventivoRenderer.mjs",
  "supabase/functions/bgn-genera-pdf/_render.mjs",
];

const SHIM = "if(!globalThis.global) globalThis.global=globalThis;";
// Il ramo di js-md5, riscritto a mano: in Deno `global` non è dichiarato, e
// leggerlo è un ReferenceError, non `undefined`.
const RAMO_JS_MD5 = `
  var n = {};
  var a = typeof process == "object" && process.versions && process.versions.node;
  if (a) n = global;
  n.md5 = "attaccato";
  n.md5;
`;

/**
 * Un contesto vm nuovo è il gemello di Deno per quel che conta qui: c'è
 * `globalThis`, c'è il `process` che il banner installa, e `global` non esiste.
 */
function eseguiSenzaGlobal(prologo: string): string {
  return runInNewContext(prologo + RAMO_JS_MD5, { process: { versions: { node: "26" } } }) as string;
}

describe("bundle PDF: lo shim di `global`", () => {
  it("senza shim il ramo di js-md5 muore con ReferenceError", () => {
    expect(() => eseguiSenzaGlobal("")).toThrow(/global is not defined/);
  });

  it("con lo shim del banner il ramo passa", () => {
    expect(eseguiSenzaGlobal(SHIM)).toBe("attaccato");
  });

  it.each(BUNDLE)("%s contiene lo shim nel banner", (relativo) => {
    const file = readFileSync(path.resolve(process.cwd(), relativo), "utf8");
    const banner = file.split("\n").slice(0, 6).join("\n");
    // Se un giorno js-md5 non c'è più, lo shim non serve: il controllo si lega
    // alla presenza del ramo, non al nome della dipendenza.
    expect(file).toContain("n=global:");
    expect(banner).toContain(SHIM);
  });
});
