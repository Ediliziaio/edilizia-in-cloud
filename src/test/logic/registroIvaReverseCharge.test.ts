import { it, expect } from "vitest";
import {
  fiscalRows,
  type FiscalDocument,
} from "@/lib/fatturazione/fiscalWorkspace";
const purchase = (rate: unknown): FiscalDocument => ({
  id: "r",
  numero_fattura: "RC/1",
  data_fattura: "2026-10-01",
  imponibile_totale: 100,
  iva_totale: 0,
  totale_documento: 100,
  aliquota_reverse_charge: rate,
  riepilogo_iva: [{ aliquota: 0, imponibile: 100, imposta: 0, natura: "N6.3" }],
});
it("does not assume 22% when the reverse charge rate is missing", () => {
  expect(fiscalRows([], [purchase(null)]).some((r) => r.synthetic)).toBe(false);
});
it("a stated 10% generates two explicit projections, not registered invoices", () => {
  const rows = fiscalRows([], [purchase(10)]);
  expect(rows.filter((r) => r.synthetic).map((r) => r.tax)).toEqual([
    1000, 1000,
  ]);
  expect(rows.find((r) => r.id.startsWith("rc-a:"))?.base).toBe(0);
  expect(rows.every((r) => r.documentId === "r")).toBe(true);
});
it("receipt credit notes reverse both projections", () => {
  const p = purchase(22);
  p.tipo_documento = "TD04";
  expect(
    fiscalRows([], [p])
      .filter((r) => r.synthetic)
      .map((r) => r.tax),
  ).toEqual([-2200, -2200]);
});
