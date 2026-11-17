import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { rigaDaVoce } from "@/lib/computo/computoDaVoci";
import { eNonLavoro } from "@/lib/computo/importaVoci";
import { controllaComputo, importoInGioco, voceDaCommessa } from "@/lib/computo/controlloComputo";

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

/** Il computo PriMus di prova come lo salva la commessa (voci + misure), con il numero d'ordine del PDF. */
function vociCommessa() {
  const bozza = bozzaDaComputoStrutturato(leggiComputoPrimus(pagine()));
  return bozza.voci.map((v, i) => ({ v, i })).filter(({ v }) => !eNonLavoro(v)).map(({ v, i }) => {
    const r = rigaDaVoce({ ...v, avvisi: [], origine: "prova" }, i);
    return voceDaCommessa({ ...r.voce, id: `v${i + 1}`, numero_ordine: String(i + 1), misure: r.misure });
  });
}

describe("controllo del computo: le incongruenze che un'analisi a mano ha trovato", () => {
  const trovate = controllaComputo(vociCommessa());
  const di = (regola: string) => trovate.filter((x) => x.regola === regola);

  it("spallette: 637,20 m contati come m² nelle voci 35-37, 21.481,29 € in gioco", () => {
    const m = di("metri_come_mq");
    expect(m.map((x) => x.numero)).toEqual(["35", "36", "37"]);
    expect(importoInGioco(m)).toBe(21481.29);
  });

  it("pezzi con i decimali: cicogne 767,40 e inverter 0,88", () => {
    expect(di("pezzi_frazionari").map((x) => x.numero)).toEqual(["43", "90"]); // non la 30: sposta un importo
  });

  it("profili FV: 135 barre da 3 m contate come 405 pezzi", () => {
    expect(di("barre_in_metri").map((x) => x.numero)).toContain("84");
  });

  it("controsoglia: 15 cm in descrizione, 30 cm nella misura", () => {
    const c = di("misura_diversa").find((x) => x.numero === "38")!;
    expect(c.messaggio).toContain("21,1");
    expect(c.importo).toBe(2160.64);
  });

  it("PiMUS a corpo 1,50; cassonetti contati come m²", () => {
    expect(di("a_corpo_non_uno").map((x) => x.numero)).toContain("26");
    expect(di("pezzi_come_superficie").map((x) => x.numero)).toContain("74");
  });

  it("note: sovrapprezzi per cm e descrizioni abbreviate", () => {
    expect(di("sovrapprezzo_cm").length).toBeGreaterThan(0);
    expect(di("descrizione_abbreviata")).toHaveLength(1);
  });

  it("non inventa errori su voci normali", () => {
    expect(trovate.filter((x) => x.gravita === "verifica").length).toBeLessThan(25);
    expect(trovate.some((x) => x.numero === "33" && x.regola !== "sovrapprezzo_cm")).toBe(false);
  });
});
