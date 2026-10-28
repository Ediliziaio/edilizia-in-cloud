import { describe, it, expect } from "vitest";
import {
  costoPianoMezzo,
  pianoPerFase,
  statoPianoMezzo,
} from "@/lib/mezzi/pianoCantiere";
describe("Pianificazione mezzi cantiere", () => {
  const periodo = { dal: "2026-11-02", al: "2026-11-06" };
  const costo = {
    tariffa: 100,
    base: "giorno" as const,
    extra: 70,
    fornitore: null as null,
  };
  it("betoniera: cinque giorni compresi più trasporto una sola volta", () =>
    expect(costoPianoMezzo(periodo, costo)).toBe(570));
  it("gru: totale concordato anche senza fine definita", () =>
    expect(
      costoPianoMezzo(
        { ...periodo, al: null },
        { ...costo, base: "totale", tariffa: 5000 },
      ),
    ).toBe(5070));
  it("non inventa durata o totale di un noleggio aperto", () =>
    expect(costoPianoMezzo({ ...periodo, al: null }, costo)).toBeNull());
  it("settimane pro rata, extra una volta", () =>
    expect(
      costoPianoMezzo(
        { dal: "2026-11-01", al: "2026-11-14" },
        { ...costo, base: "settimana" },
      ),
    ).toBe(270));
  it("mese convenzionale 30 giorni attraversa fine mese e ora legale", () =>
    expect(
      costoPianoMezzo(
        { dal: "2026-10-20", al: "2026-11-18" },
        { ...costo, base: "mese" },
      ),
    ).toBe(170));
  it("stesso giorno è un giorno", () =>
    expect(
      costoPianoMezzo({ dal: "2026-11-01", al: "2026-11-01" }, costo),
    ).toBe(170));
  it("periodo invertito non produce un costo negativo", () =>
    expect(
      costoPianoMezzo({ dal: "2026-11-06", al: "2026-11-02" }, costo),
    ).toBeNull());
  it("risorsa generale visibile su ogni fase, risorsa specifica solo nella sua", () => {
    expect(pianoPerFase({ fase_ids: [] }, "b")).toBe(true);
    expect(pianoPerFase({ fase_ids: ["a"] }, "b")).toBe(false);
    expect(pianoPerFase({ fase_ids: ["a"] }, "a")).toBe(true);
  });
  it("programmata non viene presentata come fisicamente sul cantiere", () =>
    expect(
      statoPianoMezzo({ ...periodo, annullato: false }, "2026-10-28"),
    ).toBe("Programmato"));
  it("data finale compresa e annullamento prioritario", () => {
    expect(
      statoPianoMezzo({ ...periodo, annullato: false }, "2026-11-06"),
    ).toBe("Nel periodo previsto");
    expect(
      statoPianoMezzo({ ...periodo, annullato: false }, "2026-11-07"),
    ).toBe("Terminato");
    expect(statoPianoMezzo({ ...periodo, annullato: true }, "2026-10-01")).toBe(
      "Annullato",
    );
  });
});
