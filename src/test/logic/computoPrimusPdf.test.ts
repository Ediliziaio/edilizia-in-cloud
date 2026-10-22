import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { eComputoPrimus, leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { readPdfPages } from "../../../supabase/functions/_shared/pdfExtraction";
import { controllaTotali, estraiFormule, numeroComputo, valutaFormula, computoComeEstrazione } from "@/lib/computo/computoStrutturato";

/** Il fixture è il testo del PDF vero (39 pagine, PriMus) come lo legge pdfjs: x, destra, y, testo. */
function pagineDalFixture(): PdfPaginaPosizionata[] {
  const righe = readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n");
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of righe) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...testo] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: testo.join("\t") });
  }
  return pagine;
}

describe("numeri e formule del computo", () => {
  it("legge i numeri di PriMus", () => {
    expect(numeroComputo("1´500,00")).toBe(1500);
    expect(numeroComputo("-31´484,17")).toBe(-31484.17);
    expect(numeroComputo("2´642´936,35")).toBe(2642936.35);
    expect(numeroComputo("0,030")).toBe(0.03);
    expect(numeroComputo("2.407,80")).toBe(2407.8);
    expect(numeroComputo("SOMMANO")).toBeNull();
    expect(numeroComputo("13 DA1503022a")).toBeNull();
  });
  it("valuta le formule senza eval", () => {
    expect(valutaFormula("8*2407,80")).toBeCloseTo(19262.4, 6);
    expect(valutaFormula("9,5+6,3")).toBeCloseTo(15.8, 6);
    expect(valutaFormula("-12/100")).toBeCloseTo(-0.12, 6);
    expect(valutaFormula("(2+3)*4")).toBe(20);
    expect(valutaFormula("600/ 100")).toBe(6);
    expect(valutaFormula("alert(1)")).toBeNull();
    expect(valutaFormula("1/0")).toBeNull();
  });
  it("toglie le formule dalla descrizione", () => {
    const r = estraiFormule("Legno 30% *(par.ug.=294,51*0,3)*(H/peso=600/ 100)");
    expect(r.descrizione).toBe("Legno 30%");
    expect(r.formule.map(f => [f.campo, f.valore])).toEqual([["par.ug.", expect.closeTo(88.353, 3)], ["h/peso", 6]]);
  });
});

describe("computo PriMus vero (Genzano di Lucania, 39 pagine)", () => {
  const pagine = pagineDalFixture();
  const computo = leggiComputoPrimus(pagine);
  const controllo = controllaTotali(computo);

  it("riconosce il formato", () => {
    expect(eComputoPrimus(pagine)).toBe(true);
    expect(eComputoPrimus([{ page: 1, items: [{ x: 10, y: 10, text: "Fattura n. 3" }] }])).toBe(false);
  });

  it("legge tutte le 226 voci, in ordine, senza perderne a cavallo di pagina", () => {
    expect(computo.voci).toHaveLength(226);
    expect(computo.voci.map(v => v.numero_ordine)).toEqual(Array.from({ length: 226 }, (_, i) => String(i + 1)));
    expect(computo.voci.every(v => v.importo !== null && v.quantita !== null && v.prezzo_unitario !== null)).toBe(true);
    expect(computo.voci.every(v => v.unita_misura)).toBe(true);
  });

  it("riconosce le detrazioni «SI DETRAGGONO»", () => {
    const detrazioni = computo.voci.filter(v => v.is_detrazione);
    expect(detrazioni.map(v => v.numero_ordine)).toEqual(["99", "100", "102", "155"]);
    expect(detrazioni.every(v => (v.importo ?? 0) < 0)).toBe(true);
  });

  it("il totale torna al centesimo con quello del documento", () => {
    expect(computo.totale_dichiarato).toBe(2642936.35);
    expect(controllo.totale_calcolato).toBe(2642936.35);
    expect(controllo.differenza_totale).toBe(0);
    expect(controllo.sintesi).toContain("226 voci lette");
    expect(controllo.sintesi).toContain("2.642.936,35 € = totale del documento ✓");
  });

  it("ogni capitolo torna con il riepilogo strutturale", () => {
    expect(controllo.capitoli.length).toBeGreaterThan(30);
    expect(controllo.capitoli.filter(c => !c.ok)).toEqual([]);
    const sicurezza = controllo.capitoli.find(c => c.codice === "M:001.001");
    expect(sicurezza).toMatchObject({ nome: "ONERI DELLA SICUREZZA", dichiarato: 153873.55, ok: true });
  });

  it("ogni voce: quantità × prezzo = importo, righe di misura = quantità", () => {
    expect(controllo.voci).toEqual([]);
    expect(controllo.ok).toBe(true);
  });

  it("ricostruisce gerarchia, codici, descrizione e righe di misura", () => {
    const v1 = computo.voci[0];
    expect(v1).toMatchObject({
      sezione: "LAVORI A MISURA", unita_misura: "ora", quantita: 30, prezzo_unitario: 50, importo: 1500,
      super_categoria: { numero: 1, nome: "ECO" }, categoria: { numero: 1, nome: "ONERI DELLA SICUREZZA" },
      sotto_categoria: { numero: 1, nome: "Opere provvisionali per la sicurezza" }, is_sicurezza: true,
    });
    expect(v1.codici).toEqual(["S", "03.22g", "S.003.022.g"]);
    expect(v1.descrizione).toBe("Oneri per la cantierizzazione di opere edili Costo per ricerca sottoservizi con apparecchiature elettroniche adeguate");

    const v3 = computo.voci[2];
    expect(v3.codici).toEqual(["DSR526091d", "SR5091d"]);
    expect(v3.descrizione).toMatch(/^Estintore a polvere.*pulsante, valvola di sicurezza.*classe 55A-233BC$/);
    expect(v3.descrizione_troncata).toBe(true);
    expect(v3.misure).toEqual([expect.objectContaining({ parti_uguali: 26, quantita: 26, formula: "par.ug.=2*13" })]);

    const v5 = computo.voci[4];
    expect(v5.descrizione).toMatch(/costo ad personam$/);
    expect(v5.misure).toHaveLength(3);
    expect(v5.misure[0]).toMatchObject({ parti_uguali: 25, altezza_peso: 3, quantita: 75, formula: "par.ug.=5*5" });
    expect(v5.misure[0].descrizione).toMatch(/^Si considera 1 riunione al mese per 5 mesi.*per nr\.3 ore$/);

    // Voce 8 spezzata fra pagina 2 e 3: le misure dopo il «RIPORTO» restano sue.
    const v8 = computo.voci[7];
    expect(v8.misure.map(m => m.quantita)).toEqual([12, 12]);
    expect(v8).toMatchObject({ quantita: 24, importo: 1179.84 });

    // Formula su due righe e H/peso.
    const v80 = computo.voci[79];
    expect(v80.misure.at(-1)).toMatchObject({ parti_uguali: 88.35, larghezza: 0.08, altezza_peso: 6, quantita: 42.41 });
    expect(v80.misure.at(-1)!.formula).toBe("par.ug.=294,51*0,3; h/peso=600/ 100");
    expect(v80.misure.at(-1)!.descrizione).toBe("Legno 30% del serramento 600 kg/mc");
    // Numero andato a capo nella colonna par.ug.: «153873,5» + «5».
    expect(computo.voci[29].misure).toEqual([expect.objectContaining({ parti_uguali: 153873.55, quantita: 153873.55, formula: "par.ug.=50/100*307747,10" })]);
    // Unità «%»: il prezzo è una percentuale.
    expect(computo.voci[65]).toMatchObject({ unita_misura: "%", quantita: 21174.63, prezzo_unitario: 30, importo: 6352.39 });

    // Riga «a detrarre» negativa e voce a corpo.
    expect(computo.voci[89].misure.at(-1)).toMatchObject({ parti_uguali: -0.12, quantita: -0.12 });
    expect(computo.voci[24]).toMatchObject({ unita_misura: "a corpo", a_corpo: true });
  });

  it("sicurezza: 153.873,55 € di oneri non soggetti a ribasso", () => {
    expect(controllo.oneri_sicurezza).toBe(153873.55);
    expect(computo.voci.filter(v => v.is_sicurezza).every(v => v.categoria?.nome === "ONERI DELLA SICUREZZA")).toBe(true);
  });

  it("lo stesso risultato passando dal lettore PDF della edge function (pdfjs → posizioni)", async () => {
    const doc = {
      numPages: pagine.length,
      getPage: async (n: number) => ({
        getTextContent: async () => ({ items: pagine[n - 1].items.map(i => ({ str: i.text, transform: [1, 0, 0, 1, i.x, i.y], width: (i.right ?? i.x) - i.x })) }),
        getOperatorList: async () => ({ fnArray: [1], argsArray: [[]] }),
      }),
    };
    const letto = await readPdfPages(doc, { imageOps: [99], maxChars: 1_000_000, keepPositions: true });
    const daEdge = leggiComputoPrimus(letto.pages.map(p => ({ page: p.page, items: p.positioned ?? [] })));
    expect(daEdge.voci).toHaveLength(226);
    expect(controllaTotali(daEdge).totale_calcolato).toBe(2642936.35);
  });

  it("si trasforma nelle voci che il preventivo sa già usare", () => {
    const estrazione = computoComeEstrazione(computo, controllo);
    const voci = estrazione.capitoli.flatMap(c => c.voci);
    expect(voci).toHaveLength(226);
    expect(estrazione.metadata.totale_computo).toBe(2642936.35);
    expect(voci[0]).toMatchObject({ codice_voce: "1", capitolo_nome: "ONERI DELLA SICUREZZA", importo: 1500, is_sicurezza: true });
  });
});
