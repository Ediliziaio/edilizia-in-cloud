/**
 * I termini di pagamento arrivano scritti in tutti i modi: qui si fissa il
 * comportamento del parser su quelli veri, cosi' una "miglioria" futura che
 * rompe "30 gg fm" non passa inosservata.
 */
import { describe, expect, it } from "vitest";
import { calcolaScadenza, chiedeFineMese, estraiGiorni } from "@/lib/terminiPagamento";

const base = new Date(2026, 2, 10); // 10 marzo 2026

describe("estraiGiorni", () => {
  it("legge le forme comuni", () => {
    expect(estraiGiorni("30 gg")).toBe(30);
    expect(estraiGiorni("30gg")).toBe(30);
    expect(estraiGiorni("60 giorni")).toBe(60);
    expect(estraiGiorni("bonifico 30 gg fine mese")).toBe(30);
    expect(estraiGiorni("90 GG D.F.")).toBe(90);
  });

  it("alla consegna vale zero giorni", () => {
    expect(estraiGiorni("alla consegna")).toBe(0);
    expect(estraiGiorni("pagamento anticipato")).toBe(0);
  });

  it("con le rate multiple conta la prima", () => {
    expect(estraiGiorni("30/60/90")).toBe(30);
    expect(estraiGiorni("60-90")).toBe(60);
  });

  it("il testo incomprensibile non inventa numeri", () => {
    expect(estraiGiorni("come da accordi")).toBeNull();
    expect(estraiGiorni("")).toBeNull();
    expect(estraiGiorni(null)).toBeNull();
    // "Bonifico" da solo non dice QUANDO.
    expect(estraiGiorni("bonifico bancario")).toBeNull();
  });
});

describe("calcolaScadenza", () => {
  it("somma i giorni alla data base", () => {
    expect(calcolaScadenza("30 gg", base)).toBe("2026-04-09");
    expect(calcolaScadenza("60 gg", base)).toBe("2026-05-09");
    expect(calcolaScadenza("alla consegna", base)).toBe("2026-03-10");
  });

  it("fine mese va all'ultimo giorno del mese calcolato", () => {
    // 10/03 + 30gg = 09/04 → fine mese = 30/04
    expect(calcolaScadenza("30 gg fine mese", base)).toBe("2026-04-30");
    expect(calcolaScadenza("30gg fm", base)).toBe("2026-04-30");
    // Febbraio: 10/01 + 30gg = 09/02 → 28/02
    expect(calcolaScadenza("30 gg f.m.", new Date(2026, 0, 10))).toBe("2026-02-28");
  });

  it("senza termini leggibili non restituisce date", () => {
    expect(calcolaScadenza("come da accordi", base)).toBeNull();
    expect(calcolaScadenza(null, base)).toBeNull();
  });
});

describe("chiedeFineMese", () => {
  it("riconosce le grafie correnti", () => {
    expect(chiedeFineMese("30 gg fine mese")).toBe(true);
    expect(chiedeFineMese("60gg FM")).toBe(true);
    expect(chiedeFineMese("30 gg f.m.")).toBe(true);
    expect(chiedeFineMese("30 gg")).toBe(false);
  });
});
