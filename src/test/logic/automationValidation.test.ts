import { describe, expect, it } from "vitest";
import { actionConfigErrors, conditionConfigErrors, delayConfigErrors, connectionCreatesCycle, graphHasCycle } from "../../../supabase/functions/_shared/automationValidation";

describe("shared builder/runtime validation", () => {
  it.each([
    { item_id: "wait_for_event", timeout_days: 0 },
    { itemId: "wait_for_event", timeout_days: 366 },
    { action_type: "drip_sequenza", num_messaggi: 21 },
    { item_id: "drip_sequenza", intervallo_ore: -1 },
    { item_id: "crea_appuntamento", giorni_da_oggi: -1 },
    { item_id: "crea_appuntamento", orario: "24:01" },
    { item_id: "crea_cantiere", importo: "1.500,20" },
    { item_id: "crea_fattura", importo: -2 },
    { item_id: "chiama_webhook", url: "http://127.0.0.1" },
    { item_id: "chiama_webhook", headers: "[]" },
    { item_id: "chiama_webhook", headers: '{"Authorization":5}' },
  ])("rejects unsafe or invalid action parameters %j", config => {
    expect(actionConfigErrors(config)).not.toEqual([]);
  });
  it.each([
    { item_id: "wait_for_event", timeout_days: 365 },
    { item_id: "drip_sequenza", num_messaggi: 20, intervallo_ore: 0.5 },
    { item_id: "crea_appuntamento", giorni_da_oggi: 0, orario: "9:30" },
    { item_id: "crea_fattura", importo: "12,50" },
    { item_id: "crea_cantiere", importo: "{{commessa.importo}}" },
    { item_id: "chiama_webhook", url: "https://example.com", headers: '{"Content-Type":"application/json"}' },
  ])("preserves valid action configuration %j", config => {
    expect(actionConfigErrors(config)).toEqual([]);
  });
  it("validates the action actually chosen by the worker when legacy IDs conflict", () => {
    expect(actionConfigErrors({ action_type: "wait_for_event", item_id: "send_email", timeout_days: 0 })).not.toEqual([]);
  });
  it.each(["uguale", "diverso", "contiene", "non_contiene", "inizia_con", "finisce_con"])("accepts configured %s", operatore => {
    expect(conditionConfigErrors({ condizioni: [{ campo: "contatto.email", operatore, valore: "@esempio.it" }] })).toEqual([]);
  });
  it.each(["vuoto", "non_vuoto", "da_oggi", "prima_di_oggi"])("unary %s does not need a value", operatore => {
    expect(conditionConfigErrors({ condizioni: [{ campo: "contatto.email", operatore }] })).toEqual([]);
  });
  it.each([{}, { condizioni: [] }, { condizioni: [{}] }, { condizioni: [null] }, { condizioni: [{ campo: "email", operatore: "uguale" }] }])("rejects incomplete conditions %j", cfg => {
    expect(conditionConfigErrors(cfg).length).toBeGreaterThan(0);
  });
  it("preserves valid legacy goals and numeric zero", () => {
    expect(conditionConfigErrors({ variabile: "contatto.score", operatore: "uguale", valore: 0 })).toEqual([]);
  });
  it.each(["24:00", "09:60", "-1:30", "99:99", "", "09:00:00"])("rejects invalid clock %s", delay_orario => {
    expect(delayConfigErrors({ delay_tipo: "fino_a", delay_orario }).length).toBeGreaterThan(0);
  });
  it.each(["00:00", "9:30", "23:59"])("accepts clock %s", delay_orario => {
    expect(delayConfigErrors({ delay_tipo: "fino_a", delay_orario })).toEqual([]);
  });
  it.each([-1, 0, 1.5, "NaN"])("rejects invalid duration %s", delay_durata => {
    expect(delayConfigErrors({ delay_durata }).length).toBeGreaterThan(0);
  });
  it("preserves legacy defaults and zero-hour appointment anchors", () => {
    expect(delayConfigErrors({})).toEqual([]);
    expect(delayConfigErrors({ giorni: 1, ore: 0, minuti: 30 })).toEqual([]);
    expect(delayConfigErrors({ delay_tipo: "prima_appuntamento", delay_ore: 0 })).toEqual([]);
    expect(delayConfigErrors({ giorni: -1 })).not.toEqual([]);
  });
  it("detects multi-node loops without rejecting diamonds or fan-out", () => {
    const edges = [{ source: "a", target: "b" }, { source: "a", target: "c" }, { source: "b", target: "d" }, { source: "c", target: "d" }];
    expect(graphHasCycle(edges)).toBe(false);
    expect(connectionCreatesCycle(edges, "d", "a")).toBe(true);
    expect(connectionCreatesCycle(edges, "d", "e")).toBe(false);
    expect(graphHasCycle([...edges, { source: "d", target: "a" }])).toBe(true);
    expect(connectionCreatesCycle([{ source: "x", target: "x" }], "unrelated", "x")).toBe(false);
  });
});
