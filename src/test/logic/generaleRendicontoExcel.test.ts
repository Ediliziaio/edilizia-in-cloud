import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { MODELLI_DOSSIER, componiDossier } from "@/lib/orders/generali/rendiconto";
import { creaExcelDossier } from "@/lib/orders/generali/rendicontoExcel";
import { inputAppalto, inputSviluppo } from "@/test/fixtures/generaleRendiconto";

/** L'Excel del dossier riaperto: un foglio per sezione e numeri che restano numeri. */

async function apri(d: ReturnType<typeof componiDossier>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await creaExcelDossier(d));
  return wb;
}

/** La riga che ha `etichetta` nella colonna `colonna`. */
function riga(ws: ExcelJS.Worksheet, etichetta: string | number, colonna = 1) {
  let trovata: ExcelJS.Row | null = null;
  ws.eachRow((r) => { if (!trovata && r.getCell(colonna).value === etichetta) trovata = r; });
  if (!trovata) throw new Error(`Riga «${etichetta}» non trovata in ${ws.name}`);
  return trovata as ExcelJS.Row;
}

describe("Excel del dossier", () => {
  it("completo: un foglio per sezione, nell'ordine del PDF", async () => {
    const wb = await apri(componiDossier(inputSviluppo()));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Dossier", "Sintesi", "Avanzamento", "Piano economico", "Andamento", "Flusso di cassa", "Fonti e debito", "Soci e investitori", "Unità", "Documenti", "Note",
    ]);
  });

  it("i numeri sono numeri, in euro, e tornano con quelli del dossier", async () => {
    const d = componiDossier(inputSviluppo());
    const wb = await apri(d);
    const piano = wb.getWorksheet("Piano economico")!;
    const margine = riga(piano, "Margine");
    expect(margine.getCell(2).value).toBe(d.piano!.totali.margine.previsto);
    expect(margine.getCell(5).value).toBe(d.piano!.totali.margine.stima);
    expect(margine.getCell(5).numFmt).toContain("€");
    const soci = wb.getWorksheet("Soci e investitori")!;
    expect(riga(soci, "Mario Rossi").getCell(4).value).toBe(200_000);
    const avanzamento = wb.getWorksheet("Avanzamento")!;
    const a1 = riga(avanzamento, "Appartamento A1", 2);
    expect(a1.getCell(4).value).toBe(0.5);
    expect(a1.getCell(4).numFmt).toBe("0.0%");
  });

  it("per la banca niente foglio dei soci; l'appalto ha Contratto e SAL con le date vere", async () => {
    const banca = await apri(componiDossier(inputSviluppo({ modello: "banca", sezioni: MODELLI_DOSSIER.banca.sezioni })));
    expect(banca.getWorksheet("Soci e investitori")).toBeUndefined();
    const ap = await apri(componiDossier(inputAppalto()));
    expect(ap.worksheets.map((w) => w.name)).toEqual(["Dossier", "Sintesi", "Avanzamento", "Contratto", "SAL"]);
    const contratto = ap.getWorksheet("Contratto")!;
    expect(riga(contratto, "Valore aggiornato").getCell(2).value).toBe(980_000);
    expect(riga(contratto, "Fine aggiornata con le proroghe").getCell(3).value).toBeInstanceOf(Date);
    const sal = ap.getWorksheet("SAL")!;
    expect(riga(sal, 1).getCell(8).value).toBe(238_500);
  });

  it("un testo che comincia con «=» non diventa una formula", async () => {
    const d = componiDossier(inputSviluppo({ note: "=HYPERLINK(\"http://x\")" }));
    const wb = await apri(d);
    expect(String(wb.getWorksheet("Note")!.getCell("A4").value)).toMatch(/^'=/);
  });
});
