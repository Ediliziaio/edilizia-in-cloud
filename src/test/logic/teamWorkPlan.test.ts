import {expect, it} from "vitest";
import {assignmentName, generalCrewsForPhase, teamWorkPlan} from "@/lib/orders/teamWorkPlan";
import {assignment, phase} from "../fixtures/workPlanning";
import type {SquadraInCommessa} from "@/hooks/useOperai";
const crew = (phase_id: string | null): SquadraInCommessa => ({squadra_id: "s", nome: "Muratori", colore: null, attiva: true, phase_id, fase: null, segue_fase: !!phase_id, dal: null, al: null, capocantiere: false, finita: false, responsabile: null, componenti: []});
it("la squadra generale viene indicata su più fasi senza copiare costi né righe", () => {
  const c = crew(null); const before = JSON.stringify(c);
  expect(generalCrewsForPhase(phase(), [c, c])).toHaveLength(1);
  expect(generalCrewsForPhase(phase({id: "p2"}), [c])).toHaveLength(1);
  expect(JSON.stringify(c)).toBe(before);
});
it("rispetta periodi, squadre inattive e assegnazioni specifiche", () => {
  const p = phase({start_date: "2026-10-10", end_date: "2026-10-20"});
  expect(generalCrewsForPhase(p, [{...crew(null), dal: "2026-10-21"}])).toHaveLength(0);
  expect(generalCrewsForPhase(p, [{...crew(null), al: "2026-10-09"}])).toHaveLength(0);
  expect(generalCrewsForPhase(p, [{...crew(null), attiva: false}, crew("p1")])).toHaveLength(0);
  expect(generalCrewsForPhase(p, [{...crew(null), dal: "2026-10-20"}])).toHaveLength(1);
});
it("lo storico resta leggibile sul suo periodo, non come squadra attuale senza date", () => {
  const c = {...crew(null), finita: true, dal: "2025-03-01", al: "2025-04-01"};
  expect(generalCrewsForPhase(phase({start_date: "2025-03-15", end_date: "2025-03-20"}), [c])).toHaveLength(1);
  expect(generalCrewsForPhase(phase({start_date: null, end_date: null}), [c])).toHaveLength(0);
});
it("date impossibili o invertite non inventano eredità", () => {
  expect(generalCrewsForPhase(phase(), [{...crew(null), dal: "2026-02-31"}])).toHaveLength(0);
  expect(generalCrewsForPhase(phase(), [{...crew(null), dal: "2026-10-20", al: "2026-10-10"}])).toHaveLength(0);
});
it("separa risorse generali da quelle delle lavorazioni", () => {
  const result = teamWorkPlan([phase()], [assignment({id: "general"})], [], []);
  expect(result[0].assignments.map(a => a.id)).toEqual(["general"]);
  expect(result[1].assignments[0].phase_id).toBe("p1");
});
it("deduplica la stessa riga di lettura, non due prestazioni dello stesso dipendente", () => {
  const p = phase(), a = p.assignments[0];
  const result = teamWorkPlan([p, phase({id: "p2", assignments: [assignment({id: "a2", phase_id: "p2"})]})], [], [], [], [a, a]);
  expect(result[1].assignments).toHaveLength(1); expect(result[2].assignments).toHaveLength(1);
  expect(result[1].assignments[0].cost_consuntivo).toBe(120);
});
it("non collide tra riga dipendente e riga ditta con lo stesso id", () => {
  const result = teamWorkPlan([], [assignment(), assignment({source: "team", executor_type: "esterno"})], [], []);
  expect(result[0].assignments).toHaveLength(2);
});
it("mantiene assegnazioni storiche o orfane visibili invece di perderle", () => {
  const result = teamWorkPlan([], [], [], [], [assignment({phase_id: "fase-rimossa"})]);
  expect(result[1]).toMatchObject({id: "fase-rimossa"}); expect(result[1].assignments).toHaveLength(1);
});
it("una squadra presente su più fasi resta visibile su ciascuna", () => {
  const result = teamWorkPlan([phase(), phase({id: "p2", assignments: []})], [], [crew("p1"), crew("p2"), crew("p1")], []);
  expect(result[1].crews).toHaveLength(1); expect(result[2].crews).toHaveLength(1);
});
it("collega i mezzi della persona a ogni lavorazione senza confonderli coi mezzi fisicamente presenti", () => {
  const result = teamWorkPlan([phase(), phase({id: "p2", assignments: []})], [], [], [{id: "m", nome: "Ducato", tipo: "furgone", targa: null, persona: "Mario", fasi: ["p1", "p2", "p1"], a_bordo: ["Laser"], altrove: "ORD-ALTRO"}]);
  expect(result[0].equipment).toHaveLength(0); expect(result[1].equipment).toHaveLength(1); expect(result[2].equipment).toHaveLength(1);
  expect(result[1].equipment[0].altrove).toBe("ORD-ALTRO");
});
it("risolve il nome storico senza rendere il dipendente inattivo selezionabile", () => {
  expect(assignmentName(assignment({executor_label: "Mario Storico", executor_inactive: true}), [], [])).toBe("Mario Storico");
  expect(assignmentName(assignment(), [], [])).toBe("Dipendente non disponibile");
});
