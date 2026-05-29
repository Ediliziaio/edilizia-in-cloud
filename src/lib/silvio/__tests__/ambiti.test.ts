import { describe, it, expect } from "vitest";
import { ambitoConsentito, ambitiDelRuolo } from "../ambiti";

describe("segregazione dati per ruolo — il punto critico", () => {
  it("MARKETING (salesperson) NON vede la finanza/fatturato", () => {
    expect(ambitoConsentito(["salesperson"], "finanza")).toBe(false);
    expect(ambitoConsentito(["salesperson"], "marketing")).toBe(true);
    expect(ambitoConsentito(["salesperson"], "clienti")).toBe(true);
    expect(ambitoConsentito(["salesperson"], "hr")).toBe(false);
  });
  it("OPERAIO (worker/employee) NON vede finanza né marketing", () => {
    expect(ambitoConsentito(["worker"], "finanza")).toBe(false);
    expect(ambitoConsentito(["worker"], "marketing")).toBe(false);
    expect(ambitoConsentito(["employee"], "finanza")).toBe(false);
    expect(ambitoConsentito(["worker"], "cantieri")).toBe(true);
    expect(ambitoConsentito(["worker"], "magazzino")).toBe(true);
  });
  it("ADMIN/super vedono tutto", () => {
    expect(ambitoConsentito(["company_admin"], "finanza")).toBe(true);
    expect(ambitoConsentito(["company_admin"], "hr")).toBe(true);
    expect(ambitoConsentito(["super_admin"], "finanza")).toBe(true);
  });
  it("STAFF ufficio: tutto tranne HR", () => {
    expect(ambitoConsentito(["company_staff"], "finanza")).toBe(true);
    expect(ambitoConsentito(["company_staff"], "hr")).toBe(false);
  });
  it("COMMERCIALISTA: finanza+clienti, NON marketing", () => {
    expect(ambitoConsentito(["accountant"], "finanza")).toBe(true);
    expect(ambitoConsentito(["accountant"], "marketing")).toBe(false);
  });
  it("nessun ruolo → niente", () => {
    expect(ambitoConsentito([], "finanza")).toBe(false);
    expect(ambitoConsentito([], "generale")).toBe(false);
  });
  it("ruoli multipli → unione dei permessi", () => {
    expect(ambitoConsentito(["worker", "salesperson"], "marketing")).toBe(true); // da salesperson
    expect(ambitoConsentito(["worker", "salesperson"], "finanza")).toBe(false);  // nessuno dei due
  });
});

describe("ambitiDelRuolo", () => {
  it("operaio: cantieri+magazzino+generale (niente finanza)", () => {
    const a = ambitiDelRuolo(["worker"]);
    expect(a).toContain("cantieri");
    expect(a).toContain("magazzino");
    expect(a).not.toContain("finanza");
    expect(a).not.toContain("marketing");
  });
  it("admin: tutti", () => {
    expect(ambitiDelRuolo(["company_admin"])).toContain("finanza");
    expect(ambitiDelRuolo(["company_admin"])).toContain("hr");
  });
});
