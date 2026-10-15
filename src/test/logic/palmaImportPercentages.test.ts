import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcel, parseCsv } from "@/lib/catalogo/listinoParser";
import { assessOrderEconomicsQuality, canonicalOrderEconomics } from "../../../supabase/functions/_shared/orderEconomics";

describe("Importazione percentuali e attendibilità commessa", () => {
  it("converte percentuali Excel in punti percentuali senza cambiare i costi", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Dati");
    sheet.addRow(["Codice *", "Descrizione *", "Costo", "IVA %"]);
    sheet.addRow(["A1", "Materiale", 25.207, 0.22]);
    sheet.getCell("D2").numFmt = "0%";
    sheet.addRow(["A2", "Materiale esente", 15, 0]);
    sheet.getCell("D3").numFmt = "0%";
    sheet.addRow(["A3", "Aliquota in punti", 20, 22]);
    const data = await wb.xlsx.writeBuffer();
    const rows = await parseExcel(data as ArrayBuffer, { objectType: "product" });
    expect(rows.map(r => r.normalized.vat_rate)).toEqual([22, 0, 22]);
    expect(rows[0].normalized.cost).toBe(25.207);
    expect(rows.flatMap(r => r.errors)).toEqual([]);
  });
  it("accetta IVA percentuale testuale in CSV", () => {
    const rows = parseCsv('Codice *,Descrizione *,IVA %\nA1,Materiale,22%', { objectType: "product" });
    expect(rows[0].normalized.vat_rate).toBe(22);
  });
  it("segnala costi materiali non impegnati e manodopera senza budget", () => {
    const actual = canonicalOrderEconomics({ preventivo_totale: 7400, consuntivo: 400, costo_manodopera: 400, margine: 7000 });
    const quality = assessOrderEconomicsQuality({ sourceAvailable: true, actual,
      items: [{ quantity: 4, purchase_price: 810 }], employees: [{ total_cost: 400, cost_preventivo: null }], teams: [] });
    expect(quality.status).toBe("partial");
    expect(quality.issues.map(i => i.code)).toEqual(expect.arrayContaining(["materials_not_committed", "labor_without_budget"]));
    expect(quality.canShowMargin).toBe(true);
  });
});
