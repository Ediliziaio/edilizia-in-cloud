import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { rigaDaVoce } from "@/lib/computo/computoDaVoci";
import { eNonLavoro } from "@/lib/computo/importaVoci";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { mesiDaTesto, serviziDelComputo } from "@/lib/distinta/serviziComputo";

function vociCommessa() {
  const p: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { p.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...t] = riga.split("\t");
    p.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: t.join("\t") });
  }
  const b = bozzaDaComputoStrutturato(leggiComputoPrimus(p));
  return b.voci.filter((v) => !eNonLavoro(v)).map((v, i) => {
    const r = rigaDaVoce({ ...v, avvisi: [], origine: "prova" }, i);
    return { ...r.voce, id: r.voce.numero_ordine, misure: r.misure.map((m) => ({ descrizione: m.descrizione, parti_uguali: m.parti_uguali, quantita: m.quantita })) };
  });
}

describe("noli, servizi e manodopera del computo", () => {
  const voci = vociCommessa();
  const s = serviziDelComputo(voci);
  const di = (n: string) => s.find((x) => x.voce_id === n)!;

  it("i mesi dalle misure", () => {
    expect(mesiDaTesto("Pericolo generico e caduta oggetti: Per 13 mesi (par.ug.=13*20)")).toBe(13);
    expect(mesiDaTesto("Monoblocco uso ufficio per la durata di 12 mesi")).toBe(12);
    expect(mesiDaTesto("Durata cantiere 9 mesi (par.ug.=8*2407,80)")).toBe(9);
  });

  it("bagno chimico: 1 per 13 mesi, non 13 bagni; cartelli: 20 per 13 mesi", () => {
    expect(di("2")).toMatchObject({ tipo: "nolo", mesi: 13, pezzi: 1 });
    expect(di("3")).toMatchObject({ tipo: "nolo", mesi: 13, pezzi: 2 });
    expect(di("9")).toMatchObject({ tipo: "nolo", mesi: 13, pezzi: 20 });
    expect(di("8")).toMatchObject({ tipo: "nolo", mesi: 12, pezzi: 2 });
  });

  it("ponteggio: 2.407,80 m² per i mesi successivi", () => {
    expect(di("15")).toMatchObject({ tipo: "nolo", pezzi: 2407.8 });
  });

  it("ore: piattaforma con operatore è nolo, installatori sono manodopera", () => {
    expect(di("24")).toMatchObject({ tipo: "nolo", quantita: 1040 });
    expect(di("125").tipo).toBe("manodopera");
    expect(di("126").tipo).toBe("manodopera");
  });

  it("PiMUS prestazione, impianto elettrico di cantiere, incidenza sicurezza spostamento", () => {
    expect(di("26").tipo).toBe("prestazione");
    expect(di("25").tipo).toBe("impianto_cantiere");
    expect(di("30").tipo).toBe("trasferimento");
  });

  it("nella distinta: fuori dai materiali col motivo, e le ore non vanno all'AI", () => {
    const r = generaDistinta({ voci, scomposizioni: [], riserva: catalogoComeScomposizioni() });
    expect(r.escluse.find((e) => e.voce_id === "9")!.motivo).toMatch(/Nolo: 20 pz per 13 mesi/);
    expect(r.escluse.find((e) => e.voce_id === "125")!.motivo).toMatch(/Ore: 320 ore/);
    expect(r.senzaScomposizione.some((v) => v.id === "125")).toBe(false);
  });
});
