import { describe, expect, it } from "vitest";
import { emailSembraAziendale, partitaIvaValida } from "@/lib/fea/tipoFirmatario";

describe("tipoFirmatario", () => {
  it("dominio proprio = probabilmente azienda", () => {
    expect(emailSembraAziendale("Amministrazione@amgmeccanica.it")).toBe(true);
    expect(emailSembraAziendale("mario.rossi@gmail.com")).toBe(false);
    expect(emailSembraAziendale("")).toBe(false);
  });
  it("partita IVA: 11 cifre, IT facoltativo, vuota ammessa", () => {
    expect(partitaIvaValida("IT 01234567890")).toBe(true);
    expect(partitaIvaValida("")).toBe(true);
    expect(partitaIvaValida("123")).toBe(false);
  });
});
