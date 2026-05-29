import { describe, it, expect } from "vitest";
import {
  isDominioPec, classificaRicevutaPec, statoDaRicevute,
  etichettaPecTipo, etichettaPecStato, pecRichiedeAlert,
} from "../pec";

describe("isDominioPec", () => {
  it("riconosce domini PEC", () => {
    expect(isDominioPec("impresa@pec.aruba.it".split("@")[1])).toBe(true);
    expect(isDominioPec("legalmail.it")).toBe(true);
    expect(isDominioPec("azienda.pec.it")).toBe(true);
  });
  it("dominio normale → false", () => {
    expect(isDominioPec("gmail.com")).toBe(false);
    expect(isDominioPec("azienda.it")).toBe(false);
    expect(isDominioPec("")).toBe(false);
  });
});

describe("classificaRicevutaPec — specchio del trigger DB", () => {
  it("accettazione da header", () => expect(classificaRicevutaPec("Re: gara", { "X-Ricevuta": "accettazione" })).toBe("accettazione"));
  it("accettazione da oggetto", () => expect(classificaRicevutaPec("ACCETTAZIONE: invio gara", {})).toBe("accettazione"));
  it("consegna da header", () => expect(classificaRicevutaPec("x", { "X-Ricevuta": "avvenuta-consegna" })).toBe("consegna"));
  it("consegna da oggetto", () => expect(classificaRicevutaPec("CONSEGNA: contratto", null)).toBe("consegna"));
  it("mancata da header errore-consegna", () => expect(classificaRicevutaPec("x", { "X-Ricevuta": "errore-consegna" })).toBe("mancata_consegna"));
  it("mancata da oggetto", () => expect(classificaRicevutaPec("MANCATA CONSEGNA: avviso", {})).toBe("mancata_consegna"));
  it("email normale → messaggio", () => expect(classificaRicevutaPec("Preventivo ristrutturazione", {})).toBe("messaggio"));
  it("posta certificata generica → messaggio", () => expect(classificaRicevutaPec("Posta certificata: comunicazione", {})).toBe("messaggio"));
});

describe("statoDaRicevute", () => {
  it("mancata vince su tutto", () => expect(statoDaRicevute(["accettazione", "consegna", "mancata_consegna"])).toBe("mancata"));
  it("consegna se presente", () => expect(statoDaRicevute(["accettazione", "consegna"])).toBe("consegnata"));
  it("solo accettazione → accettata", () => expect(statoDaRicevute(["accettazione"])).toBe("accettata"));
  it("nessuna ricevuta → inviata", () => expect(statoDaRicevute([])).toBe("inviata"));
});

describe("etichette + alert", () => {
  it("etichette tipo italiane", () => {
    expect(etichettaPecTipo("consegna")).toBe("Ricevuta di consegna");
    expect(etichettaPecTipo("mancata_consegna")).toBe("Mancata consegna");
  });
  it("etichette stato italiane", () => {
    expect(etichettaPecStato("consegnata")).toBe("Consegnata");
    expect(etichettaPecStato("mancata")).toBe("Mancata consegna");
  });
  it("solo la mancata consegna richiede alert", () => {
    expect(pecRichiedeAlert("mancata")).toBe(true);
    expect(pecRichiedeAlert("consegnata")).toBe(false);
    expect(pecRichiedeAlert(null)).toBe(false);
  });
});
