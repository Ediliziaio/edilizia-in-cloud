import { describe, it, expect } from "vitest";
import {
  risolviAddettiPropriPos,
  cambiaNominativoFormazione,
} from "../../../supabase/functions/_shared/posAddetti";
import {
  normalizzaPos,
  posVuoto,
} from "../../../supabase/functions/_shared/posModello";
const e = {
  id: "e1",
  first_name: "TEST",
  last_name: "Omonimo",
  user_id: "u1",
  role_type: "operaio",
};
const h = {
  id: "h1",
  employee_id: "e1",
  user_id: "u1",
  nome: "TEST",
  cognome: "Omonimo",
};
describe("Identità degli addetti nel POS della propria impresa", () => {
  it("unisce solo riferimenti della stessa persona e non omonimi", () => {
    const r = risolviAddettiPropriPos(
      [e, { ...e, id: "e2", user_id: "u2" }],
      [{ user_id: "u1", role_type: "employee" }],
      [h, { ...h, id: "h2", employee_id: "e2", user_id: "u2" }],
    );
    expect(r.persone.map((p) => p.hrId)).toEqual(["h1", "h2"]);
  });
  it("non sceglie il primo attestato di un collegamento HR ambiguo", () => {
    const r = risolviAddettiPropriPos(
      [e],
      [{ user_id: "u1", role_type: "employee" }],
      [h, { ...h, id: "h2" }],
    );
    expect(r.persone).toHaveLength(1);
    expect(r.persone[0].hrId).toBeNull();
    expect(r.avvisi.join(" ")).toContain("ambiguo");
  });
  it("esclude le anagrafiche esterne legacy anche se hanno un profilo HR", () => {
    const r = risolviAddettiPropriPos(
      [{ ...e, role_type: "subappaltatore" }],
      [{ user_id: "u1", role_type: "subcontractor" }],
      [h],
    );
    expect(r.persone).toEqual([]);
    expect(r.avvisi.join(" ")).toContain("legacy");
  });
  it("non attribuisce un nome o un attestato a un accesso Campo senza anagrafica aziendale", () => {
    const r = risolviAddettiPropriPos(
      [],
      [{ user_id: "altro", role_type: "employee" }],
      [],
    );
    expect(r.persone).toEqual([]);
    expect(r.avvisi.join(" ")).toContain("da collegare");
  });
  it("usa il collegamento HR diretto prima del fallback per utente non collegato", () => {
    expect(
      risolviAddettiPropriPos(
        [e],
        [],
        [h, { ...h, id: "h2", employee_id: null }],
      ).persone[0].hrId,
    ).toBe("h1");
  });
  it("normalizza soltanto l’identità HR e non eredita prove o dati privati aggiunti dal client", () => {
    const p = posVuoto();
    p.formazione = [
      {
        nominativo: "TEST",
        qualifica: "TEST",
        base: false,
        rischi_specifici: false,
        rischi_cantiere: false,
        dpi_terza_categoria: false,
        altro: "",
        attestati: "",
        riferimento_addetto: { tipo: "hr", id: "h1" },
      },
    ];
    const raw = structuredClone(p) as unknown as Record<string, unknown>;
    (raw.formazione as Record<string, unknown>[])[0].riferimento_addetto = {
      tipo: "hr",
      id: "h1",
      file_path: "privato",
      confermata: true,
    };
    expect(normalizzaPos(raw).formazione[0].riferimento_addetto).toEqual({
      tipo: "hr",
      id: "h1",
    });
    (raw.formazione as Record<string, unknown>[])[0].riferimento_addetto = {
      tipo: "esterno",
      id: "h1",
    };
    expect(
      normalizzaPos(raw).formazione[0].riferimento_addetto,
    ).toBeUndefined();
  });
});

it("cambiare il nominativo rimuove identità, attestati e conferme della persona precedente", () => {
  const r = {
    nominativo: "TEST precedente",
    qualifica: "Operaio",
    riferimento_addetto: { tipo: "hr" as const, id: "h1" },
    base: true,
    rischi_specifici: true,
    rischi_cantiere: true,
    dpi_terza_categoria: true,
    altro: "TEST PLE",
    attestati: "TEST originale",
    verificata: true,
  };
  const nuovo = cambiaNominativoFormazione(r, "TEST nuova persona");
  expect(nuovo).toMatchObject({
    nominativo: "TEST nuova persona",
    attestati: "",
    altro: "",
    base: false,
    rischi_specifici: false,
    rischi_cantiere: false,
    dpi_terza_categoria: false,
    verificata: false,
  });
  expect(nuovo.riferimento_addetto).toBeUndefined();
  expect(r.riferimento_addetto.id).toBe("h1");
});
