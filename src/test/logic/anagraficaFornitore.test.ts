import { describe, expect, it } from "vitest";
import {
  contattiPerUnione,
  emptyForm,
  payloadFornitore,
  sitoFornitore,
  supplierToForm,
  validaDettagliFornitore,
  type Supplier,
} from "@/lib/suppliers/anagraficaFornitore";
const fornitore = {
  id: "f1",
  name: "Rossi",
  company_id: "demo",
  created_at: "2026-01-01",
  is_foreign: false,
  is_active: true,
  vat_rate: 0,
} as Supplier;
describe("Anagrafica fornitore", () => {
  it("conserva zero e assenza di valori commerciali come informazioni diverse", () => {
    const dati = supplierToForm({
      ...fornitore,
      lead_time_days: null,
      min_order_amount: 0,
      credit_limit: null,
    });
    expect(payloadFornitore(dati)).toMatchObject({
      vat_rate: 0,
      lead_time_days: null,
      min_order_amount: 0,
      credit_limit: null,
    });
  });
  it("non accetta importi negativi, giorni frazionari o un fido con troppi decimali", () => {
    expect(
      validaDettagliFornitore({ ...emptyForm, min_order_amount: "-1" }),
    ).toContain("Ordine minimo");
    expect(
      validaDettagliFornitore({ ...emptyForm, lead_time_days: "1,5" }),
    ).toContain("senza decimali");
    expect(
      validaDettagliFornitore({ ...emptyForm, credit_limit: "12,345" }),
    ).toContain("due decimali");
  });
  it("i link al sito non possono eseguire javascript o includere credenziali", () => {
    expect(sitoFornitore("www.fornitore.test")).toBe(
      "https://www.fornitore.test/",
    );
    expect(sitoFornitore("javascript:alert(1)")).toBeNull();
    expect(sitoFornitore("https://utente:password@fornitore.test")).toBeNull();
  });
  it("il payload non sovrascrive i metadati non gestiti dal modulo", () => {
    expect(
      payloadFornitore({ ...emptyForm, name: "  Rossi   forniture  " }),
    ).toMatchObject({ name: "Rossi forniture" });
    expect(payloadFornitore(emptyForm)).not.toHaveProperty("barcode_prefix");
    expect(payloadFornitore(emptyForm)).not.toHaveProperty("default_qr_format");
  });
  it("l’unione mantiene un referente quando manca nel fornitore principale", () => {
    expect(
      contattiPerUnione(
        {
          ...fornitore,
          contact_name: "Mario",
          contact_email: "mario@rossi.test",
        },
        { ...fornitore, id: "f2" },
      ),
    ).toEqual({ contact_name: "Mario", contact_email: "mario@rossi.test" });
  });
  it("l’unione non elimina i recapiti di due referenti diversi", () => {
    expect(() =>
      contattiPerUnione(
        { ...fornitore, contact_name: "Mario" },
        { ...fornitore, id: "f2", contact_name: "Anna" },
      ),
    ).toThrow("referenti diversi");
  });
});
