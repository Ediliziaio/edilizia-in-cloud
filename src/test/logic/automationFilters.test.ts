import { describe, expect, it } from "vitest";
import { evaluateAutomationFilters as evaluate, filterErrors, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";
const now = new Date("2026-09-30T22:30:00Z"); // October 1st in Italy
const check = (operator: string, actual: unknown, value?: unknown, extra = {}) => evaluate({ logic: "AND", conditions: [{ field: "x", operator, value, ...extra }] }, { x: actual }, { now });
describe("Filtri automazioni: contratto editor/motore", () => {
  it.each([
    ["equals", "a", "a", true], ["not_equals", "a", "b", true],
    ["contains", "Milano", "LAN", true], ["not_contains", "Milano", "Roma", true],
    ["starts_with", "Milano", "mi", true], ["ends_with", "Milano", "no", true],
    ["gt", 20, 10, true], ["gte", 0, 0, true], ["lt", 0, 1, true], ["lte", 1, 1, true],
    ["gt", null, -1, false], ["lt", "", 10, false],
    ["is_empty", 0, null, false], ["is_empty", false, null, false], ["is_empty", [], null, true],
    ["is_not_empty", 0, null, true], ["is_assigned", null, null, false], ["is_not_assigned", "", null, true],
    ["is_true", true, null, true], ["is_false", false, null, true], ["is_false", null, null, false],
    ["between", 0, { from: 0, to: 10 }, true], ["between", 10, "0,10", true],
    ["between", "2026-09-15", { from: "2026-09-01", to: "2026-09-30" }, true],
    ["between", "2026-09-30T22:10:00Z", { from: "2026-10-01", to: "2026-10-01" }, true],
    ["on", "2026-09-30T22:10:00Z", "2026-10-01", true],
    ["before", "2026-09-30", "2026-10-01", true], ["after", "2026-10-01", "2026-09-30", true],
    ["today", "2026-10-01", null, true], ["yesterday", "2026-09-30", null, true],
    ["in_last_x_days", "2026-09-29", 2, true], ["in_next_x_days", "2026-10-01", 0, true],
    ["contains", ["dvs ai"], "dvs", false], ["contains", ["a", "b"], ["a", "b"], true],
    ["contains", ["a"], ["a", "b"], false], ["not_contains", ["a"], ["a", "b"], false],
  ])("%s su %j con %j → %s", (op, actual, value, expected) => expect(check(op as string, actual, value)).toBe(expected));
  it.each([
    { operator: "unknown", value: 1 }, { operator: "between", value: { from: 5, to: 1 } },
    { operator: "between", value: { from: "", to: 10 } }, { operator: "contains", value: [] },
    { operator: "on", value: "2026-02-30" }, { operator: "in_next_x_days", value: -1 },
  ])("rifiuta configurazioni invalide anche negate: %j", c => {
    expect(check(c.operator, 3, c.value, { negate: true })).toBe(false);
    expect(filterErrors({ conditions: [{ field: "x", ...c }] }).length).toBeGreaterThan(0);
  });
  it("supporta AND, OR, NOT e gruppi annidati", () => {
    expect(evaluate({ logic: "AND", conditions: [
      { field: "a", operator: "equals", value: 1 },
      { logic: "OR", conditions: [{ field: "b", operator: "is_empty" }, { field: "a", operator: "equals", value: 0, negate: true }] },
    ] }, { a: 1, b: "presente" })).toBe(true);
    expect(evaluate({ logic: "OR", conditions: [{ logic: "AND", conditions: [] }] }, {})).toBe(false);
  });
  it.each([["pipeline", "pipeline_id"], ["stage", "stage_id"], ["calendar", "calendar_id"], ["appointment_date", "date"]])("risolve alias %s", (field, canonical) => {
    expect(evaluate({ conditions: [{ field, operator: "equals", value: "same" }] }, { [canonical]: "same" })).toBe(true);
  });
  it("legge campi personalizzati senza rompere nomi con punti", () => {
    expect(evaluate({ conditions: [{ field: "custom_field.campo.nome", operator: "equals", value: "ok" }] }, { custom_field: { "campo.nome": "ok" } })).toBe(true);
  });
  it("non passa un filtro pipeline se il payload non la contiene", () => {
    expect(matchesAutomationTriggerConfig({ pipeline_id: "p" }, {})).toBe(false);
    expect(matchesAutomationTriggerConfig({ pipeline_id: "p" }, { pipeline_id: "p" })).toBe(true);
  });
});
