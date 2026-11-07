import { describe, expect, it } from "vitest";
import { andamentoLavori } from "@/lib/orders/andamentoLavori";

const fasi = [
  { start_date: "2026-11-01", end_date: "2026-11-05" },
  { start_date: "2026-11-06", end_date: "2026-11-10" },
];

describe("andamentoLavori", () => {
  it("tempo trascorso fra la prima data e l'ultima, giorni inclusi", () => {
    const a = andamentoLavori(50, fasi, "2026-11-05");
    expect(a.tempo).toBe(50);
    expect(a.stato).toBe("in_linea");
    expect([a.inizio, a.fine]).toEqual(["2026-11-01", "2026-11-10"]);
  });

  it("indietro oltre la soglia = in ritardo, coi punti", () => {
    const a = andamentoLavori(20, fasi, "2026-11-08");
    expect(a.tempo).toBe(80);
    expect(a.stato).toBe("in_ritardo");
    expect(a.punti).toBe(60);
  });

  it("avanti oltre la soglia = in anticipo", () => {
    expect(andamentoLavori(60, fasi, "2026-11-02").stato).toBe("in_anticipo");
  });

  it("lavori finiti non sono mai in ritardo, anche dopo la fine", () => {
    const a = andamentoLavori(100, fasi, "2026-12-01");
    expect(a.stato).toBe("in_linea");
    expect(a.tempo).toBe(100);
  });

  it("prima dell'inizio il tempo è zero, dopo la fine è cento", () => {
    expect(andamentoLavori(0, fasi, "2026-10-20").tempo).toBe(0);
    expect(andamentoLavori(90, fasi, "2026-11-30").tempo).toBe(100);
  });

  it("senza date: solo quanto è fatto", () => {
    const a = andamentoLavori(48, [{ start_date: null, end_date: null }], "2026-11-07");
    expect(a).toMatchObject({ fatto: 48, tempo: null, stato: null });
  });

  it("date con l'ora non spostano il calcolo", () => {
    expect(andamentoLavori(50, [{ start_date: "2026-11-01T00:00:00+00:00", end_date: "2026-11-10" }], "2026-11-05").tempo).toBe(50);
  });
});
