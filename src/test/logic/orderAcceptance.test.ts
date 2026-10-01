import { describe, it, expect } from "vitest";
import {
  emptyAcceptance,
  validateAcceptance,
} from "../../../supabase/functions/collaudo-commessa/model";
import { readFileSync } from "node:fs";
const valid = () => ({
  ...emptyAcceptance("2026-09-30"),
  scope: "Finiture soggiorno",
  inspector: "Referente DEMO",
  customer: "Cliente DEMO",
  outcome: "positive" as const,
  documents: "Istruzioni prodotti consegnate",
  checks: [
    {
      label: "Finiture",
      result: "ok" as const,
      note: "Controllo visivo eseguito",
    },
  ],
});
describe("Verbale di verifica e consegna", () => {
  it("parte senza controlli o accettazioni presunte", () => {
    const v = emptyAcceptance("2026-09-30");
    expect(v.checks.every((c) => c.result === "pending")).toBe(true);
    expect(validateAcceptance(v)).toEqual([]);
    expect(validateAcceptance(v, true).length).toBeGreaterThan(0);
  });
  it("accetta un verbale completo senza riserve", () =>
    expect(validateAcceptance(valid(), true)).toEqual([]));
  it.each([null, [], { title: 42 }, "test"])(
    "rifiuta input malformato %j",
    (v) => expect(validateAcceptance(v).length).toBeGreaterThan(0),
  );
  it.each(["2026-02-30", "30/09/2026", "no"])("rifiuta data %s", (date) =>
    expect(validateAcceptance({ ...valid(), date }).length).toBeGreaterThan(0),
  );
  it("richiede motivo per non applicabile e almeno un controllo reale", () =>
    expect(
      validateAcceptance(
        { ...valid(), checks: [{ label: "Impianti", result: "na", note: "" }] },
        true,
      ).length,
    ).toBeGreaterThan(0));
  it("non congela esito positivo con riserve", () =>
    expect(
      validateAcceptance(
        { ...valid(), reservations: "Fuga da ripristinare" },
        true,
      ).join(),
    ).toContain("esito coerente"));
  it("richiede attività, responsabile e data con riserve", () =>
    expect(
      validateAcceptance(
        {
          ...valid(),
          outcome: "reserves",
          reservations: "Fuga da ripristinare",
          actions: [{ work: "Ripristino", owner: "", due: "" }],
        },
        true,
      ).join(),
    ).toContain("responsabile"));
  it("rifiuta scadenza prima della verifica", () =>
    expect(
      validateAcceptance(
        {
          ...valid(),
          outcome: "negative",
          reservations: "Prova da ripetere",
          actions: [
            { work: "Ripetere prova", owner: "Demo", due: "2026-09-01" },
          ],
        },
        true,
      ).join(),
    ).toContain("scadenza"));
  it("accetta riserve concrete con azione e responsabile", () =>
    expect(
      validateAcceptance(
        {
          ...valid(),
          outcome: "reserves",
          reservations: "Fuga",
          actions: [
            { work: "Ripristino fuga", owner: "Demo", due: "2026-10-02" },
          ],
        },
        true,
      ),
    ).toEqual([]));
  it("esito negativo non viene trasformato in accettazione", () =>
    expect(
      validateAcceptance(
        {
          ...valid(),
          outcome: "negative",
          reservations: "Verifica non superata",
          actions: [
            {
              work: "Ripristino e nuova verifica",
              owner: "Demo",
              due: "2026-10-02",
            },
          ],
        },
        true,
      ),
    ).toEqual([]));
  it("limita dimensioni e cardinalità", () => {
    expect(
      validateAcceptance({ ...valid(), notes: "a".repeat(4001) }).length,
    ).toBeGreaterThan(0);
    expect(
      validateAcceptance({
        ...valid(),
        checks: Array(31).fill(valid().checks[0]),
      }).length,
    ).toBeGreaterThan(0);
  });
  it("endpoint usa permessi caller, versione e hash; non invia richieste firma", () => {
    const code = readFileSync(
      "supabase/functions/collaudo-commessa/index.ts",
      "utf8",
    ).replace(/\s+/g, "").replaceAll('"', "'");
    expect(code).toContain("caller.from('orders')");
    expect(code).toContain("caller.rpc('has_permission_for_company'");
    expect(code).toContain(".eq('version',body.version)");
    expect(code).toContain(
      "(awaitsha(awaitfile.arrayBuffer()))!==report.document_hash",
    );
    expect(code).not.toContain("signature_requests");
    expect(code).not.toContain("sendEmail");
  });
});
