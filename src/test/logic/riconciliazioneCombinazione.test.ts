import { describe, expect, it } from "vitest";
import { combinazioneEsatta, leggiImporto } from "@/lib/finance/reconciliationAnalysis";

describe("leggiImporto", () => {
  it("capisce il modo italiano e quello col punto", () => {
    expect(leggiImporto("1.234,50")).toBe(1234.5);
    expect(leggiImporto("1234.5")).toBe(1234.5);
    expect(leggiImporto("1234,5 €")).toBe(1234.5);
  });
  it("rifiuta ciò che non è un importo", () => {
    expect(leggiImporto("")).toBeNull();
    expect(leggiImporto("abc")).toBeNull();
    expect(leggiImporto("-5")).toBeNull();
  });
});

describe("combinazioneEsatta", () => {
  const c = (key: string, residuo: number, affine = false) => ({ key, residuo, affine });
  it("trova le fatture che fanno il bonifico", () => {
    expect(combinazioneEsatta(300, [c("a", 100), c("b", 250), c("c", 200)])?.sort()).toEqual(["a", "c"]);
  });
  it("preferisce la stessa controparte", () => {
    expect(combinazioneEsatta(300, [c("x", 150), c("y", 150), c("a", 100, true), c("b", 200, true)])?.sort()).toEqual(["a", "b"]);
  });
  it("una fattura sola non è una combinazione", () => {
    expect(combinazioneEsatta(300, [c("a", 300), c("b", 10)])).toBeNull();
  });
  it("senza somma esatta non propone niente", () => {
    expect(combinazioneEsatta(300, [c("a", 100), c("b", 150.01)])).toBeNull();
  });
  it("regge i centesimi", () => {
    expect(combinazioneEsatta(0.3, [c("a", 0.1), c("b", 0.2)])?.sort()).toEqual(["a", "b"]);
  });
  it("con molti candidati risponde subito", () => {
    const tanti = Array.from({ length: 200 }, (_, i) => c(`k${i}`, 1000 + i * 7.13));
    const inizio = Date.now();
    combinazioneEsatta(999999.99, tanti);
    expect(Date.now() - inizio).toBeLessThan(1500);
  });
});
