import { expect, it } from "vitest";
import {
  payrollPeriod,
  payrollAmount,
  signedPayrollAmount,
  payrollCsv,
  overlappingMeals,
  assertPayrollDate,
  optionalPayrollAmount,
  type PayrollMovement,
} from "@/lib/paghe/registri";
it("uses valid month boundaries, including leap years, without time-zone shifts", () => {
  expect(payrollPeriod("2024-02")).toEqual({
    start: "2024-02-01",
    end: "2024-02-29",
  });
  for (const v of ["2026-13", "2026-1", "0001-01", "2026-00"])
    expect(() => payrollPeriod(v)).toThrow();
});
it("does not silently register entries in another month or on nonexistent days", () => {
  expect(() => assertPayrollDate("2026-02-28", "2026-02")).not.toThrow();
  for (const date of [
    "",
    "2026-02-30",
    "2026-03-01",
    "2026-01-31",
    "2026-02-00",
  ])
    expect(() => assertPayrollDate(date, "2026-02")).toThrow();
});
it("does not turn empty or malformed amounts into zero and assigns explicit ledger signs", () => {
  expect(payrollAmount("1.250,50")).toBe(1250.5);
  for (const v of ["", "garbage", "-100", "0", "1,123"])
    expect(() => payrollAmount(v)).toThrow();
  expect(signedPayrollAmount("tfr_anticipo", "100")).toBe(-100);
  expect(signedPayrollAmount("welfare_utilizzo", "20")).toBe(-20);
  expect(signedPayrollAmount("tfr_rettifica", "10", true)).toBe(-10);
  expect(signedPayrollAmount("tfr_quota", "10", true)).toBe(10);
});
it("distinguishes unknown payslip values from a verified zero", () => {
  expect(optionalPayrollAmount("", "Contributi")).toBeNull();
  expect(optionalPayrollAmount("0", "Contributi")).toBe(0);
  expect(optionalPayrollAmount("350,50", "Contributi")).toBe(350.5);
  expect(() => optionalPayrollAmount("-2", "Contributi")).toThrow();
});
it("escapes spreadsheet formula injection in all user-supplied export fields", () => {
  const row = {
    data: "2026-10-01",
    profilo_id: "p",
    tipo: "tfr_quota",
    importo: 100,
    fonte: "azienda",
    riferimento: '=WEBSERVICE("x")',
    destinazione: "@SUM(1)",
  } as PayrollMovement;
  const csv = payrollCsv([row], new Map([["p", "+Persona"]]));
  expect(csv).toContain("'+Persona");
  expect(csv).toContain("'=WEBSERVICE");
  expect(csv).toContain("'@SUM");
});
it("flags overlapping fixed/receipt meals per person and day, without treating cancelled rows as double benefits", () => {
  const base = {
    id: "1",
    profilo_id: "p",
    giorno: "2026-10-01",
    importo: 8,
    stato: "maturato",
  };
  expect(
    overlappingMeals([
      { ...base, tipo: "fisso" },
      { ...base, id: "2", tipo: "ricevuta" },
    ]),
  ).toBe(1);
  expect(
    overlappingMeals([
      { ...base, tipo: "fisso" },
      { ...base, id: "2", tipo: "ricevuta", stato: "annullato" },
    ]),
  ).toBe(0);
});
