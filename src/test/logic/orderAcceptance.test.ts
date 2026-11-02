import { describe, it, expect } from "vitest";
import {
  emptyAcceptance,
  validateAcceptance,
  acceptanceDaModello,
} from "../../../supabase/functions/collaudo-commessa/model";
import { SCHEMA_COME_OGGI, type ModuloSchema } from "../../../supabase/functions/_shared/moduliCantiere";
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

describe("verbale da modello", () => {
  const campo = { chiave: "pz", etichetta: "Pezzi controllati", tipo: "number", obbligatorio: true, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "cliente" } as const;
  const modello = { formato: 1, blocchi: SCHEMA_COME_OGGI.blocchi, titolo: "Collaudo serramenti", voci: ["Vetri integri", "Maniglie"], campi: [campo, { ...campo, chiave: "vecchio", archiviato: true }] } as ModuloSchema;
  const completo = () => ({ ...acceptanceDaModello("2026-11-02", modello), scope: "Piano primo", inspector: "Referente", customer: "Cliente", outcome: "positive" as const, documents: "Consegnati",
    checks: [{ label: "Vetri integri", result: "ok" as const, note: "" }] });

  it("senza modello è identico a oggi", () => {
    expect(acceptanceDaModello("2026-11-02", null)).toEqual(emptyAcceptance("2026-11-02"));
  });
  it("titolo, voci e campi vengono dal modello e ogni voce parte da verificare", () => {
    const c = acceptanceDaModello("2026-11-02", modello);
    expect(c.title).toBe("Collaudo serramenti");
    expect(c.checks).toEqual([{ label: "Vetri integri", result: "pending", note: "" }, { label: "Maniglie", result: "pending", note: "" }]);
    expect(c.campi?.map(x => x.chiave)).toEqual(["pz"]);
    expect(c.valori).toEqual([]);
  });
  it("un modello senza voci parte dalle 4 di oggi", () => {
    expect(acceptanceDaModello("2026-11-02", { ...modello, voci: [] }).checks).toEqual(emptyAcceptance("2026-11-02").checks);
  });
  it("il verbale tiene la sua copia del modello", () => {
    const m = structuredClone(modello);
    const c = acceptanceDaModello("2026-11-02", m);
    m.campi[0].etichetta = "Cambiato dopo"; m.voci![0] = "Cambiata dopo";
    expect(c.campi![0].etichetta).toBe("Pezzi controllati");
    expect(c.checks[0].label).toBe("Vetri integri");
  });
  it("un verbale di prima, senza campi, resta valido", () => {
    const vecchio = { ...emptyAcceptance("2026-11-02") };
    expect(validateAcceptance(vecchio)).toEqual([]);
    expect(vecchio).not.toHaveProperty("campi");
  });
  it("rifiuta valori e campi fuori formato", () => {
    expect(validateAcceptance({ ...emptyAcceptance("2026-11-02"), valori: "x" }).length).toBeGreaterThan(0);
    expect(validateAcceptance({ ...emptyAcceptance("2026-11-02"), campi: 3 }).length).toBeGreaterThan(0);
    expect(validateAcceptance({ ...emptyAcceptance("2026-11-02"), valori: [{ chiave: "x" }] }).length).toBeGreaterThan(0);
  });
  it("la chiusura è rifiutata con gli obbligatori vuoti, e dice quali", () => {
    expect(validateAcceptance(completo(), true)).toContain("Compila: Pezzi controllati");
    const pieno = { ...completo(), valori: [{ chiave: "pz", etichetta: "Pezzi controllati", tipo: "number" as const, valore: 4, stampa: "cliente" as const }] };
    expect(validateAcceptance(pieno, true)).toEqual([]);
  });
  it("salvare una bozza con un obbligatorio vuoto è permesso", () => {
    expect(validateAcceptance(acceptanceDaModello("2026-11-02", modello))).toEqual([]);
  });
});
