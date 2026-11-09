import { describe, expect, it } from "vitest";
import { controlloGiornata, giornatePersona, orarioNormale, oreScritte } from "@/lib/orders/giornataPersona";
import type { RapportinoRiga } from "@/lib/orders/rapportiniMese";

const r = (id: string, order: string, data: string, ore: Record<string, number>, stato = "approvato"): RapportinoRiga => ({
  id, order_id: order, data_lavoro: data, stato, approvato: stato === "approvato",
  presenze: Object.entries(ore).map(([e, o]) => ({ employee_id: e, nome: e, ore: o })),
  order: { client_name: order },
});

describe("giornate di una persona", () => {
  it("mette insieme i cantieri dello stesso giorno, col totale", () => {
    const g = giornatePersona([r("1", "A", "2026-11-03", { luciano: 2, marco: 8 }), r("2", "B", "2026-11-03", { luciano: 3 }), r("3", "C", "2026-11-03", { luciano: 3 }), r("4", "A", "2026-11-04", { marco: 8 })], "e:luciano");
    expect(g).toHaveLength(1);
    expect(g[0].totale).toBe(8);
    expect(g[0].cantieri.map((c) => c.ore)).toEqual([3, 3, 2]);
  });
  it("due rapportini sullo stesso cantiere non fanno due voci", () => {
    const g = giornatePersona([r("1", "A", "2026-11-03", { luciano: 2 }), r("2", "A", "2026-11-03", { luciano: 1.5 })], "e:luciano");
    expect(g[0].cantieri).toHaveLength(1);
    expect(g[0].cantieri[0].ore).toBe(3.5);
  });
  it("dal giorno più recente", () => {
    const g = giornatePersona([r("1", "A", "2026-11-03", { l: 2 }), r("2", "A", "2026-11-05", { l: 2 })], "e:l");
    expect(g.map((x) => x.giorno)).toEqual(["2026-11-05", "2026-11-03"]);
  });
});

describe("controllo della giornata", () => {
  it("legge le ore come le scrive l'ufficio", () => {
    expect(oreScritte("2,5")).toBe(2.5);
    expect(oreScritte("8")).toBe(8);
    for (const no of ["", "0", "25", "abc", "1.234", "-1"]) expect(oreScritte(no)).toBeNull();
  });
  it("giornata normale dalle ore settimanali, 8 se non si sa", () => {
    expect(orarioNormale(40)).toBe(8);
    expect(orarioNormale(20)).toBe(4);
    expect(orarioNormale(null)).toBe(8);
    expect(orarioNormale(0)).toBe(8);
  });
  it("nessun avviso su una giornata che torna", () => {
    expect(controlloGiornata({ totale: 8, normale: 8, timbrate: 8 })).toEqual({ oltre24: false, avvisi: [] });
    expect(controlloGiornata({ totale: 8, normale: 8, timbrate: null }).avvisi).toEqual([]);
    expect(controlloGiornata({ totale: 8, normale: 8, timbrate: 7.75 }).avvisi).toEqual([]);
  });
  it("avvisa oltre l'orario e se le timbrature non tornano, senza bloccare", () => {
    const c = controlloGiornata({ totale: 10, normale: 8, timbrate: 6 });
    expect(c.oltre24).toBe(false);
    expect(c.avvisi).toEqual(["2 h oltre la giornata normale di 8 h.", "Ha timbrato 6 h, qui sono 10 h."]);
  });
  it("blocca oltre le 24 ore", () => {
    expect(controlloGiornata({ totale: 25, normale: 8, timbrate: null }).oltre24).toBe(true);
  });
});
