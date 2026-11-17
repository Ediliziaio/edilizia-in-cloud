import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { calcolaVoce } from "@/lib/computo/editorNativo";
import { eNonLavoro } from "@/lib/computo/importaVoci";

function pagine(): PdfPaginaPosizionata[] {
  const p: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { p.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...t] = riga.split("\t");
    p.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: t.join("\t") });
  }
  return p;
}

describe("all'import, oneri tecnici, IVA e visto non sono lavorazioni", () => {
  const bozza = bozzaDaComputoStrutturato(leggiComputoPrimus(pagine()));

  it("spegne le 44 voci del quadro economico e tiene i 1.948.331,82 € di lavori", () => {
    const spente = bozza.voci.filter(eNonLavoro);
    expect(spente).toHaveLength(44);
    const lavori = bozza.voci.filter((v) => !eNonLavoro(v));
    const totale = lavori.reduce((t, v) => t + Math.round((calcolaVoce(v).importo ?? 0) * 100) / 100, 0);
    expect(Math.round(totale * 100) / 100).toBe(1948331.82);
  });

  it("gli oneri della sicurezza restano lavori", () => {
    expect(eNonLavoro({ capitolo: "ONERI DELLA SICUREZZA" })).toBe(false);
    expect(eNonLavoro({ capitolo: "ECO · IMPIANTO TERMICO" })).toBe(false);
    expect(eNonLavoro({ capitolo: "IVA LAVORI ECO" })).toBe(true);
    expect(eNonLavoro({ capitolo: "VISTO DI CONFORMITA' ECO" })).toBe(true);
    expect(eNonLavoro({ capitolo: "Cassonetti e avvolgibili" })).toBe(false);
  });
});
