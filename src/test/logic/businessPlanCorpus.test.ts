// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { analizzaBusinessPlan, leggiFileBusinessPlan } from "@/lib/orders/generali/businessPlanImport";

// Optional private corpus: source files are read in place and never copied into the repository.
const directory = process.env.BUSINESS_PLAN_SOURCE_DIR;
describe.skipIf(!directory)("Business plan forniti per la verifica locale", () => {
  it("legge i tre file e i nove scenari, riconoscendo la colonna prevista e scartando riepiloghi e IVA", async () => {
    const files = (await readdir(directory!)).filter((n) => n.endsWith(".xlsx"));
    expect(files).toHaveLength(3);
    let scenari = 0;
    for (const file of files) {
      const data = await readFile(join(directory!, file));
      const sheets = await leggiFileBusinessPlan(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      );
      expect(sheets).toHaveLength(3);
      for (const sheet of sheets) {
        const a = analizzaBusinessPlan(sheet);
        expect(a.colonnaImporto).toBeGreaterThan(0);
        expect(a.totaleRicavi).toBeGreaterThan(0);
        expect(a.righe.some((r) => /^totale|^iva\s*\d|^ricavi$/i.test(r.descrizione))).toBe(false);
        expect(a.righe.some((r) => r.categoria === "finanziari" && (r.importo ?? 0) > 0)).toBe(true);
        if (sheet.nome.includes("realistico")) {
          // Independent reconciliation controls: finance is omitted from the grand totals;
          // Callimaco additionally counts the 15,000 contingency reserve twice (95,000 - 15,000).
          const omesso = file.includes("CALLIMACO") ? 80000 : file.includes("LOTTI") ? 95000 : 90000;
          expect(Math.round((a.totaleCosti - a.totaleDichiarato!) * 100)).toBe(omesso * 100);
        }
        console.log(
          JSON.stringify({
            file,
            scenario: sheet.nome,
            voci: a.righe.length,
            costiDettaglio: a.totaleCosti,
            ricaviNetti: a.totaleRicavi,
            totaleFile: a.totaleDichiarato,
            senzaImporto: a.righe.filter((r) => r.importo === null).length,
          }),
        );
        scenari++;
      }
    }
    expect(scenari).toBe(9);
  });
});
