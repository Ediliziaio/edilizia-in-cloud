import { expect, it } from "vitest";
import { dataFotografia } from "@/lib/orders/generali/reportMensilePeriodo";

it("conserva il termine di una rilevazione inframensile", () => {
  expect(dataFotografia("2026-10", "2026-10-05T12:00:00Z")).toBe("2026-10-05");
});
it("una correzione successiva non include movimenti del mese seguente", () => {
  expect(dataFotografia("2026-10", "2026-11-11T12:00:00Z")).toBe("2026-10-31");
  expect(dataFotografia("2024-02", "2024-03-01T12:00:00Z")).toBe("2024-02-29");
});
it("una data assente o precedente al periodo non autorizza il rendiconto", () => {
  expect(dataFotografia("2026-10", null)).toBeNull();
  expect(dataFotografia("2026-10", "2026-09-30T23:00:00Z")).toBeNull();
  expect(dataFotografia("2026-13", "2026-12-31T12:00:00Z")).toBeNull();
});
