import { describe, expect, it } from "vitest";
import { automationNextContext } from "../../../supabase/functions/_shared/automationNextContext";
const id = "11111111-2222-4333-8444-555555555555";
describe("automation step outputs", () => {
  it("carries the exact newly-created appointment to subsequent messages", () => {
    const before = { payload: { id: "trigger-id", email: "customer@example.it" }, _jump_count: 2 };
    const after = automationNextContext(before, { appuntamento_id: id, action: "crea_appuntamento" });
    expect(after.payload.appointment_id).toBe(id);
    expect(after.payload["risultato.appuntamento_id"]).toBe(id);
    expect(after.payload.id).toBe("trigger-id");
    expect(after._jump_count).toBe(2);
    expect(before.payload).not.toHaveProperty("appointment_id");
  });
  it("zero and false outputs survive; stale latest-result variables do not", () => {
    const after = automationNextContext({ payload: { "risultato.old": "old", appointment_id: id } }, { amount: 0, matched: false, config: { secret: "never flatten" } });
    expect(after.payload["risultato.amount"]).toBe(0);
    expect(after.payload["risultato.matched"]).toBe(false);
    expect(after.payload).not.toHaveProperty("risultato.old");
    expect(after.payload).not.toHaveProperty("risultato.config");
    expect(after.payload.appointment_id).toBe(id);
  });
  it("invalid object IDs never become a link to another record", () => {
    expect(automationNextContext({}, { fattura_id: "{{fattura.id}}" }).payload.invoice_id).toBeUndefined();
  });
  it("legacy null context/output cannot break advancement", () => {
    expect(automationNextContext(null as any, null as any)).toEqual({ payload: {}, prev_result: {} });
  });
});
