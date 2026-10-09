/**
 * L'anteprima del documento nelle pagine pubbliche (firma e /stima): la CSP di
 * public/_headers non ammette nei frame l'host di Supabase (frame-src), dove sta
 * il documento, mentre ammette blob:. Un iframe puntato direttamente al file resta
 * un riquadro vuoto alto il 70% dello schermo (verificato dal vivo il 05/10/2026):
 * il documento si scarica e si mostra da blob: (PDF) o da srcdoc (pagina HTML).
 * La logica sta in un solo componente, AnteprimaDocumento, usato da tutte e due le
 * pagine. Se un giorno frame-src ammetterà l'host, il vincolo cade da solo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intestazioni = readFileSync("public/_headers", "utf8");
const componente = readFileSync("src/components/fea/AnteprimaDocumento.tsx", "utf8");
const pagine: [string, string][] = ["src/pages/public/FirmaDocumento.tsx", "src/pages/public/SerramentiStimaPubblica.tsx"]
  .map((p) => [p, readFileSync(p, "utf8")]);

function frameSrc(): string {
  const csp = intestazioni.split("\n").find((r) => r.includes("Content-Security-Policy:")) ?? "";
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src")) ?? "";
}

describe("Anteprima del documento nelle pagine pubbliche", () => {
  it("la CSP ammette blob: nei frame: da lì si mostra il PDF", () => {
    expect(frameSrc()).toContain("blob:");
  });

  it("il PDF non finisce in un iframe verso un host che frame-src non ammette: si scarica e si mostra da blob:", () => {
    const supabaseAmmesso = /supabase\.co/.test(frameSrc());
    if (supabaseAmmesso) return;
    expect(componente).toContain("URL.createObjectURL");
    expect(componente).toContain("URL.revokeObjectURL");
    expect(componente).not.toMatch(/\{\s*src:\s*url\s*\}/);
  });

  it("il tipo del blob lo decide la pagina, non il file: niente HTML eseguibile nell'origine della pagina", () => {
    expect(componente).toMatch(/new Blob\(\[contenuto\], \{ type: 'application\/pdf' \}\)/);
  });

  it("una pagina HTML si mostra isolata: srcdoc con sandbox vuoto, senza script", () => {
    expect(componente).toContain("srcDoc: html ?? ''");
    expect(componente).toContain("sandbox: ''");
  });

  it.each(pagine)("%s mostra il documento con AnteprimaDocumento, mai con un iframe puntato al file", (_nome, testo) => {
    expect(testo).toContain("<AnteprimaDocumento");
    expect(testo).toContain("@/components/fea/AnteprimaDocumento");
    // Nessun iframe scritto a mano nella pagina: ci pensa il componente.
    expect(testo).not.toMatch(/<iframe/);
  });

  it.each(pagine)("%s apre «in nuova scheda» con apriDocumento: l'HTML dallo storage arriverebbe come testo", (_nome, testo) => {
    expect(testo).toContain("apriDocumento(e,");
  });
});
