/**
 * Foto più leggere nel preventivo fotovoltaico (26/10/2026): il documento incorpora tutte le foto in base64 e la
 * funzione che lo genera ha un tempo di calcolo e una memoria limitati. Le foto di serie sono ricodificate a 1280
 * punti di lato, le viste satellitari si chiedono in JPEG (il PNG pesava dieci volte tanto) e le foto del deposito
 * si chiedono ridimensionate.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const radice = process.cwd();
const leggi = (f: string) => readFileSync(resolve(radice, f), "utf8");

const jpgDi = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? jpgDi(p) : /\.jpe?g$/i.test(p) ? [p] : [];
  });

describe("foto di serie dei PDF", () => {
  const foto = jpgDi(resolve(radice, "public/pdf-stock"));

  it("nessuna supera i 450 kB: il documento ne incorpora decine", () => {
    const pesanti = foto.filter((f) => statSync(f).size > 450_000);
    expect(pesanti.map((f) => f.replace(radice, ""))).toEqual([]);
  });

  it("insieme pesano meno di 20 MB (prima 32)", () => {
    const totale = foto.reduce((s, f) => s + statSync(f).size, 0);
    expect(totale).toBeLessThan(20_000_000);
  });

  it("le foto del fotovoltaico, che stanno tutte nel documento, pesano meno di 5 MB", () => {
    const totale = jpgDi(resolve(radice, "public/pdf-stock/fotovoltaico")).reduce((s, f) => s + statSync(f).size, 0);
    expect(totale).toBeLessThan(5_000_000);
  });
});

describe("generazione del PDF fotovoltaico", () => {
  const sorgente = leggi("supabase/functions/fv-genera-pdf/index.ts");

  it("le viste satellitari si chiedono in JPEG, anche quella del piano di posa", () => {
    const richieste = sorgente.match(/maps\.googleapis\.com\/maps\/api\/staticmap[^`]*/g) ?? [];
    expect(richieste.length).toBe(2);
    for (const r of richieste) expect(r).toContain("&format=jpg");
  });

  it("le foto del deposito si chiedono ridimensionate, con ripiego sull'originale", () => {
    expect(sorgente).toContain("/storage/v1/render/image/");
    expect(sorgente).toContain("width=1280&quality=72");
    expect(sorgente).toContain("if (!r) r = await fetch(url");
    // se il deposito rifiuta, non si riprova per ogni foto
    expect(sorgente).toContain("[401, 402, 403].includes(rr.status)");
  });

  it("la conversione in base64 va a blocchi, non un byte alla volta", () => {
    expect(sorgente).toContain("i += 0x8000");
    expect(sorgente).not.toContain("b64 += String.fromCharCode(buf[i])");
  });
});
