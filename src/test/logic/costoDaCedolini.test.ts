import { describe, expect, it } from "vitest";
import { costoDaCedolini, type CedolinoMese, type RapportinoOre } from "@/lib/orders/costoDaCedolini";

const rapportino = (data_lavoro: string, employee_id: string, ore: number, costo: number): RapportinoOre => ({ data_lavoro, presenze_registrate: [{ employee_id, ore, costo }] });
const cedolino = (employee_id: string, anno: number, mese: number, lordo: number, contributi_datore: number | null, ore_lavorate: number | null): CedolinoMese => ({ employee_id, anno, mese, lordo, contributi_datore, ore_lavorate });

describe("Costo della manodopera dal cedolino", () => {
  it("costo del mese diviso le ore lavorate nel mese, per le ore fatte in questa commessa", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 40, costo: 800 }],
      rapportini: [rapportino("2026-03-10", "e1", 40, 800)],
      cedolini: [cedolino("e1", 2026, 3, 3000, 840, 160)],
    }).persone[0];
    // (3.000 + 840) / 160 = 24 €/h × 40 h
    expect(r.mesi[0]).toMatchObject({ mese: "2026-03", oreCommessa: 40, oreMese: 160, costoMese: 3840, orario: 24, costo: 960, coperto: true });
    expect(r).toMatchObject({ oreCoperte: 40, costoCedolino: 960, costoTotale: 960, differenza: 160, orarioMedio: 24 });
  });
  it("un cantiere lungo pesa ogni mese col suo costo orario", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 30, costo: 600 }],
      rapportini: [rapportino("2026-03-10", "e1", 10, 200), rapportino("2026-03-11", "e1", 10, 200), rapportino("2026-04-02", "e1", 10, 200)],
      cedolini: [cedolino("e1", 2026, 3, 2000, 0, 100), cedolino("e1", 2026, 4, 3000, 0, 100)],
    }).persone[0];
    expect(r.mesi.map((m) => [m.mese, m.oreCommessa, m.orario, m.costo])).toEqual([["2026-03", 20, 20, 400], ["2026-04", 10, 30, 300]]);
    expect(r.costoTotale).toBe(700);
  });
  it("il mese senza cedolino resta al costo registrato e viene segnalato", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 20, costo: 400 }],
      rapportini: [rapportino("2026-03-10", "e1", 10, 200), rapportino("2026-04-10", "e1", 10, 200)],
      cedolini: [cedolino("e1", 2026, 3, 3000, 0, 100)],
    }).persone[0];
    expect(r.mesi[1]).toMatchObject({ mese: "2026-04", coperto: false, motivo: "Manca il cedolino", costo: null });
    expect(r).toMatchObject({ oreCoperte: 10, oreScoperte: 10, costoCedolino: 300, costoTotale: 500 });
  });
  it("un cedolino senza ore non si può dividere", () => {
    for (const ore of [0, null]) {
      const r = costoDaCedolini({ persone: [{ id: "e1", ore: 10, costo: 200 }], rapportini: [rapportino("2026-03-10", "e1", 10, 200)], cedolini: [cedolino("e1", 2026, 3, 3000, 0, ore)] }).persone[0];
      expect(r.mesi[0]).toMatchObject({ coperto: false, motivo: "Il cedolino non ha le ore" });
      expect(r.costoTotale).toBe(200);
    }
  });
  it("le ore a mano, senza rapportino né data, restano al costo registrato", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 15, costo: 300 }],
      rapportini: [rapportino("2026-03-10", "e1", 10, 200)],
      cedolini: [cedolino("e1", 2026, 3, 3000, 0, 100)],
    }).persone[0];
    expect(r).toMatchObject({ oreCoperte: 10, oreScoperte: 5, costoCedolino: 300, costoTotale: 400 });
  });
  it("senza nessun cedolino non inventa una differenza", () => {
    const r = costoDaCedolini({ persone: [{ id: "e1", ore: 10, costo: 200 }], rapportini: [rapportino("2026-03-10", "e1", 10, 200)], cedolini: [] });
    expect(r.persone[0]).toMatchObject({ oreCoperte: 0, differenza: null, orarioMedio: null });
    expect(r).toMatchObject({ oreCoperte: 0, differenza: null });
  });
  it("segnala più ore in commessa di quelle sul cedolino", () => {
    const r = costoDaCedolini({ persone: [{ id: "e1", ore: 120, costo: 2400 }], rapportini: [rapportino("2026-03-10", "e1", 120, 2400)], cedolini: [cedolino("e1", 2026, 3, 2000, 0, 100)] }).persone[0];
    expect(r.mesi[0].oltreIlCedolino).toBe(true);
  });
  it("somma più persone e ignora gli altri dipendenti del rapportino", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 10, costo: 200 }, { id: "e2", ore: 10, costo: 300 }],
      rapportini: [{ data_lavoro: "2026-03-10", presenze_registrate: [{ employee_id: "e1", ore: 10, costo: 200 }, { employee_id: "e2", ore: 10, costo: 300 }, { employee_id: "e9", ore: 8, costo: 160 }] }],
      cedolini: [cedolino("e1", 2026, 3, 3000, 0, 100), cedolino("e2", 2026, 3, 2000, 0, 100)],
    });
    expect(r).toMatchObject({ oreCoperte: 20, costoCedolino: 500, costoTotale: 500, costoRegistrato: 500, differenza: 0 });
  });
  it("regge rapportini senza fotografia o con valori sporchi", () => {
    const r = costoDaCedolini({
      persone: [{ id: "e1", ore: 10, costo: 200 }],
      rapportini: [{ data_lavoro: "2026-03-10", presenze_registrate: null }, { data_lavoro: "2026-03-11", presenze_registrate: [{ employee_id: "e1", ore: "x", costo: 5 }, null] }, rapportino("2026-03-12", "e1", 10, 200)],
      cedolini: [cedolino("e1", 2026, 3, 3000, null, 100)],
    }).persone[0];
    expect(r.oreCoperte).toBe(10);
    expect(r.costoCedolino).toBe(300);
  });
});
