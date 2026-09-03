import { describe, it, expect } from "vitest";
import {
  areaDaPercorso,
  areeDisponibili,
  haEntrambeLeAree,
  ruoliDellArea,
  ruoloEffettivoPerArea,
  areaIniziale,
} from "@/lib/auth/aree";
import { computeEffectiveRole } from "@/lib/roleHierarchy";
import type { AppRole } from "@/types/auth";

// Il caso reale: chi manda avanti il magazzino di una filiale gestisce commesse
// e giacenze dall'ufficio, ma fa anche rapportini e timbrature in cantiere.
const magazziniere: AppRole[] = ["company_staff", "employee"];
const soloOperaio: AppRole[] = ["employee"];
const soloUfficio: AppRole[] = ["company_staff"];

describe("aree gestionale/campo — il doppio cappello", () => {
  it("l'area si legge dall'URL", () => {
    expect(areaDaPercorso("/campo")).toBe("campo");
    expect(areaDaPercorso("/campo/rapportino")).toBe("campo");
    expect(areaDaPercorso("/azienda/commesse")).toBe("gestionale");
    expect(areaDaPercorso("/login")).toBe("gestionale");
    expect(areaDaPercorso(null)).toBe("gestionale");
  });

  it("non confonde un percorso che comincia per 'campo' senza esserlo", () => {
    expect(areaDaPercorso("/campobasso")).toBe("gestionale");
    expect(areaDaPercorso("/azienda/campo-note")).toBe("gestionale");
  });

  it("riconosce chi ha entrambi i cappelli", () => {
    expect(areeDisponibili(magazziniere)).toEqual(["gestionale", "campo"]);
    expect(haEntrambeLeAree(magazziniere)).toBe(true);
    expect(haEntrambeLeAree(soloOperaio)).toBe(false);
    expect(haEntrambeLeAree(soloUfficio)).toBe(false);
    expect(haEntrambeLeAree([])).toBe(false);
  });

  it("IL BUG CHE RISOLVE: da solo, employee schiacciava company_staff", () => {
    // Comportamento globale di prima: l'operaio vinceva e la persona restava
    // chiusa in /campo, senza poter entrare nel gestionale.
    expect(computeEffectiveRole(magazziniere)).toBe("employee");
    // Adesso, dentro l'area, comanda il cappello giusto.
    expect(ruoloEffettivoPerArea(magazziniere, "gestionale")).toBe("company_staff");
    expect(ruoloEffettivoPerArea(magazziniere, "campo")).toBe("employee");
  });

  it("in ufficio valgono i permessi da staff, in cantiere quelli da operaio", () => {
    expect(ruoliDellArea(magazziniere, "gestionale")).toEqual(["company_staff"]);
    expect(ruoliDellArea(magazziniere, "campo")).toEqual(["employee"]);
  });

  it("chi ha un'area sola non cambia comportamento", () => {
    expect(ruoloEffettivoPerArea(soloOperaio, "campo")).toBe("employee");
    expect(ruoloEffettivoPerArea(soloUfficio, "gestionale")).toBe("company_staff");
  });

  it("l'operaio che finisce su una rotta del gestionale resta operaio (e il guard lo rimanda a casa)", () => {
    // Nessun ruolo di quell'area → si ripiega su tutti i suoi ruoli, MAI su null:
    // null lo tratterebbe come non autenticato e lo butterebbe al login.
    expect(ruoliDellArea(soloOperaio, "gestionale")).toEqual(["employee"]);
    expect(ruoloEffettivoPerArea(soloOperaio, "gestionale")).toBe("employee");
  });

  it("il titolare che è anche venditore resta admin nel gestionale", () => {
    const titolare: AppRole[] = ["company_admin", "salesperson"];
    expect(ruoloEffettivoPerArea(titolare, "gestionale")).toBe("company_admin");
    expect(haEntrambeLeAree(titolare)).toBe(false); // nessun cappello da campo
  });

  it("il subappaltatore-staff ha entrambe le aree", () => {
    const misto: AppRole[] = ["company_staff", "subcontractor"];
    expect(haEntrambeLeAree(misto)).toBe(true);
    expect(ruoloEffettivoPerArea(misto, "campo")).toBe("subcontractor");
    expect(ruoloEffettivoPerArea(misto, "gestionale")).toBe("company_staff");
  });

  it("chi ha entrambe le aree atterra nel gestionale", () => {
    expect(areaIniziale(magazziniere)).toBe("gestionale");
    expect(areaIniziale(soloOperaio)).toBe("campo");
    expect(areaIniziale(soloUfficio)).toBe("gestionale");
  });

  it("i ruoli di piattaforma e portali terzi non entrano nello switch", () => {
    expect(areeDisponibili(["customer"])).toEqual([]);
    expect(areeDisponibili(["accountant"])).toEqual([]);
    expect(areeDisponibili(["super_admin"])).toEqual([]);
    expect(haEntrambeLeAree(["customer", "employee"])).toBe(false);
  });
});
