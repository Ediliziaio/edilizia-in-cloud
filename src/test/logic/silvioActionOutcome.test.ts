import { describe, expect, it } from "vitest";
import { readSilvioActionOutcome } from "@/lib/silvio/actionOutcome";

describe("action result classification", () => {
  it.each([400, 401, 403, 404, 410, 422])("reports explicit HTTP %s rejection without invented execution", async status => {
    expect(await readSilvioActionOutcome(null, { context: { status, json: async () => ({ error: "Not allowed" }) } }))
      .toEqual({ kind: "rejected", message: "Not allowed" });
  });
  it.each([408, 409, 429, 500, 502, 503, 504])("HTTP %s is ambiguous, not a safe retry", async status => {
    expect(await readSilvioActionOutcome(null, { context: { status } })).toMatchObject({ kind: "review" });
  });
  it("an unreadable rejection body retains the safe rejection fallback", async () => {
    expect(await readSilvioActionOutcome(null, { context: { status: 403, json: async () => { throw new Error("HTML error page"); } } }))
      .toMatchObject({ kind: "rejected", message: expect.stringContaining("permessi") });
  });
  it("needs_review takes precedence over an inconsistent ok flag", async () => {
    expect(await readSilvioActionOutcome({ ok: true, needs_review: true })).toMatchObject({ kind: "review" });
  });
  it("successful execution with a failed acknowledgement cannot be retried", async () => {
    expect(await readSilvioActionOutcome({ ok: false, execution_succeeded: true })).toMatchObject({ kind: "review" });
  });
  it("explicit business rejection is not success", async () => {
    expect(await readSilvioActionOutcome({ ok: false, message: "Dato mancante" })).toEqual({ kind: "rejected", message: "Dato mancante" });
  });
});
