import { describe, expect, it, vi, beforeEach } from "vitest";
const fake = vi.hoisted(() => ({
  risposte: [] as Array<{ data: unknown; error: unknown }>,
  chiamate: [] as Array<{ tabella: string; azione: string; valore: unknown }>,
  scritture: [] as Array<{ tabella: string; campi: unknown }>,
  rpc: [] as Array<{ nome: string; argomenti: unknown }>,
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    rpc: async (nome: string, argomenti: unknown) => {
      fake.rpc.push({ nome, argomenti });
      return { data: { stato: "aggiornata", righe_prezzate: 1 }, error: null as unknown };
    },
    from: (tabella: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is"])
        c[m] = (...valore: unknown[]) => {
          fake.chiamate.push({ tabella, azione: m, valore });
          return c;
        };
      for (const m of ["update", "insert"])
        c[m] = (campi: unknown) => {
          fake.scritture.push({ tabella, campi });
          return c;
        };
      for (const m of ["single", "maybeSingle"])
        c[m] = async () => fake.risposte.shift();
      c.then = (ok: (v: unknown) => unknown) => ok(fake.risposte.shift());
      return c;
    },
  },
}));
import { messaggioPrezzoBolla, riferimentoDellaBolla, salvaCollegamentoDdt } from "@/lib/fatturazione/collegaDdt";
const args = {
  companyId: "a",
  fatturaId: "f",
  ddtId: "d",
  numero: "N",
  data: "2026-11-11",
};
beforeEach(() => {
  fake.risposte = [];
  fake.chiamate = [];
  fake.scritture = [];
  fake.rpc = [];
});
function prepara(
  esistenti: unknown[] = [],
  ritorno: unknown = { id: "link" },
  supplier = "s",
) {
  fake.risposte.push(
    {
      data: {
        id: "d",
        numero_ddt: "N",
        data_ricezione: "2026-11-11",
        supplier_id: supplier,
      },
      error: null,
    },
    { data: { id: "f", fornitore_id: "s" }, error: null },
    { data: esistenti, error: null },
    { data: ritorno, error: null },
  );
}
describe("collegamento della bolla reale alla fattura", () => {
  it("salva l’ID del DDT e non soltanto numero e data", async () => {
    prepara();
    await salvaCollegamentoDdt(args);
    expect(fake.scritture[0]).toMatchObject({
      tabella: "fattura_ddt",
      campi: {
        ddt_ricezione_id: "d",
        fattura_ricevuta_id: "f",
        company_id: "a",
      },
    });
  });
  it("completa il riferimento XML esistente senza creare un duplicato", async () => {
    prepara([
      {
        id: "xml",
        numero_ddt: "N",
        data_ddt: "2026-11-11",
        ddt_ricezione_id: null,
      },
    ]);
    await salvaCollegamentoDdt(args);
    expect(fake.scritture).toHaveLength(1);
    expect(fake.chiamate).toContainEqual({
      tabella: "fattura_ddt",
      azione: "eq",
      valore: ["id", "xml"],
    });
    expect(fake.chiamate).toContainEqual({
      tabella: "fattura_ddt",
      azione: "is",
      valore: ["ddt_ricezione_id", null],
    });
  });
  it("non sostituisce il collegamento con un altro documento dallo stesso riferimento", async () => {
    prepara([
      {
        id: "xml",
        numero_ddt: "N",
        data_ddt: "2026-11-11",
        ddt_ricezione_id: "altro",
      },
    ]);
    await expect(salvaCollegamentoDdt(args)).rejects.toThrow(/Esiste già/);
    expect(fake.scritture).toHaveLength(0);
  });
  it("non scrive se il DDT è già collegato, anche con numero modificato", async () => {
    prepara([
      {
        id: "xml",
        numero_ddt: "VECCHIO",
        data_ddt: null,
        ddt_ricezione_id: "d",
      },
    ]);
    await expect(salvaCollegamentoDdt(args)).rejects.toThrow(/già collegato/);
  });
  it("rifiuta un fornitore diverso prima di salvare", async () => {
    prepara([], undefined, "altro");
    await expect(salvaCollegamentoDdt(args)).rejects.toThrow(/altro fornitore/);
    expect(fake.scritture).toHaveLength(0);
  });
  it("un update filtrato da RLS non viene dichiarato salvato", async () => {
    prepara(
      [
        {
          id: "xml",
          numero_ddt: "N",
          data_ddt: "2026-11-11",
          ddt_ricezione_id: null,
        },
      ],
      null,
    );
    await expect(salvaCollegamentoDdt(args)).rejects.toThrow(
      /non è stata salvata/,
    );
  });
  it("vincola letture e aggiornamenti all’azienda selezionata", async () => {
    prepara([
      {
        id: "xml",
        numero_ddt: "N",
        data_ddt: "2026-11-11",
        ddt_ricezione_id: null,
      },
    ]);
    await salvaCollegamentoDdt(args);
    expect(
      fake.chiamate.filter(
        (c) =>
          c.azione === "eq" &&
          JSON.stringify(c.valore) === '["company_id","a"]',
      ),
    ).toHaveLength(4);
  });
  it("«4727/05» della bolla completa il «2026-DT05-0004727» della fattura e porta il prezzo (23/11/2026)", async () => {
    fake.risposte.push(
      { data: { id: "d", numero_ddt: "4727/05", data_ricezione: "2026-09-15", supplier_id: "s" }, error: null },
      { data: { id: "f", fornitore_id: "s" }, error: null },
      { data: [
        { id: "x1", numero_ddt: "2026-DT01-0004727", data_ddt: "2026-09-15", ddt_ricezione_id: null },
        { id: "x5", numero_ddt: "2026-DT05-0004727", data_ddt: "2026-09-15", ddt_ricezione_id: null },
      ], error: null },
      { data: { id: "x5" }, error: null },
    );
    const esito = await salvaCollegamentoDdt({ ...args, numero: "4727/05", data: "2026-09-15" });
    // Solo la bolla: numero e data restano quelli scritti in fattura.
    expect(fake.scritture).toEqual([{ tabella: "fattura_ddt", campi: { ddt_ricezione_id: "d" } }]);
    expect(fake.chiamate).toContainEqual({ tabella: "fattura_ddt", azione: "eq", valore: ["id", "x5"] });
    expect(fake.rpc).toEqual([{ nome: "ddt_prezzi_dal_collegamento", argomenti: { p_fattura: "f", p_ddt: "d" } }]);
    expect(messaggioPrezzoBolla(esito.prezzo)).toMatch(/aggiornato dalla fattura/);
  });
});

describe("riferimento della fattura per una bolla", () => {
  const r = (numero_ddt: string, data_ddt: string | null, ddt_ricezione_id: string | null = null) => ({ numero_ddt, data_ddt, ddt_ricezione_id });
  it("stesso numero scritto diverso, data vicina: trovato", () => {
    expect(riferimentoDellaBolla([r("9363", "2026-10-16")], "9.363", "2026-10-17")?.numero_ddt).toBe("9363");
  });
  it("serie diversa o data lontana: nessuno", () => {
    expect(riferimentoDellaBolla([r("2026-DT01-0004727", "2026-09-15")], "4727/05", "2026-09-15")).toBeNull();
    expect(riferimentoDellaBolla([r("2026-DT05-0004727", "2026-11-30")], "4727/05", "2026-09-15")).toBeNull();
  });
  it("un riferimento già collegato non si riprende", () => {
    expect(riferimentoDellaBolla([r("2026-DT05-0004727", "2026-09-15", "altra")], "4727/05", "2026-09-15")).toBeNull();
  });
});
