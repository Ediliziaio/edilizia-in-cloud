/**
 * Email dell'azienda (dominio, mittente e aspetto): chi può cambiarle (09/10/2026).
 * La regola è quella del database: policy «Permesso email: dominio …» e «Permesso email: preferenze …» (vista
 * `can_view_marketing_email` e non «sola lettura»), più chi amministra l'azienda (`cep_write`, `ced_company_write`).
 */
import { describe, expect, it } from "vitest";
import { puoModificareEmail } from "@/lib/permessi/modificaSegueVisibilita";

describe("puoModificareEmail", () => {
  it("chi amministra può sempre", () => {
    expect(puoModificareEmail({ isAdmin: true, canViewMarketingEmail: false, solaLettura: false })).toBe(true);
  });
  it("chi ha «Email Marketing» e non è in sola lettura può", () => {
    expect(puoModificareEmail({ isAdmin: false, canViewMarketingEmail: true, solaLettura: false })).toBe(true);
  });
  it("chi ha «Email Marketing» ma è in sola lettura no", () => {
    expect(puoModificareEmail({ isAdmin: false, canViewMarketingEmail: true, solaLettura: true })).toBe(false);
  });
  it("chi non ha «Email Marketing» e non amministra no", () => {
    expect(puoModificareEmail({ isAdmin: false, canViewMarketingEmail: false, solaLettura: false })).toBe(false);
  });
});
