import { describe, expect, it } from "vitest";
import { clienteCommessa } from "@/lib/subappaltatori/clienteCommessa";

describe("cliente della commessa nel contratto di subappalto", () => {
  it("recupera il cliente collegato quando i campi storici sono vuoti", () => {
    expect(clienteCommessa({ customer: { first_name: "GUIDADEMO", last_name: "Cliente Documentazione" }, client_name: null, client_company: null })).toBe("GUIDADEMO Cliente Documentazione");
  });
  it("mantiene il nominativo storico in assenza di account visibile", () => {
    expect(clienteCommessa({ customer: null, client_company: "Impresa Demo", client_name: "Mario" })).toBe("Impresa Demo");
    expect(clienteCommessa({ customer: { first_name: " ", last_name: null }, client_company: " ", client_name: "Mario" })).toBe("Mario");
  });
  it("non inventa un cliente se manca la commessa", () => {
    expect(clienteCommessa(null)).toBe("");
  });
});
