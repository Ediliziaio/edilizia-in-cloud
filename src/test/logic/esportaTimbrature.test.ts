import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { esportaTimbratureXlsx } from "@/lib/personale/esportaTimbrature";
import type { RigaTimbratura } from "@/lib/personale/timbrature";

let n = 0;
const ev = (profilo: string, tipo: string, ora: string, reparto: string): RigaTimbratura => ({
  id: `e${n++}`, data_evento: "2026-10-01", ora_evento: `${ora}:00`, tipo, profilo_id: profilo,
  profilo_nome: profilo, profilo_cognome: "Rossi", reparto, mansione: null,
});

async function esporta(raggruppa: "nessuno" | "reparto") {
  let blob: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; }) as never;
  URL.revokeObjectURL = vi.fn() as never;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await esportaTimbratureXlsx({
    da: "2026-10-01", a: "2026-10-01", raggruppa,
    righe: [ev("Anna", "entrata", "08:00", "Cantiere"), ev("Anna", "uscita", "16:00", "Cantiere"), ev("Bruno", "entrata", "09:00", "Ufficio"), ev("Bruno", "uscita", "13:00", "Ufficio")],
  });
  const wb = new ExcelJS.Workbook();
  const buf = await new Promise<ArrayBuffer>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.readAsArrayBuffer(blob!); });
  await wb.xlsx.load(buf);
  return wb;
}

describe("file Excel delle timbrature", () => {
  it("riepilogo ore con le ore nette, totali per persona e dettaglio in un foglio", async () => {
    const wb = await esporta("nessuno");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Riepilogo ore", "Totali", "Timbrature"]);
    const riepilogo = wb.getWorksheet("Riepilogo ore")!;
    const ore = riepilogo.getRows(2, 2)!.map((r) => r.getCell(2).value + " " + r.getCell(8).value);
    expect(ore).toEqual(["Anna Rossi 8:00", "Bruno Rossi 4:00"]);
    expect(wb.getWorksheet("Timbrature")!.rowCount).toBe(5);
  });
  it("diviso per reparto: un foglio di dettaglio per reparto", async () => {
    const wb = await esporta("reparto");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Riepilogo ore", "Totali", "Cantiere", "Ufficio"]);
    expect(wb.getWorksheet("Cantiere")!.rowCount).toBe(3);
  });
});
