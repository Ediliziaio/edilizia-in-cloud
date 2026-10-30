import { describe, expect, it } from "vitest";
import { righeTabellaCronoprogramma, type RigaTabella } from "@/lib/orders/tabellaCronoprogramma";
import { vociDelleSottofasi } from "@/lib/orders/sottofasi";
import type { FaseCrono, SottofaseCrono } from "@/lib/orders/cronoprogramma";

/** Il cronoprogramma come l'Excel del cliente (31/10/2026): fasi numerate, sottofasi 1.1, 1.2… con i numeri della voce. */
describe("tabella del cronoprogramma", () => {
  const fase = { id: "f1", nome: "Tetto", stato: "in_corso", avanzamento: 50, previstoInizio: "2026-10-02", previstoFine: "2026-11-10", ritardoFine: 0 } as unknown as FaseCrono;
  const date = new Map([["f1", [{ id: "s1", previstoInizio: "2026-10-02", previstoFine: "2026-10-02", stimata: false, ritardo: 0 } as SottofaseCrono]]]);
  const voci = vociDelleSottofasi([
    { phase_id: "f1", subphase_id: "s1", quantita: 53.36, unita: "m", costo_manodopera: 0.5, costo_materiali: 0.25, importo: 560 },
    { phase_id: "f1", subphase_id: null, quantita: 1, unita: "corpo", costo_manodopera: 10, costo_materiali: 0, importo: 10 },
  ]);

  it("una riga per fase e una per sottofase, anche quella senza date, con quantità, unità e costo della voce", () => {
    const righe = righeTabellaCronoprogramma([fase], new Map([["f1", [
      { id: "s1", name: "Smontaggio canali", fatta: true, giorni: 1, risorse: 2 },
      { id: "s2", name: "Rifacimento pianellati", fatta: false, giorni: null },
    ]]]), date, { economia: new Map([["f1", { venduto: 22120, costoPrevisto: 5135.32, costoConsuntivo: 0 }]]), voci: voci.perSottofase });
    expect(righe.map(r => [r.numero, r.nome, r.giorni, r.risorse, r.quantita, r.unita, r.costoPrevisto, r.venduto, r.avanzamento])).toEqual([
      ["1", "Tetto", 40, null, null, null, 5135.32, 22120, 50],
      ["1.1", "Smontaggio canali", 1, 2, 53.36, "m", 40.02, 560, 100],
      ["1.2", "Rifacimento pianellati", null, null, null, null, null, null, 0],
    ]);
    expect(righe[2].inizio).toBeNull();
  });

  it("le voci senza sottofase si contano per fase", () => {
    expect(voci.senzaSottofase.get("f1")).toBe(1);
  });
});

describe("esportazione in Excel", () => {
  it("il file si riapre: intestazioni, fasi in grassetto, date vere, costi solo se si vedono", async () => {
    const { esportaCronoprogrammaExcel } = await import("@/lib/orders/esportaCronoprogramma");
    const ExcelJS = (await import("exceljs")).default;
    const riga: RigaTabella = { id: "f1", numero: "1", livello: 0, nome: "Tetto", inizio: "2026-10-02", fine: "2026-11-10", giorni: 40, giorniLavorati: null, risorse: null, quantita: null, unita: null, costoPrevisto: 542.75, costoConsuntivo: 0, venduto: 22120, avanzamento: 10, stimata: false, ritardo: 0, stato: "in_corso" };
    const sotto: RigaTabella = { ...riga, id: "s1", numero: "1.1", livello: 1, nome: "Smontaggio manto", giorni: 4, risorse: 3, quantita: 109.45, unita: "m²", costoPrevisto: 436.71, venduto: 3360 };
    const leggi = async (costi: boolean) => {
      const blob = await esportaCronoprogrammaExcel([riga, sotto], "Prova", { costi, venduto: costi });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await blob.arrayBuffer());
      return wb.getWorksheet("Cronoprogramma")!;
    };
    const ws = await leggi(true);
    expect((ws.getRow(1).values as unknown[]).filter(Boolean)).toEqual(["N.", "Attività", "Inizio", "Fine", "GG previsti", "GG lavorati", "Persone", "Quantità", "U.M.", "Costo previsto", "Costo consuntivo", "Venduto", "Avanzamento %"]);
    expect(ws.getRow(2).font?.bold).toBe(true);
    expect(ws.getRow(3).getCell(2).value).toBe("   Smontaggio manto");
    expect(ws.getRow(3).getCell(3).value).toBeInstanceOf(Date);
    expect(ws.getRow(3).getCell(10).value).toBe(436.71);
    expect((await leggi(false)).getRow(1).values).not.toContain("Costo previsto");
  });
});

describe("PDF del cronoprogramma", () => {
  it("una pagina A4 orizzontale con titolo, righe e numero di pagina", async () => {
    const { pdfCronoprogramma } = await import("@/lib/orders/pdfCronoprogramma");
    const riga = (numero: string, stato: RigaTabella["stato"], ritardo = 0): RigaTabella => ({
      id: numero, numero, livello: numero.includes(".") ? 1 : 0, nome: `Attività ${numero}`, inizio: "2025-10-02", fine: "2025-10-08",
      giorni: 7, giorniLavorati: null, risorse: null, quantita: null, unita: null, costoPrevisto: null, costoConsuntivo: null, venduto: null,
      avanzamento: stato === "fatta" ? 100 : 40, stimata: false, ritardo, stato });
    const blob = await pdfCronoprogramma({ titolo: "Cronoprogramma · PROVA", righe: [riga("1", "fatta", 3), riga("1.1", "fatta", 2), riga("2", "in_corso"), riga("3", "da_fare")], da: "2025-09-28", a: "2025-10-20", oggi: "2025-10-05" });
    const testo = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(testo.startsWith("%PDF")).toBe(true);
    expect(testo).toMatch(/\/MediaBox \[0 0 841\.8\d* 595\.2\d*\]/);
    expect(testo).toContain("Cronoprogramma");
    expect(testo).toContain("+3 gg");
    expect(testo).toContain("pagina 1 di 1");
  });

  it("il previsionale non parla di stati né di ritardi: è il piano da dare al cliente", async () => {
    const { pdfCronoprogramma } = await import("@/lib/orders/pdfCronoprogramma");
    const riga = (numero: string): RigaTabella => ({ id: numero, numero, livello: numero.includes(".") ? 1 : 0, nome: `Attività ${numero}`, inizio: "2025-10-02", fine: "2025-10-08",
      giorni: 7, giorniLavorati: null, risorse: null, quantita: null, unita: null, costoPrevisto: null, costoConsuntivo: null, venduto: null, avanzamento: 100, stimata: false, ritardo: 3, stato: "fatta" });
    const testo = new TextDecoder("latin1").decode(await (await pdfCronoprogramma({ modo: "previsionale", titolo: "Cronoprogramma previsionale", righe: [riga("1"), riga("1.1")], da: "2025-09-28", a: "2025-10-20", oggi: "2025-10-05" })).arrayBuffer());
    expect(testo).toContain("Date previste");
    expect(testo).not.toContain("+3 gg");
    expect(testo).not.toContain("In corso");
  });

  it("con tante righe va a pagina nuova", async () => {
    const { pdfCronoprogramma } = await import("@/lib/orders/pdfCronoprogramma");
    const righe = Array.from({ length: 60 }, (_, i): RigaTabella => ({ id: String(i), numero: String(i + 1), livello: 0, nome: `Fase ${i + 1}`, inizio: "2025-10-02", fine: "2025-10-08",
      giorni: 7, giorniLavorati: null, risorse: null, quantita: null, unita: null, costoPrevisto: null, costoConsuntivo: null, venduto: null, avanzamento: 0, stimata: false, ritardo: 0, stato: "da_fare" }));
    const testo = new TextDecoder("latin1").decode(await (await pdfCronoprogramma({ titolo: "Lungo", righe, da: "2025-09-28", a: "2025-10-20", oggi: "2025-10-05" })).arrayBuffer());
    expect(testo).toMatch(/pagina 1 di [3-9]/);
  });
});
