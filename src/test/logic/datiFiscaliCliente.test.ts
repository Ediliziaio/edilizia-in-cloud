import { describe, expect, it } from "vitest";
import { avvisiDatiFiscali, codiceFiscaleValido, partitaIvaValida, rigaDatiFiscali } from "@/lib/preventivatore/datiFiscaliCliente";

describe("dati fiscali del cliente del preventivo", () => {
  it("riconosce codici fiscali e partite IVA giusti e sbagliati", () => {
    expect(codiceFiscaleValido("RSSMRA80A01H501U")).toBe(true);
    expect(codiceFiscaleValido("rssmra80a01h501u")).toBe(true);
    expect(codiceFiscaleValido("RSSMRA80A01H501X")).toBe(false);
    expect(codiceFiscaleValido("12345")).toBe(false);
    expect(partitaIvaValida("01114601006")).toBe(true);
    expect(partitaIvaValida("IT01114601006")).toBe(true);
    expect(partitaIvaValida("01114601007")).toBe(false);
    // Il codice fiscale di una società è la sua partita IVA.
    expect(codiceFiscaleValido("01114601006")).toBe(true);
  });
  it("la riga del PDF dice C.F. per un privato e P.IVA per un'azienda", () => {
    expect(rigaDatiFiscali({ tipo: "privato", codiceFiscale: "rssmra80a01h501u", partitaIva: "01114601006" })).toBe("C.F. RSSMRA80A01H501U");
    expect(rigaDatiFiscali({ tipo: "azienda", partitaIva: "01114601006", codiceFiscale: "01114601006", pec: "amm@pec.it", codiceSdi: "m5uxcr1" }))
      .toBe("P.IVA 01114601006 · PEC amm@pec.it · Codice destinatario M5UXCR1");
    expect(rigaDatiFiscali({ tipo: "privato" })).toBe("");
  });
  it("avvisa solo dei campi scritti e sbagliati, mai di quelli vuoti", () => {
    expect(avvisiDatiFiscali({ tipo: "azienda" })).toEqual({});
    expect(Object.keys(avvisiDatiFiscali({ tipo: "azienda", partitaIva: "123", codiceSdi: "12" }))).toEqual(["partitaIva", "codiceSdi"]);
    expect(avvisiDatiFiscali({ tipo: "privato", partitaIva: "123" })).toEqual({});
  });
});
