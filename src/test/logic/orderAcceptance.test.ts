import { describe, it, expect } from "vitest";
import {
  emptyAcceptance,
  validateAcceptance,
  acceptanceDaModello,
  firmaInByte,
  validaFirma,
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

describe("firma del cliente sul verbale", () => {
  const PNG = "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3));
  const fonte = () => readFileSync("supabase/functions/collaudo-commessa/index.ts", "utf8").replace(/\s+/g, "").replaceAll('"', "'");
  const azioneFirma = () => { const c = fonte(); return c.slice(c.indexOf("body.action==='sign'")); };

  it("accetta una firma PNG con il nome", () => {
    expect(validaFirma({ immagine: PNG, nome: "Mario Rossi" })).toEqual([]);
    expect(firmaInByte(PNG)?.[0]).toBe(0x89);
  });
  it("rifiuta nome vuoto, firma che non è un PNG, firma troppo grande", () => {
    expect(validaFirma({ immagine: PNG, nome: "  " }).length).toBeGreaterThan(0);
    expect(validaFirma({ immagine: "data:image/png;base64," + btoa("non è un png"), nome: "M" }).length).toBeGreaterThan(0);
    expect(validaFirma({ immagine: "data:image/jpeg;base64,AAAA", nome: "M" }).length).toBeGreaterThan(0);
    expect(validaFirma({ immagine: "data:image/png;base64," + "A".repeat(700_000), nome: "M" }).length).toBeGreaterThan(0);
    expect(validaFirma(undefined).length).toBeGreaterThan(0);
    expect(validaFirma({ immagine: PNG, nome: "x".repeat(201) }).length).toBeGreaterThan(0);
  });
  it("l'azione è tra quelle ammesse e congela con versione e stato", () => {
    expect(fonte()).toContain("'sign'");
    const c = azioneFirma();
    expect(c).toContain("validaFirma(body.firma)");
    // Anteprima controllata e documento uguale: gli stessi controlli della chiusura, prima di firmare.
    const tutto = fonte();
    expect(tutto.indexOf("body.reviewed!==true")).toBeGreaterThan(-1);
    expect(tutto.indexOf("body.document_hash!==report.document_hash")).toBeLessThan(tutto.indexOf("body.action==='sign'"));
    expect(c).toContain("status:'finalized'");
    expect(c).toContain(".eq('version',body.version)");
    expect(c).toContain(".eq('status','draft')");
  });
  it("salva chi ha firmato e chi ha raccolto la firma", () => {
    const c = azioneFirma();
    for (const x of ["firma_cliente_path", "firma_cliente_nome", "firma_cliente_at", "firma_raccolta_da:userId"]) expect(c).toContain(x);
  });
  it("se un altro è arrivato prima toglie i file appena caricati", () => {
    const c = azioneFirma();
    expect(c).toMatch(/if\(error\|\|!data\)\{awaitadmin\.storage\.from\(bucket\)\.remove\(\[/);
  });
  it("la migrazione aggiunge le colonne della firma", () => {
    const sql = readFileSync("supabase/migrations/20281107120000_verbale_firma_cliente.sql", "utf8");
    for (const x of ["firma_cliente_path text", "firma_cliente_nome text", "firma_cliente_at timestamptz", "firma_raccolta_da uuid"]) expect(sql).toContain(x);
  });
});

