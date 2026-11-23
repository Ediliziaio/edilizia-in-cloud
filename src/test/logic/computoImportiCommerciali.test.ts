import { Workbook } from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { esportaComputoXlsx } from "@/lib/computo/esportaComputo";
import { analizzaEconomia, totaleElencoComputo } from "@/lib/computo/economiaComputo";
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";

describe("Importi commerciali del computo", () => {
  it("arrotonda al centesimo l'IVA che cade esattamente a mezzo centesimo", () => {
    expect(calcolaIvaComputo(18.25, { ivaAliquota: "22", ivaModalita: "applicata" }))
      .toMatchObject({ imponibile: 18.25, iva: 4.02, totale: 22.27 });
  });
  it("accetta gli importi italiani con migliaia e rifiuta sconti quando tutta la base è sicurezza", () => {
    const sconto = { tipo: "importo" as const, valore: "1.250,00", descrizione: "" };
    expect(calcolaSconto(2000, sconto).importo).toBe(1250);
    expect(calcolaSconto(2000, { ...sconto, valore: "50" }, 2000)).toMatchObject({ importo: 0, errore: expect.stringMatching(/supera/) });
  });

  it("applica il ribasso alle voci incluse e salva in elenco lo stesso totale del documento", () => {
    const bozza = {
      ...bozzaVuota(), ivaModalita: "applicata" as const, ivaAliquota: "22", capitoliEsclusiPdf: ["Facciata"],
      sconto: { tipo: "percentuale" as const, valore: "10", descrizione: "" },
      voci: [
        { ...voceVuota(), capitolo: "Interno", descrizione: "Posa", quantita: "1", prezzo: "1000" },
        { ...voceVuota(), capitolo: "Facciata", descrizione: "Rasatura", quantita: "1", prezzo: "800" },
        { ...voceVuota(), capitolo: "Interno", descrizione: "Sicurezza extra", quantita: "1", prezzo: "100", opzionale: true, sicurezza: true },
      ],
    };
    expect(analizzaEconomia(bozza).sconto).toBe(180);
    expect(totaleElencoComputo(bozza)).toBe(1098);
  });

  it("esporta importi al centesimo, sconto e IVA senza includere dati di costo", async () => {
    const bozza = {
      ...bozzaVuota(), titolo: "Collaudo preventivo", ivaModalita: "applicata" as const, ivaAliquota: "22",
      sconto: { tipo: "percentuale" as const, valore: "7,5", descrizione: "Sconto commerciale" },
      voci: [
        { ...voceVuota(), descrizione: "Posa", unita: "mq", quantita: "2,375", prezzo: "125,70", costo: "99,87" },
        { ...voceVuota(), descrizione: "Sigillatura", unita: "m", quantita: "1,2", prezzo: "40,05" },
      ],
    };
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preventivo");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await esportaComputoXlsx(vociDaBozza(bozza), { ...bozza, presentazione: "preventivo" });
      const blob = createUrl.mock.calls[0][0] as Blob;
      const buffer = await blob.arrayBuffer();
      const wb = new Workbook();
      await wb.xlsx.load(buffer);
      const valori: unknown[][] = [];
      wb.getWorksheet("Riepilogo")!.eachRow(row => valori.push([row.getCell(1).value, row.getCell(2).value]));
      expect(valori).toEqual(expect.arrayContaining([
        ["Totale dei lavori", 346.60],
        ["Sconto commerciale", -26],
        ["Imponibile", 320.60],
        ["IVA 22%", 70.53],
        ["Totale preventivo", 391.13],
      ]));
      expect(JSON.stringify(wb.worksheets.map(f => f.getSheetValues()))).not.toContain("99.87");
    } finally {
      createUrl.mockRestore();
      click.mockRestore();
    }
  });
});
