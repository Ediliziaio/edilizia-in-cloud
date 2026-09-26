/**
 * Manodopera e Mezzi (26/09/2026): la giornata degli operai in parole semplici
 * e le schede visibili per permesso e piano.
 */
import { describe, expect, it } from "vitest";
import {
  cantiereDelGruppo, contaGiornata, etichettaGiornata, formatOre, giornoInParole, passaFiltroGiornata, perSquadra, spostaGiorno,
} from "@/lib/manodopera/giornata";
import { schedaDaAprire, schedeManodopera } from "@/lib/manodopera/schede";

describe("giornata degli operai", () => {
  it("le assenze dicono il motivo, gli altri stati la loro etichetta", () => {
    expect(etichettaGiornata("assente", "ferie")).toBe("In ferie");
    expect(etichettaGiornata("assente", "rol")).toBe("In permesso");
    expect(etichettaGiornata("assente", null)).toBe("Assente");
    expect(etichettaGiornata("uscita_mancante")).toBe("Uscita non timbrata");
    expect(etichettaGiornata("qualcosa di nuovo")).toBe("Non ha timbrato");
  });

  it("chi è in pausa conta fra chi lavora; chi non ha timbrato fra quelli da controllare", () => {
    const righe = ["al_lavoro", "in_pausa", "uscito", "assente", "non_timbrato", "uscita_mancante"].map((stato) => ({ stato }));
    expect(contaGiornata(righe)).toEqual({ alLavoro: 2, usciti: 1, assenti: 1, daControllare: 2, riposo: 0 });
    expect(righe.filter((r) => passaFiltroGiornata(r.stato, "da_controllare")).map((r) => r.stato))
      .toEqual(["non_timbrato", "uscita_mancante"]);
  });

  it("il giorno di riposo non è «da controllare»", () => {
    const c = contaGiornata([{ stato: "riposo" }, { stato: "riposo" }, { stato: "al_lavoro" }]);
    expect(c).toEqual({ alLavoro: 1, usciti: 0, assenti: 0, daControllare: 0, riposo: 2 });
    expect(passaFiltroGiornata("riposo", "da_controllare")).toBe(false);
    expect(etichettaGiornata("riposo")).toBe("A riposo");
  });

  it("divide per squadra, chi non ha squadra in fondo, e trova il cantiere del gruppo", () => {
    const r = (squadra_id: string | null, squadra: string | null, cantiere: string | null, previsto: string | null) =>
      ({ squadra_id, squadra, squadra_colore: null as string | null, cantiere, previsto });
    const gruppi = perSquadra([r(null, null, null, null), r("b", "Posa", null, "ORD-2"), r("a", "Muratori", "ORD-1", null), r("b", "Posa", null, "ORD-2")]);
    expect(gruppi.map((g) => [g.nome, g.righe.length])).toEqual([["Muratori", 1], ["Posa", 2], ["Senza squadra", 1]]);
    expect(cantiereDelGruppo(gruppi[1].righe)).toBe("ORD-2");
    expect(cantiereDelGruppo(gruppi[2].righe)).toBeNull();
  });

  it("ore leggibili", () => {
    expect(formatOre(9.82)).toBe("9 h 49 min");
    expect(formatOre(8)).toBe("8 h");
    expect(formatOre(0.5)).toBe("30 min");
    expect(formatOre(null)).toBe("—");
  });

  it("giorni in parole e spostamenti a cavallo del mese", () => {
    expect(giornoInParole("2026-09-26", "2026-09-26")).toBe("Oggi");
    expect(giornoInParole("2026-09-25", "2026-09-26")).toBe("Ieri");
    expect(giornoInParole("2026-09-24", "2026-09-26")).toBe("Giovedì 24 settembre");
    expect(spostaGiorno("2026-09-30", 1)).toBe("2026-10-01");
    expect(spostaGiorno("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("schede di Manodopera e Mezzi", () => {
  const tutto = { operai: true, subappaltatori: true, mezzi: true };

  it("ogni scheda ha il suo permesso", () => {
    expect(schedeManodopera({ permessi: tutto, modulo: () => true, subappaltatoriNelPiano: true }))
      .toEqual(["operai", "subappaltatori", "mezzi"]);
    expect(schedeManodopera({ permessi: { ...tutto, operai: false }, modulo: () => true, subappaltatoriNelPiano: true }))
      .toEqual(["subappaltatori", "mezzi"]);
  });

  it("il piano spegne le schede che non comprende (es. piano solo Marketing)", () => {
    expect(schedeManodopera({ permessi: tutto, modulo: () => false, subappaltatoriNelPiano: false })).toEqual([]);
    expect(schedeManodopera({ permessi: tutto, modulo: (k) => k === "mezzi", subappaltatoriNelPiano: false }))
      .toEqual(["mezzi"]);
  });

  it("l'indirizzo sceglie la scheda solo se la persona può aprirla", () => {
    expect(schedaDaAprire(["operai", "mezzi"], "mezzi")).toBe("mezzi");
    expect(schedaDaAprire(["operai", "mezzi"], "subappaltatori")).toBe("operai");
    expect(schedaDaAprire([], "operai")).toBeNull();
  });
});
