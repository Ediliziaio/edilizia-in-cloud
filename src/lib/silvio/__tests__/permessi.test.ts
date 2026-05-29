import { describe, it, expect } from "vitest";
import {
  risolviAutorizzazione, overrideValido, richiedeSempreConferma,
  type AzioneDef,
} from "../permessi";

const base: AzioneDef = {
  autorizzazione: "autonoma",
  categoriaRischio: "interno",
  reversibilita: "reversibile",
  ruoliConsentiti: ["company_admin", "company_staff"],
  attiva: true,
};
const admin = { ruoliUtente: ["company_admin"] };

describe("regola ferrea — denaro/esterno/irreversibile mai autonoma", () => {
  it("denaro forza ≥ conferma anche se default autonoma", () => {
    expect(risolviAutorizzazione({ ...base, categoriaRischio: "denaro" }, admin)).toBe("conferma");
  });
  it("esterno forza ≥ conferma", () => {
    expect(risolviAutorizzazione({ ...base, categoriaRischio: "esterno" }, admin)).toBe("conferma");
  });
  it("irreversibile forza ≥ conferma", () => {
    expect(risolviAutorizzazione({ ...base, reversibilita: "irreversibile" }, admin)).toBe("conferma");
  });
  it("interno+reversibile resta autonoma", () => {
    expect(risolviAutorizzazione(base, admin)).toBe("autonoma");
  });
  it("richiedeSempreConferma", () => {
    expect(richiedeSempreConferma({ categoriaRischio: "denaro", reversibilita: "reversibile" })).toBe(true);
    expect(richiedeSempreConferma({ categoriaRischio: "interno", reversibilita: "irreversibile" })).toBe(true);
    expect(richiedeSempreConferma({ categoriaRischio: "interno", reversibilita: "reversibile" })).toBe(false);
  });
});

describe("override — solo restrittivo", () => {
  it("override conferma su default autonoma → conferma", () => {
    expect(risolviAutorizzazione(base, { ...admin, override: { autorizzazione: "conferma" } })).toBe("conferma");
  });
  it("override NON allarga: autonoma su default conferma resta conferma", () => {
    const a: AzioneDef = { ...base, autorizzazione: "conferma" };
    expect(risolviAutorizzazione(a, { ...admin, override: { autorizzazione: "autonoma" } })).toBe("conferma");
  });
  it("override attiva=false → vietata", () => {
    expect(risolviAutorizzazione(base, { ...admin, override: { attiva: false } })).toBe("vietata");
  });
  it("overrideValido: può restringere, non allargare", () => {
    expect(overrideValido("autonoma", "conferma")).toBe(true);
    expect(overrideValido("conferma", "vietata")).toBe(true);
    expect(overrideValido("conferma", "autonoma")).toBe(false);
    expect(overrideValido("autonoma", "autonoma")).toBe(true);
  });
});

describe("gate per ruolo", () => {
  it("ruolo non consentito → vietata", () => {
    expect(risolviAutorizzazione(base, { ruoliUtente: ["employee"] })).toBe("vietata");
  });
  it("operaio NON vede azione riservata a admin/staff", () => {
    const a: AzioneDef = { ...base, ruoliConsentiti: ["company_admin"] };
    expect(risolviAutorizzazione(a, { ruoliUtente: ["worker"] })).toBe("vietata");
  });
  it("super_admin bypassa il gate ruolo", () => {
    expect(risolviAutorizzazione(base, { ruoliUtente: [], isSuper: true })).toBe("autonoma");
  });
  it("super_admin NON bypassa la regola ferrea (denaro resta conferma)", () => {
    expect(risolviAutorizzazione({ ...base, categoriaRischio: "denaro" }, { ruoliUtente: [], isSuper: true })).toBe("conferma");
  });
});

describe("azione disattivata", () => {
  it("attiva=false → vietata", () => {
    expect(risolviAutorizzazione({ ...base, attiva: false }, admin)).toBe("vietata");
  });
});
