import { describe, expect, it } from "vitest";
import { totaleAnteprimaPagamento } from "@/lib/orders/totaleAnteprimaPagamento";
describe("Totale di esempio del piano rate", () => {
  it.each([
    ["10000", 10000],
    ["10.000,01", 10000.01],
    ["1234.50", 1234.5],
    ["1 234,50 €", 1234.5],
    ["0,01", 0.01],
  ])("legge %s", (raw, n) => {
    expect(totaleAnteprimaPagamento(String(raw))).toBe(n);
  });
  it.each([
    "",
    "abc",
    "-1",
    "0",
    "10,123",
    "1.2.3",
    "Infinity",
    "99999999999999999999",
  ])("rifiuta %s senza sostituirlo con un importo", (raw) => {
    expect(totaleAnteprimaPagamento(raw)).toBeNull();
  });
});
