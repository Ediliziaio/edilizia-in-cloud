import { describe, expect, it } from "vitest";
import { daFareOggi, type FaseDaFare } from "@/lib/campo/daFareOggi";

const fase = (name: string, extra: Partial<FaseDaFare> = {}): FaseDaFare => ({
  order_id: "o1", name, status: "da_iniziare", position: 0, start_date: null, end_date: null, ...extra,
});

describe("Da fare oggi sul cantiere", () => {
  it("prima le fasi in corso, poi quelle già partite; le finite non contano", () => {
    const r = daFareOggi([
      fase("Demolizioni", { status: "completata", position: 1 }),
      fase("Impianti", { status: "da_iniziare", position: 3, start_date: "2026-11-20" }),
      fase("Murature", { status: "in_corso", position: 2 }),
      fase("Pitture", { position: 4, start_date: "2026-12-01" }),
    ], "2026-11-23");
    expect(r.fasi).toEqual(["Murature", "Impianti"]);
    expect(r).toMatchObject({ aperte: 3, totali: 4, fatte: 1 });
  });

  it("se niente è partito propone la prossima fase; al massimo tre nomi", () => {
    expect(daFareOggi([fase("B", { position: 2 }), fase("A", { position: 1 })], "2026-11-23").fasi).toEqual(["A"]);
    const tante = ["1", "2", "3", "4"].map((n, i) => fase(n, { status: "in_corso", position: i }));
    expect(daFareOggi(tante, "2026-11-23").fasi).toEqual(["1", "2", "3"]);
  });

  it("cantiere finito o senza fasi: niente da fare", () => {
    expect(daFareOggi([], "2026-11-23").fasi).toEqual([]);
    expect(daFareOggi([fase("X", { status: "completata" })], "2026-11-23")).toMatchObject({ fasi: [], aperte: 0, fatte: 1 });
  });
});
