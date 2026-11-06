import { expect, it } from "vitest";
import { importiRatePdf } from "@/lib/serramenti/importiRatePdf";
it("UX-77: mantiene i centesimi delle rate del campione", () => {
  expect(importiRatePdf(347.70, [30, 40, 30])).toEqual([104.31, 139.08, 104.31]);
});
it("riconcilia il residuo sull'ultima rata", () => {
  expect(importiRatePdf(0.05, [50, 50])).toEqual([0.03, 0.02]);
});
it("non trasforma un piano parziale in un saldo al 100%", () => {
  expect(importiRatePdf(100, [30, 40])).toEqual([30, 40]);
  expect(importiRatePdf(100, [])).toEqual([]);
});
