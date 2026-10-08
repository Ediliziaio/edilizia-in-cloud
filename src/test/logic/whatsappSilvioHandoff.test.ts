import { describe, expect, it } from "vitest";
import { handoffAccepted, orchestratorCounts } from "../../../supabase/functions/_shared/silvioHandoff";

describe("WhatsApp→Silvio handoff must have a known outcome", () => {
  it.each([null, {}, { ok: true }, { ok: true, inviati: 1, in_coda: -1 }, { ok: true, inviati: 0, in_coda: 0, errori: 1 }])("blocks uncertain orchestrator result %j", value => {
    expect(() => orchestratorCounts(value)).toThrow("silvio_handoff_not_confirmed");
  });
  it("distinguishes an explicitly rejected plan from an empty response", () => {
    expect(orchestratorCounts({ ok: false, motivo: "nessun_piano" })).toEqual({ ok: false, inviati: 0, inCoda: 0 });
  });
  it.each([null, {}, { ok: false, azione: "errore" }, { ok: true, azione: "in_coda" }, { ok: true, azione: "unexpected" }])("does not fall back to another AI on %j", value => {
    expect(() => handoffAccepted(value)).toThrow("silvio_handoff_not_confirmed");
  });
  it.each(["verifica_identita", "riformula", "ignora"])("allows explicit no-handoff result %s", azione => {
    expect(handoffAccepted({ ok: true, azione })).toBe(false);
  });
  it("recognizes a queue acceptance, not just the HTTP success", () => {
    expect(handoffAccepted({ ok: true, azione: "in_coda", dettaglio: { inviati: 0, in_coda: 1 } })).toBe(true);
    expect(handoffAccepted({ ok: true, azione: "fatto", dettaglio: { inviati: 0, in_coda: 0 } })).toBe(false);
  });
});
