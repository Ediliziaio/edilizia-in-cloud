import { describe, expect, it } from "vitest";
import { daRicopiare } from "@/lib/campo/comeIeri";

const ieri = {
  data_lavoro: "2026-11-23",
  ore_lavorate: 0,
  presenze: [
    { nome: "Davide", ore: 8, employee_id: "e1" },
    { nome: "Matteo", ore: 6.5, employee_id: "e2" },
    { nome: "Ex collega", ore: 8, employee_id: "e9" },
    { nome: "Ditta Alfa", ore: 8, subappaltatore_id: "s1" },
  ],
  fasi_lavorate: [
    { phase_id: "f1", sottofasi_lavorate: ["v1", "v2"], sottofasi_fatte: ["v3"] },
    { phase_id: "f-finita", sottofasi_lavorate: ["v9"] },
  ],
  mezzi: ["m1", "m-restituito"],
};
const oggi = {
  persone: [
    { key: "k1", employee_id: "e1", nome: "Davide" },
    { key: "k2", employee_id: "e2", nome: "Matteo" },
    { key: "k3", subappaltatore_id: "s1", nome: "Ditta Alfa" },
  ],
  fasiAperte: ["f1"],
  mezziAmmessi: ["m1"],
};

describe("Come ieri", () => {
  it("ricopia chi c'era con le sue ore, le fasi ancora aperte con le voci lavorate e i mezzi ancora assegnati", () => {
    expect(daRicopiare(ieri, oggi)).toEqual({
      presenze: { k1: 8, k2: 6.5, k3: 8 },
      fasi: ["f1"],
      sottofasiLavorate: ["v1", "v2"],
      mezzi: ["m1"],
      ore: null,
    });
  });

  it("chi non è più in squadra, fasi finite e mezzi restituiti restano fuori; i dati strani non rompono", () => {
    const r = daRicopiare({ data_lavoro: "x", ore_lavorate: 7.5, presenze: "boh", fasi_lavorate: [null, { phase_id: 3 }], mezzi: [] }, oggi);
    expect(r).toEqual({ presenze: {}, fasi: [], sottofasiLavorate: [], mezzi: [], ore: 7.5 });
  });
});
