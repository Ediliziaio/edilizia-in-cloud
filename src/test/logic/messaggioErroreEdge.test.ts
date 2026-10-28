/**
 * `String(e)` su un errore di PostgREST dà «[object Object]»: il 28/10/2026
 * silvio-memory-extract ha scritto 49 righe così e la causa — «Actor
 * unavailable», 42501, su 47 utenti bloccati — non si leggeva da nessuna parte.
 */
import { describe, expect, it } from "vitest";
import { messaggioErrore } from "../../../supabase/functions/_shared/messaggioErrore";

describe("messaggioErrore", () => {
  it("l'errore di PostgREST non è più [object Object]", () => {
    const errorePostgrest = { message: "Actor unavailable", code: "42501", details: null, hint: null };
    expect(String(errorePostgrest)).toBe("[object Object]"); // il comportamento di prima
    expect(messaggioErrore(errorePostgrest)).toBe("[42501] Actor unavailable");
  });

  it("un Error resta il suo messaggio, senza decorazioni", () => {
    expect(messaggioErrore(new Error("Batch memoria vuoto dopo claim"))).toBe("Batch memoria vuoto dopo claim");
  });

  it("unisce i pezzi che l'errore porta", () => {
    expect(messaggioErrore({ message: "violazione", details: "riga duplicata", hint: "usa upsert" }))
      .toBe("violazione — riga duplicata — usa upsert");
  });

  it("un oggetto senza messaggio diventa il suo JSON, non [object Object]", () => {
    expect(messaggioErrore({ status: 502, body: "bad gateway" })).toBe('{"status":502,"body":"bad gateway"}');
  });

  it("stringhe, null e undefined restano leggibili", () => {
    expect(messaggioErrore("timeout")).toBe("timeout");
    expect(messaggioErrore(null)).toBe("null");
    expect(messaggioErrore(undefined)).toBe("undefined");
  });

  it("i riferimenti circolari non fanno lanciare il logger", () => {
    const circolare: Record<string, unknown> = { code: 500 };
    circolare.self = circolare;
    expect(() => messaggioErrore(circolare)).not.toThrow();
    expect(messaggioErrore(circolare)).toBe("[500]");
  });
});
