import { describe, expect, it } from "vitest";
import { puoConsultareSalSub, puoScrivereSalSub } from "@/lib/permessi/contabilitaSubappalto";

const nessuno = {
  canViewSubappaltatori: false,
  canViewCosts: false,
  canViewSubappaltatoriAmministrazione: false,
  canEditOrders: false,
  solaLettura: false,
};

describe("contabilità dei subappalti", () => {
  it("la scheda Subappaltatori basta per consultare, non per scrivere", () => {
    const p = { ...nessuno, canViewSubappaltatori: true, canEditOrders: true };
    expect(puoConsultareSalSub(p)).toBe(true);
    expect(puoScrivereSalSub(p)).toBe(false);
  });

  it("chi aveva già Costi e Documenti mensili continua a consultare", () => {
    expect(puoConsultareSalSub({ ...nessuno, canViewCosts: true, canViewSubappaltatoriAmministrazione: true })).toBe(true);
  });

  it("scrivere richiede Commesse, Costi e Documenti mensili, e non la sola lettura", () => {
    const pieno = { ...nessuno, canViewCosts: true, canViewSubappaltatoriAmministrazione: true, canEditOrders: true };
    expect(puoScrivereSalSub(pieno)).toBe(true);
    expect(puoScrivereSalSub({ ...pieno, solaLettura: true })).toBe(false);
  });

  it("senza permessi non si consulta nulla", () => {
    expect(puoConsultareSalSub(nessuno)).toBe(false);
  });
});
