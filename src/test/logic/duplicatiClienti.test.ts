import { describe, it, expect } from "vitest";
import {
  soloCifre,
  nucleoTelefono,
  normalizzaFiscale,
  patternTelefonoIlike,
  trovaSomiglianze,
  descriviMotivi,
  nomeCliente,
  type ClienteEsistente,
} from "@/lib/clienti/duplicati";

function cliente(patch: Partial<ClienteEsistente>): ClienteEsistente {
  // Spread DOPO i default: così un `null` esplicito nel patch vince, invece di
  // essere riassorbito dal default (che è esattamente il caso da testare).
  return {
    id: "c1",
    first_name: "Mario",
    last_name: "Rossi",
    business_name: null,
    email: null,
    phone: null,
    fiscal_code: null,
    vat_number: null,
    ...patch,
  };
}

describe("normalizzazione", () => {
  it("il telefono si riconosce comunque sia scritto", () => {
    const forme = ["+39 333 1234567", "0039 333 1234567", "333 123 45 67", "3331234567", "333/123-4567"];
    const nuclei = forme.map(nucleoTelefono);
    expect(new Set(nuclei).size).toBe(1);
    expect(nuclei[0]).toBe("331234567");
  });

  it("un numero troppo corto non è indicativo e non genera falsi allarmi", () => {
    expect(nucleoTelefono("112")).toBe("");
    expect(nucleoTelefono("")).toBe("");
    expect(nucleoTelefono(null)).toBe("");
    expect(patternTelefonoIlike("112")).toBe("");
  });

  it("soloCifre butta via tutto il resto", () => {
    expect(soloCifre("+39 (333) 12-34.567")).toBe("393331234567");
  });

  it("P.IVA e CF si confrontano senza spazi, prefisso IT e maiuscole", () => {
    expect(normalizzaFiscale(" it 123 456 789 03 ")).toBe("12345678903");
    expect(normalizzaFiscale("rssmra80a01h501u")).toBe("RSSMRA80A01H501U");
  });

  it("il pattern per il telefono ignora la punteggiatura fra le cifre", () => {
    expect(patternTelefonoIlike("+39 333 1234567")).toBe("%3%3%1%2%3%4%5%6%7%");
  });
});

describe("trovaSomiglianze", () => {
  const esistenti = [
    cliente({ id: "a", business_name: "Edil Rossi Srl", vat_number: "12345678903", phone: "+39 02 1234567" }),
    cliente({ id: "b", first_name: "Luca", last_name: "Bianchi", fiscal_code: "BNCLCU85M42F205Y" }),
    cliente({ id: "c", first_name: "Anna", last_name: "Verdi", phone: "333 123 45 67" }),
  ];

  it("riconosce la stessa partita IVA scritta in un altro modo", () => {
    const r = trovaSomiglianze(esistenti, { vatNumber: "IT 12345678903" });
    expect(r).toHaveLength(1);
    expect(r[0].cliente.id).toBe("a");
    expect(r[0].motivi).toEqual(["vat"]);
  });

  it("riconosce lo stesso codice fiscale in minuscolo", () => {
    const r = trovaSomiglianze(esistenti, { fiscalCode: "bnclcu85m42f205y" });
    expect(r.map((x) => x.cliente.id)).toEqual(["b"]);
  });

  it("riconosce lo stesso telefono con spaziatura diversa", () => {
    const r = trovaSomiglianze(esistenti, { phone: "+39 3331234567" });
    expect(r.map((x) => x.cliente.id)).toEqual(["c"]);
  });

  it("mette per primo chi combacia su più campi", () => {
    const conDue = [
      ...esistenti,
      cliente({ id: "d", vat_number: "12345678903", phone: "333 123 45 67" }),
    ];
    const r = trovaSomiglianze(conDue, { vatNumber: "12345678903", phone: "3331234567" });
    expect(r[0].cliente.id).toBe("d");
    expect(r[0].motivi).toEqual(["vat", "phone"]);
  });

  it("campi vuoti non fanno combaciare nulla", () => {
    // Il rischio vero: un cliente senza P.IVA che combacia con tutti gli altri
    // senza P.IVA. Non deve succedere.
    const senzaNulla = [cliente({ id: "x" }), cliente({ id: "y" })];
    expect(trovaSomiglianze(senzaNulla, {})).toEqual([]);
    expect(trovaSomiglianze(senzaNulla, { vatNumber: "", fiscalCode: null, phone: "  " })).toEqual([]);
  });

  it("nessuna corrispondenza quando i dati sono davvero diversi", () => {
    expect(trovaSomiglianze(esistenti, { vatNumber: "00743110157", phone: "3479999999" })).toEqual([]);
  });
});

describe("testi dell'avviso", () => {
  it("elenca i motivi in italiano leggibile", () => {
    expect(descriviMotivi(["vat"])).toBe("stessa partita IVA");
    expect(descriviMotivi(["vat", "phone"])).toBe("stessa partita IVA e stesso telefono");
    expect(descriviMotivi(["vat", "fiscal", "phone"]))
      .toBe("stessa partita IVA, stesso codice fiscale e stesso telefono");
    expect(descriviMotivi([])).toBe("");
  });

  it("il nome mostrato preferisce la ragione sociale", () => {
    expect(nomeCliente(cliente({ business_name: "Edil Rossi Srl" }))).toBe("Edil Rossi Srl");
    expect(nomeCliente(cliente({ business_name: null }))).toBe("Mario Rossi");
    expect(nomeCliente(cliente({ first_name: null, last_name: null, email: "x@y.it" }))).toBe("x@y.it");
  });
});
