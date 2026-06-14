import { describe, it, expect } from "vitest";
import { parseVariants, pickVariant, pickWinner } from "../../../supabase/functions/_shared/outreach-abz";

describe("parseVariants", () => {
  it("divide su === e ripulisce", () => {
    expect(parseVariants("Oggetto A\n===\n Oggetto B ")).toEqual(["Oggetto A", "Oggetto B"]);
  });
  it("singola variante senza separatore", () => {
    expect(parseVariants("Solo questo")).toEqual(["Solo questo"]);
  });
  it("vuoto → []", () => {
    expect(parseVariants("")).toEqual([]);
  });
  it("ignora parti vuote", () => {
    expect(parseVariants("A\n===\n\n===\nB")).toEqual(["A", "B"]);
  });
});

describe("pickVariant", () => {
  it("rotazione deterministica per seed", () => {
    const v = ["A", "B", "C"];
    expect(pickVariant(v, 0)).toEqual({ index: 0, text: "A" });
    expect(pickVariant(v, 1)).toEqual({ index: 1, text: "B" });
    expect(pickVariant(v, 5)).toEqual({ index: 2, text: "C" }); // 5 % 3 = 2
  });
  it("seed grande wrappa", () => {
    expect(pickVariant(["A", "B"], 100)?.index).toBe(0); // 100 % 2 = 0
  });
  it("nessuna variante → null", () => {
    expect(pickVariant([], 3)).toBeNull();
  });
});

describe("pickWinner", () => {
  it("miglior reply rate tra quelle con volume minimo", () => {
    const stats = [
      { index: 0, sent: 100, replied: 5 },  // 5%
      { index: 1, sent: 100, replied: 12 }, // 12% ← vincente
      { index: 2, sent: 100, replied: 8 },  // 8%
    ];
    expect(pickWinner(stats, 20)).toEqual({ index: 1, rate: 0.12 });
  });
  it("esclude varianti sotto volume minimo", () => {
    const stats = [
      { index: 0, sent: 5, replied: 5 },    // 100% ma sotto soglia → escluso
      { index: 1, sent: 50, replied: 5 },   // 10% ← unica qualificata
    ];
    expect(pickWinner(stats, 20)?.index).toBe(1);
  });
  it("nessuna qualificata → null", () => {
    expect(pickWinner([{ index: 0, sent: 3, replied: 1 }], 20)).toBeNull();
  });
});
