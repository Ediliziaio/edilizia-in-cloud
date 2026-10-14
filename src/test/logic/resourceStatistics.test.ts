import { describe, expect, it } from "vitest";
import { resourceStatistics } from "@/lib/orders/resourceStatistics";
import { assignment, phase } from "../fixtures/workPlanning";
import type { SquadraInCommessa } from "@/hooks/useOperai";

describe("statistiche risorse: sola lettura, nessun doppio conteggio", () => {
  it("una persona su più fasi compare una volta, con tutte le ore", () => {
    const a = assignment({phase_id: "p1"});
    const b = assignment({id: "a2", phase_id: "p2", hours: 3});
    const s = resourceStatistics([phase(), phase({id: "p2"})], [a, b, a], []);
    expect(s.employees).toBe(1); expect(s.people).toHaveLength(1);
    expect(s.hours).toBe(7); expect(s.actual).toBe(240); expect(s.budget).toBe(400);
    expect(s.people[0].phaseIds).toEqual(["p1", "p2"]); expect(s.coveredPhases).toBe(2);
    expect(s.people[0].cost).toBe(240); expect(s.people[0].averageRate).toBe(34.29);
  });
  it("non confonde id uguali di tabelle diverse e non somma ore esterne agli operai", () => {
    const s = resourceStatistics([], [assignment(), assignment({source: "team", employee_id: null, external_team_id: "t", hours: 20})], []);
    expect(s.people).toHaveLength(2); expect(s.employees).toBe(1); expect(s.companies).toBe(1);
    expect(s.hours).toBe(4); expect(s.actual).toBe(240);
    expect(s.internalActual).toBe(120); expect(s.externalActualGross).toBe(120);
  });
  it("le ore a zero costo segnalano una valorizzazione mancante, una sola volta per persona", () => {
    const s = resourceStatistics([], [assignment({cost_consuntivo: 0}), assignment({id: "b", cost_consuntivo: 0})], []);
    expect(s.unpricedEmployees).toBe(1); expect(s.internalActual).toBe(0);
  });
  it("distingue ore mancanti da zero registrato e preserva lo storico", () => {
    const rows = [assignment({hours: null, executor_inactive: true}), assignment({id: "a2", hours: 0})];
    const before = JSON.stringify(rows);
    const s = resourceStatistics([], rows, []);
    expect(s.hours).toBe(0); expect(s.unknownHours).toBe(1); expect(s.people[0].general).toBe(true);
    expect(s.people[0].averageRate).toBeNull();
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("i membri delle squadre non sono nuovi costi né nuove ore", () => {
    const crew = {squadra_id: "s", phase_id: "p1", componenti: [{id: "e1"}, {id: "e2"}]} as SquadraInCommessa;
    const s = resourceStatistics([phase(), phase({id: "p2"})], [assignment()], [crew, {...crew, phase_id: "p2"}, crew]);
    expect(s.crews).toHaveLength(1); expect(s.hours).toBe(4); expect(s.actual).toBe(120);
    expect(s.coveredPhases).toBe(2);
  });
  it("assegnazioni generali e orfane non inventano fasi coperte", () => {
    const s = resourceStatistics([phase()], [assignment(), assignment({id: "x", phase_id: "deleted"})], []);
    expect(s.coveredPhases).toBe(0); expect(s.people[0].phaseIds).toEqual(["deleted"]);
    expect(s.people[0].general).toBe(true);
  });
  it("commessa vuota: nessuna risorsa o consuntivo inventato", () => {
    expect(resourceStatistics([], [], [])).toMatchObject({employees: 0, companies: 0, hours: 0, actual: 0, coveredPhases: 0, people: [], crews: []});
  });
});
