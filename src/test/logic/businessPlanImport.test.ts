import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import {
  analizzaBusinessPlan,
  leggiFileBusinessPlan,
  type CellaBusinessPlan,
  type FoglioBusinessPlan,
} from "@/lib/orders/generali/businessPlanImport";
import { calcolaPianoEconomico } from "@/lib/orders/generali/pianoConti";
import { pianoPerNumeri } from "@/lib/orders/generali/numeriChiave";

const foglio = (righe: CellaBusinessPlan[][]): FoglioBusinessPlan => ({
  nome: "Realistico",
  righe: righe.map((celle, i) => ({ numero: i + 1, celle })),
});
const esempio = () =>
  foglio([
    ["BUSINESS PLAN - RESIDENZA ESEMPIO"],
    ["DESCRIZIONE COSTI", "FORNITORE", "COSTI PRESUNTI", "COSTI REALI", "SALDO COSTI"],
    ["COSTI ACQUISIZIONE IMMOBILE"],
    ["Prezzo acquisto del terreno", null, 400000, 400000, 200000],
    ["TOTALI COSTI", null, 400000],
    ["COSTI DI COSTRUZIONE"],
    ["Strutture in cemento armato", null, null],
    ["Costi opere in fabbro", null, null],
    ["Opere civili", null, 600000],
    ["Cassette postali", null, 0],
    ["COSTI FINANZIARI"],
    ["Interessi passivi", null, 90000],
    ["TOTALE COSTI", null, 90000],
    ["COSTI RISERVE E CONTINGENZE"],
    ["Fondo rischi generali", null, 10000],
    ["Totale riserve e contingenze", null, 10000],
    ["TOTALE COSTI", null, 20000],
    ["TOTALE COSTI GENERALI", null, 1020000],
    ["INCASSI", null, "PREVISIONE IVA ESCLUSA"],
    ["Unità 1", null, 800000],
    ["Unità 2", null, 800000],
    ["TOTALE INCASSI", null, 1600000],
    ["IVA 4%", null, 64000],
    ["TOTALE IVATO", null, 1664000],
    ["RICAVI", null, 644000],
  ]);

describe("Importazione business plan sulla commessa generale", () => {
  it("legge il file dimostrativo esportato con tre tipologie mantenendo i ricavi separati dai costi",async()=>{
    const data=await readFile("src/test/fixtures/importazioni/piani-tre-tipologie.xlsx");
    const file=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer;
    const fogli=await leggiFileBusinessPlan(file);
    expect(fogli.map(f=>f.nome)).toEqual(["Appalto","Sviluppo","Compravendita"]);
    const analisi=fogli.map(f=>analizzaBusinessPlan(f));
    expect(analisi.map(a=>[a.totaleCosti,a.totaleRicavi])).toEqual([[90000,150000],[370000,500000],[230000,300000]]);
    expect(analisi[0].righe.find(r=>r.descrizione==="Contratto appalto")?.categoria).toBe("lavori");
    expect(analisi[1].righe.filter(r=>r.tipo==="ricavo").map(r=>r.categoria)).toEqual(["vendite","vendite"]);
    expect(analisi[1].righe.find(r=>r.descrizione==="Imprevisti")?.importo).toBeNull();
  });
  it("legge OOXML con prefisso senza perdere valori, risultati delle formule e testi",async()=>{
    const wb=new ExcelJS.Workbook();
    const s=wb.addWorksheet("Appalto");s.addRow(["Descrizione costi","Costi presunti"]);
    s.addRow(["Materiali con riferimento x:test",40000]);s.addRow(["Subappalti",{formula:"10000+20000",result:30000}]);s.addRow(["Imprevisti",null]);
    const zip=await JSZip.loadAsync(await wb.xlsx.writeBuffer());
    for(const f of zip.file(/^xl\/(?:workbook|styles|sharedStrings|worksheets\/[^/]+)\.xml$/)){
      const xml=await f.async("string");
      zip.file(f.name,xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/(<\/?)([a-zA-Z][\w.-]*)(?=[\s/>])/g,'$1x:$2'));
    }
    const file=await zip.generateAsync({type:"arraybuffer"});
    const fogli=await leggiFileBusinessPlan(file);
    expect(fogli[0].nome).toBe("Appalto");
    const a=analizzaBusinessPlan(fogli[0]);
    expect(a.totaleCosti).toBe(70000);
    expect(a.righe[0].descrizione).toContain("x:test");
    expect(a.righe.find(r=>r.descrizione==="Imprevisti")?.importo).toBeNull();
  });
  it("un file danneggiato mostra un errore comprensibile",async()=>{
    await expect(leggiFileBusinessPlan(new Uint8Array([1,2,3]).buffer)).rejects.toThrow("Non riesco a leggere questo file Excel");
  });
  it("somma il dettaglio una volta, includendo finanza e riserve, senza IVA o margini", () => {
    const a = analizzaBusinessPlan(esempio());
    expect(a.totaleCosti).toBe(1100000);
    expect(a.totaleRicavi).toBe(1600000);
    expect(a.colonnaImporto).toBe(2);
    expect(a.avvisi.some((x) => x.includes("non coincide"))).toBe(true);
    expect(a.righe.find((r) => r.descrizione === "Interessi passivi")?.categoria).toBe("finanziari");
  });
  it("conserva il significato diverso di una stima mancante e di uno zero", () => {
    const a = analizzaBusinessPlan(esempio());
    expect(a.righe.find((r) => r.descrizione === "Strutture in cemento armato")?.importo).toBeNull();
    expect(a.righe.find((r) => r.descrizione === "Costi opere in fabbro")?.importo).toBeNull();
    expect(a.righe.find((r) => r.descrizione === "Cassette postali")?.importo).toBe(0);
    expect(a.avvisi.some((x) => x.includes("parziale"))).toBe(true);
  });
  it("non importa i costi reali o i saldi come budget", () => {
    const a = analizzaBusinessPlan(esempio());
    expect(a.righe.find((r) => r.descrizione === "Prezzo acquisto del terreno")?.importo).toBe(400000);
    expect(a.righe).toHaveLength(9);
  });
  it("mantiene l'IVA non detraibile esplicitamente prevista come costo", () => {
    const a = analizzaBusinessPlan(
      foglio([
        ["Voce", "Importo"],
        ["IVA non detraibile", 1234],
        ["IVA 4%", 50],
      ]),
    );
    expect(a.totaleCosti).toBe(1234);
  });
  it("non inventa colonne per un file non riconosciuto", () => {
    const a = analizzaBusinessPlan(foglio([["Documento"], ["Un testo", 123]]));
    expect(a.righe).toHaveLength(0);
    expect(a.avvisi[0]).toContain("Intestazioni non riconosciute");
  });
  it("un budget senza calendario non mostra capitale necessario pari a zero", () => {
    const p = calcolaPianoEconomico({
      oggi: "2026-11-10",
      generaleId: "G",
      righe: [],
      incassi: [],
      figlie: [],
      voci: [
        {
          id: "v1",
          tipo: "costo",
          categoria: "costruzione",
          descrizione: "Costruzione",
          importo: 600000,
          mese: null,
          durataMesi: 1,
          figliaId: null,
          categorieCosto: [],
          aFinire: null,
          nota: null,
          ordine: 1,
          origineId: null,
        },
      ],
    });
    expect(p.calendarioCompleto).toBe(false);
    expect(pianoPerNumeri(p)?.capitaleMassimo).toBeNull();
  });
  it("legge scenari separati, risultati delle formule e celle mancanti senza eseguire formule", async () => {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("Realistico");
    s.addRow(["Descrizione costi", "Costi presunti"]);
    s.addRow(["Terreno", { formula: "2+3", result: 5 }]);
    s.addRow(["Costruzione", { formula: "1+9" }]);
    const b = wb.addWorksheet("Best");
    b.addRow(["Voce", "Importo"]);
    b.addRow(["Terreno", 3]);
    const data = await wb.xlsx.writeBuffer();
    const letti = await leggiFileBusinessPlan(data as ArrayBuffer);
    expect(letti.map((f) => f.nome)).toEqual(["Realistico", "Best"]);
    expect(analizzaBusinessPlan(letti[0]).righe.map((r) => r.importo)).toEqual([5, null]);
    expect(analizzaBusinessPlan(letti[1]).totaleCosti).toBe(3);
  });
});
