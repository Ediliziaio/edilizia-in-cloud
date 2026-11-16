import { describe, expect, it } from "vitest";
import { etichettaMetodo, filtroMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";

describe("modalità di pagamento delle scadenze", () => {
  it("riconosce le scritture che ci sono davvero nel database", () => {
    expect(gruppoMetodo("riba")).toBe("riba");
    expect(gruppoMetodo("MP12")).toBe("riba");
    expect(gruppoMetodo("MP05")).toBe("bonifico");
    expect(gruppoMetodo("Bonifico Vista Fattura")).toBe("bonifico");
    expect(gruppoMetodo("bank_transfer")).toBe("bonifico");
    expect(gruppoMetodo("Contanti")).toBe("contanti");
    expect(gruppoMetodo(null)).toBeNull();
    expect(etichettaMetodo("MP12")).toBe("RiBa");
  });
  it("il filtro della RiBa prende codice e parola", () => {
    expect(filtroMetodo("riba")).toContain("payment_method.eq.MP12");
    expect(filtroMetodo("riba")).toContain("payment_method.ilike.*riba*");
  });
});
