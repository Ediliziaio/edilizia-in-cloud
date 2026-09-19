import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// pdfjs-dist 6 (aggiornato il 19/09/2026 per GHSA-hq66-cqwq-w95j: un PDF
// costruito ad arte poteva eseguire JavaScript nel browser di chi lo apriva)
// ha tolto `destroy()` dal documento: si chiude la sua `loadingTask`. Chiamarlo
// sul documento non dà errore di compilazione dove il tipo è `any`, ma a
// runtime è «destroy is not a function» — e miniature, riduzione dei PDF e
// lettura del DURC si fermavano.

function fileSorgente(cartella: string): string[] {
  const trovati: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) trovati.push(...fileSorgente(percorso));
    else if (/\.(ts|tsx)$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

describe("pdfjs-dist 6: i documenti si chiudono dalla loadingTask", () => {
  const conPdfjs = fileSorgente("src").filter((f) => {
    const testo = readFileSync(f, "utf8");
    return testo.includes('import("pdfjs-dist")') || testo.includes("from \"pdfjs-dist\"");
  });

  it("trova i file che usano pdfjs-dist", () => {
    expect(conPdfjs.length).toBeGreaterThan(0);
  });

  it.each(conPdfjs)("%s non chiama destroy() direttamente sul documento", (percorso) => {
    const testo = readFileSync(percorso, "utf8");
    expect(testo).not.toMatch(/\b(pdf|doc|documento)\.destroy\(\)/);
  });
});
