import { describe, expect, it } from "vitest";
import { matchCustomerImportHeaders } from "@/lib/clienti/customerImportMapping";

const fields = [
  { key: "email", label: "Email" }, { key: "postal_code", label: "CAP" },
  { key: "fiscal_code", label: "Codice fiscale" }, { key: "vat_number", label: "Partita IVA" },
];
const aliases = { email: ["email", "posta"], postal_code: ["cap", "postalcode"],
  fiscal_code: ["codicefiscale"], vat_number: ["piva", "partitaiva"] };
describe("Mapping import clienti", () => {
  it("non scambia il CAP con email, indipendentemente dall'ordine dei campi", () => {
    expect(matchCustomerImportHeaders(["email", "postal_code"], fields, aliases))
      .toEqual({ email: "email", postal_code: "postal_code" });
  });
  it("mantiene separati CF e P.IVA", () => {
    expect(matchCustomerImportHeaders(["Codice fiscale", "P.IVA", "vat_number"], fields, aliases))
      .toEqual({ "Codice fiscale": "fiscal_code", "P.IVA": "vat_number", vat_number: "vat_number" });
  });
  it("non indovina colonne ambigue", () => {
    expect(matchCustomerImportHeaders(["codicefiscalepartitaiva"], fields, aliases)).toEqual({});
  });
});
