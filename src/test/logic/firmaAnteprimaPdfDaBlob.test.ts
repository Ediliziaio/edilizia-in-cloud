/**
 * L'anteprima del documento nella pagina di firma pubblica: la CSP di
 * public/_headers non ammette nei frame l'host di Supabase (frame-src), dove sta
 * il PDF, mentre ammette blob:. Un iframe puntato direttamente al PDF resta un
 * riquadro vuoto alto il 70% dello schermo (verificato dal vivo il 05/10/2026):
 * il PDF si scarica e si mostra da blob:. Se un giorno frame-src ammetterà
 * l'host, il vincolo cade da solo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intestazioni = readFileSync("public/_headers", "utf8");
const pagina = readFileSync("src/pages/public/FirmaDocumento.tsx", "utf8");

function frameSrc(): string {
  const csp = intestazioni.split("\n").find((r) => r.includes("Content-Security-Policy:")) ?? "";
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src")) ?? "";
}

describe("Anteprima del documento nella pagina di firma", () => {
  it("la CSP ammette blob: nei frame: da lì si mostra il PDF", () => {
    expect(frameSrc()).toContain("blob:");
  });

  it("il PDF non finisce in un iframe verso un host che frame-src non ammette: si scarica e si mostra da blob:", () => {
    const supabaseAmmesso = /supabase\.co/.test(frameSrc());
    if (supabaseAmmesso) return;
    expect(pagina).toContain("URL.createObjectURL");
    expect(pagina).toContain("URL.revokeObjectURL");
    expect(pagina).not.toMatch(/\{\s*src:\s*url\s*\}/);
  });

  it("il tipo del blob lo decide la pagina, non il file: niente HTML eseguibile nell'origine della pagina", () => {
    expect(pagina).toMatch(/new Blob\(\[contenuto\], \{ type: 'application\/pdf' \}\)/);
  });
});
