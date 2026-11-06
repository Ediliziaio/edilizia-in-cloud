import { describe, it, expect } from "vitest";
import {
  recapitiFornitore,
  type FornitoreDocumento,
} from "@/lib/documentiOperativi/fornitore";
const a: FornitoreDocumento = {
  id: "a",
  name: "Fornitore A",
  email: "info@a.invalid",
  email_ordini: "ordini@a.invalid",
  contact_name: "Anna",
  contact_email: "anna@a.invalid",
  contact_phone: "02111",
  payment_method: "riba",
  termini_giorni: 60,
  termini_fine_mese: true,
  address: "Via A 1",
  city: "Milano",
  ritiro_indirizzo: "Deposito A 10",
  ritiro_citta: "Monza",
  ritiro_note: "Ritiro dalle 8 alle 12",
};
describe("Dati di ogni fornitore nel documento", () => {
  it("usa email ordini e condizioni specifiche del fornitore", () => {
    const d = recapitiFornitore(a);
    expect(d.destinatario.email).toBe("ordini@a.invalid");
    expect(d.pagamento).toBe("RIBA · 60 gg fine mese");
    expect(d.referenteEmail).toBe("anna@a.invalid");
    expect(d.ritiroIndirizzo).toBe("Deposito A 10, Monza");
  });
  it("non eredita contatti, pagamento o indirizzi da un altro fornitore", () => {
    recapitiFornitore(a);
    const b = recapitiFornitore({
      id: "b",
      name: "Fornitore B",
      email: "b@b.invalid",
    });
    expect(b.destinatario.email).toBe("b@b.invalid");
    expect(b.pagamento).toBe("Da definire con il fornitore");
    expect(b.referenteEmail).toBe("");
    expect(b.referenteTelefono).toBe("");
    expect(b.ritiroIndirizzo).toBe("");
    expect(b.referentiFornitore).toEqual([]);
  });
  it("trova l'email del referente principale quando non c'è email ordini", () => {
    expect(
      recapitiFornitore({ ...a, email_ordini: null, altri_referenti: null })
        .destinatario.email,
    ).toBe("anna@a.invalid");
  });
  it("preferisce il referente ordini agli altri contatti", () => {
    const d = recapitiFornitore({
      ...a,
      altri_referenti: [
        {
          ruolo: "ordini",
          nome: "Luca",
          email: "luca@a.invalid",
          telefono: "02333",
        },
      ],
    });
    expect(d.referente).toBe("Luca");
    expect(d.referenteEmail).toBe("luca@a.invalid");
    expect(d.referentiFornitore).toHaveLength(2);
  });
});
