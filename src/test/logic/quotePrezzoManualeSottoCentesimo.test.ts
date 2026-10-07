/**
 * Prezzo scritto a mano: un valore che al centesimo diventa zero non è un prezzo.
 * Prima «0,004» tornava 0 (e non null): il preventivo si salvava con
 * prezzo_manuale = 0 e il vincolo del database (prezzo_manuale > 0) rifiutava
 * tutto il salvataggio.
 */
import { describe, expect, it } from "vitest";
import { prezzoDaTesto } from "@/lib/preventivi/prezzoAMano";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";

describe("prezzoDaTesto: sotto il centesimo", () => {
  it.each(["0,004", "0.001", "0,0049", "1e-9"])("%s non è un prezzo", (testo) => {
    expect(prezzoDaTesto(testo)).toBeNull();
  });

  it("il mezzo centesimo si arrotonda in su, come il database: 0,005 → 0,01", () => {
    expect(prezzoDaTesto("0,005")).toBe(0.01);
    expect(prezzoDaTesto("0,01")).toBe(0.01);
  });

  it("i casi di sempre non cambiano", () => {
    expect(prezzoDaTesto("8000")).toBe(8000);
    expect(prezzoDaTesto(" 8500,5 ")).toBe(8500.5);
    expect(prezzoDaTesto("1234.567")).toBe(1234.57);
    for (const testo of ["", "  ", "0", "-3", "abc", "Infinity"]) expect(prezzoDaTesto(testo)).toBeNull();
  });

  it("un prezzo manuale che arriva da fuori con meno di mezzo centesimo non attiva il prezzo scritto", () => {
    const t = calcolaTotaliPreventivo([{ quantity: 2, unit_price: 50, discount_percent: 0, vat_rate: 22 }], 0, 0, 0.004, 22);
    expect(t.prezzo_manuale).toBe(false);
    expect(t.subtotale).toBe(100);
    expect(t.totale).toBe(122);
  });
});
