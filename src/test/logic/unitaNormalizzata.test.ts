import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizzaUnita, SINONIMI_UNITA, unitaCompatibili } from "@/lib/prezzario/confronto";
import { variantiPerSquadre, varianteDellaSquadra } from "@/lib/orders/costoDitta";
import { assignmentCompanyOptions } from "@/lib/orders/assignmentCompanies";

/**
 * Subappalto dal computo, lotto 1 (10/11/2026): le unità si normalizzano uguali nel codice e nel
 * database, e il prezzo della ditta scritto sull'anagrafica vale per la sua squadra.
 */
const MIGRAZIONE = resolve(__dirname, "../../../supabase/migrations/20290213100000_listino_ditta_anagrafica_unita.sql");

function sinonimiDelDatabase(): Record<string, string> {
  const sql = readFileSync(MIGRAZIONE, "utf8");
  const blocco = sql.split("-- SINONIMI_INIZIO")[1]?.split("-- SINONIMI_FINE")[0] ?? "";
  const json = blocco.trim().replace(/^'/, "").replace(/'$/, "");
  return JSON.parse(json);
}

describe("unità di misura: codice e database con la stessa tabella", () => {
  it("i sinonimi della migrazione sono quelli del codice, nello stesso ordine", () => {
    expect(sinonimiDelDatabase()).toEqual(SINONIMI_UNITA);
    expect(Object.keys(sinonimiDelDatabase())).toEqual(Object.keys(SINONIMI_UNITA));
  });

  it("le grafie trovate nelle voci delle commesse il 10/11/2026", () => {
    const attese: Array<[string, string]> = [
      ["m2", "m2"], ["mq", "m2"], ["MQ", "m2"], ["m²", "m2"],
      ["m3", "m3"], ["mc", "m3"],
      ["m", "m"], ["ml", "m"],
      ["cad", "cad"], ["cad.", "cad"], ["n.", "cad"], ["pz", "cad"],
      ["a corpo", "a corpo"], ["a.c.", "a corpo"], ["corpo", "a corpo"], ["fisso", "a corpo"],
      ["ora", "h"], ["ore", "h"], ["h", "h"],
      ["mese", "mese"], ["mesi", "mese"],
      ["kg", "kg"], ["t", "t"], ["T", "t"], ["paio", "paio"],
      ["km", "km"], ["piano", "piano"],
    ];
    for (const [grezza, normale] of attese) expect(normalizzaUnita(grezza), grezza).toBe(normale);
  });

  it("«mq x cm» non è un metro quadro, e un'unità vuota non combacia con niente", () => {
    expect(unitaCompatibili("mq x cm", "mq")).toBe(false);
    expect(unitaCompatibili(null, "mq")).toBe(false);
    expect(unitaCompatibili("m²", "MQ")).toBe(true);
    expect(unitaCompatibili("cad.", "pz")).toBe(true);
    expect(unitaCompatibili("mq", "ml")).toBe(false);
  });
});

describe("prezzo della ditta sull'anagrafica", () => {
  const base = { costo: 14, is_default: false, attivo: true, sort_order: 0 };

  it("un prezzo scritto sull'anagrafica vale per la squadra di quella ditta", () => {
    const varianti = variantiPerSquadre(
      [{ ...base, tariffa_id: "intonaco", external_team_id: null, subappaltatore_id: "rossi" }],
      [{ id: "squadra-rossi", subappaltatore_id: "rossi" }, { id: "squadra-bianchi", subappaltatore_id: "bianchi" }],
    );
    expect(varianteDellaSquadra(varianti, "intonaco", "squadra-rossi")?.costo).toBe(14);
    expect(varianteDellaSquadra(varianti, "intonaco", "squadra-bianchi")).toBeNull();
  });

  it("il prezzo scritto proprio sulla squadra vince su quello dell'anagrafica", () => {
    const varianti = variantiPerSquadre(
      [
        { ...base, tariffa_id: "intonaco", external_team_id: null, subappaltatore_id: "rossi", costo: 14 },
        { ...base, tariffa_id: "intonaco", external_team_id: "squadra-rossi", subappaltatore_id: "rossi", costo: 13 },
      ],
      [{ id: "squadra-rossi", subappaltatore_id: "rossi" }],
    );
    expect(varianti.filter((v) => v.external_team_id === "squadra-rossi")).toHaveLength(1);
    expect(varianteDellaSquadra(varianti, "intonaco", "squadra-rossi")?.costo).toBe(13);
  });

  it("le righe di oggi, legate alla sola squadra, restano come sono", () => {
    const righe = [{ ...base, tariffa_id: "posa", external_team_id: "vais", subappaltatore_id: null as string | null }];
    expect(variantiPerSquadre(righe, [{ id: "vais", subappaltatore_id: null }])).toEqual(righe);
  });

  it("la ditta senza squadra, scelta nella finestra «Aggiungi manodopera», trova il suo prezzo", () => {
    const opzioni = assignmentCompanyOptions(
      "az",
      [{ id: "squadra-rossi", company_id: "az", name: "Rossi", kind: "esterna", is_active: true, subappaltatore_id: "rossi" }],
      [
        { id: "rossi", company_id: "az", ragione_sociale: "Rossi srl", is_active: true },
        { id: "verdi", company_id: "az", ragione_sociale: "Verdi srl", is_active: true },
      ],
    );
    expect(opzioni.find((o) => o.id === "squadra-rossi")?.anagraficaId).toBe("rossi");
    expect(opzioni.find((o) => o.id === "squadra-rossi")?.subappaltatoreId).toBeUndefined();
    const varianti = variantiPerSquadre(
      [{ ...base, tariffa_id: "intonaco", external_team_id: null, subappaltatore_id: "verdi", costo: 15.5 }],
      opzioni.map((o) => ({ id: o.id, subappaltatore_id: o.anagraficaId ?? null })),
    );
    expect(varianteDellaSquadra(varianti, "intonaco", "subappaltatore:verdi")?.costo).toBe(15.5);
  });
});
