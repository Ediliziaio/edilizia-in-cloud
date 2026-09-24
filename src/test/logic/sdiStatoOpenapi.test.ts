import { describe, it, expect } from "vitest";
import {
  esitoDefinitivo, estraiIdentificativoSdi, estraiStato, leggiEsitoOpenapi, messaggioSdi,
} from "../../../supabase/functions/_shared/sdiStatoOpenapi";

describe("sigle dello SDI", () => {
  it("le riconosce come sono, e dicono cosa diventa il documento", () => {
    expect(leggiEsitoOpenapi({ status: "RC" })).toMatchObject({ sdi_stato: "RC", stato: "consegnata" });
    expect(leggiEsitoOpenapi({ status: "NS" })).toMatchObject({ sdi_stato: "NS", stato: "rifiutata" });
    expect(leggiEsitoOpenapi({ status: "EC01" })).toMatchObject({ stato: "accettata" });
    expect(leggiEsitoOpenapi({ status: "EC02" })).toMatchObject({ stato: "rifiutata" });
    expect(leggiEsitoOpenapi({ status: "DT" })).toMatchObject({ stato: "accettata" });
  });
  it("«in attesa» non cambia lo stato del documento", () => {
    expect(leggiEsitoOpenapi({ status: "AT" })).toMatchObject({ sdi_stato: "AT", stato: null });
  });
  it("la mancata consegna NON è uno scarto: la fattura è valida", () => {
    expect(leggiEsitoOpenapi({ status: "MC" })).toMatchObject({ sdi_stato: "MC", stato: "inviata_sdi" });
  });
});

describe("parole al posto delle sigle", () => {
  it("italiano e inglese, come li scrivono i gestionali", () => {
    expect(leggiEsitoOpenapi({ status: "consegnata" })?.sdi_stato).toBe("RC");
    expect(leggiEsitoOpenapi({ status: "delivered" })?.sdi_stato).toBe("RC");
    expect(leggiEsitoOpenapi({ status: "scartata" })?.sdi_stato).toBe("NS");
    expect(leggiEsitoOpenapi({ status: "rejected" })?.sdi_stato).toBe("NS");
    expect(leggiEsitoOpenapi({ status: "not_delivered" })?.sdi_stato).toBe("MC");
    expect(leggiEsitoOpenapi({ status: "pending" })?.sdi_stato).toBe("AT");
  });
  it("«mancata consegna» non si confonde con «consegnata»", () => {
    expect(leggiEsitoOpenapi({ status: "mancata consegna" })?.sdi_stato).toBe("MC");
  });
  it("«rifiutata dal destinatario» è EC02, «scartata dallo SDI» è NS", () => {
    expect(leggiEsitoOpenapi({ status: "rifiutata dal destinatario" })?.sdi_stato).toBe("EC02");
    expect(leggiEsitoOpenapi({ status: "rifiutata dallo sdi" })?.sdi_stato).toBe("NS");
  });
});

describe("quello che non si capisce", () => {
  it("non diventa uno stato inventato", () => {
    expect(leggiEsitoOpenapi({ status: "boh" })).toBeNull();
    expect(leggiEsitoOpenapi({})).toBeNull();
    expect(leggiEsitoOpenapi(null)).toBeNull();
    expect(leggiEsitoOpenapi({ status: "" })).toBeNull();
  });
});

describe("dove cercare i campi", () => {
  it("lo stato anche dentro data/result/invoice", () => {
    expect(estraiStato({ data: { status: "RC" } })).toBe("RC");
    expect(estraiStato({ result: { esito: "NS" } })).toBe("NS");
    expect(estraiStato("delivered")).toBe("delivered");
    expect(estraiStato({ altro: 1 })).toBeNull();
  });
  it("l'IdentificativoSdI nei nomi che usano i provider", () => {
    expect(estraiIdentificativoSdi({ identificativo_sdi: " 12345 " })).toBe("12345");
    expect(estraiIdentificativoSdi({ data: { idSdi: 999 } })).toBe("999");
    expect(estraiIdentificativoSdi({ data: {} })).toBeNull();
  });
});

describe("quando smettere di chiedere l'esito", () => {
  // Ogni richiesta a openapi è gratis solo fino a 1.000 al giorno per tutto
  // l'account: una fattura chiusa che si continua a chiedere ogni 15 minuti
  // costa, e con 40 così le nuove non si guardano più.
  it("tra privati la consegna e la mancata consegna chiudono", () => {
    expect(esitoDefinitivo("RC", false)).toBe(true);
    expect(esitoDefinitivo("MC", false)).toBe(true);
  });
  it("verso la PA dopo la consegna si aspetta ancora accettazione o decorrenza", () => {
    expect(esitoDefinitivo("RC", true)).toBe(false);
    expect(esitoDefinitivo("MC", true)).toBe(false);
    expect(esitoDefinitivo("EC01", true)).toBe(true);
    expect(esitoDefinitivo("DT", true)).toBe(true);
  });
  it("scarto e rifiuto chiudono sempre; in attesa o senza esito no", () => {
    expect(esitoDefinitivo("NS", false)).toBe(true);
    expect(esitoDefinitivo("EC02", true)).toBe(true);
    expect(esitoDefinitivo("AT", false)).toBe(false);
    expect(esitoDefinitivo(null, false)).toBe(false);
  });
});

describe("la risposta vera di openapi (schema OAS dell'API Invoice)", () => {
  // GET /IT-invoices/{id}: lo stato SDI sta in data.details.sdi_status. Prima
  // non si guardava, e ogni fattura sarebbe rimasta «inviata» per sempre.
  const fattura = (sdi_status: string, extra: Record<string, unknown> = {}) =>
    ({ success: true, data: { id: "abc", state: "SENT", details: { sdi_status, sdi_id: "8214537", ...extra } } });

  it("consegnata, non consegnata, accettata, decorrenza", () => {
    expect(leggiEsitoOpenapi(fattura("DELIVERED"))?.sdi_stato).toBe("RC");
    expect(leggiEsitoOpenapi(fattura("NOT_DELIVERED"))?.sdi_stato).toBe("MC");
    expect(leggiEsitoOpenapi(fattura("ACCEPTED"))?.sdi_stato).toBe("EC01");
    expect(leggiEsitoOpenapi(fattura("TERMS_EXPIRED"))?.sdi_stato).toBe("DT");
  });
  it("prenotata o spedita: in attesa", () => {
    expect(leggiEsitoOpenapi(fattura("BOOKED"))?.sdi_stato).toBe("AT");
    expect(leggiEsitoOpenapi(fattura("SENT"))?.sdi_stato).toBe("AT");
  });
  it("scartata o in errore: rifiutata, con il motivo dello SDI", () => {
    const esito = leggiEsitoOpenapi(fattura("REJECTED", { sdi_message: "00404 Fattura duplicata" }));
    expect(esito).toMatchObject({ sdi_stato: "NS", stato: "rifiutata" });
    expect(esito?.messaggio).toContain("00404 Fattura duplicata");
    expect(messaggioSdi(fattura("ERROR", { sdi_message: "XML non valido" }))).toBe("XML non valido");
    expect(leggiEsitoOpenapi({ data: { state: "ERROR" } })?.sdi_stato).toBe("NS");
  });
  it("l'identificativo SDI da details.sdi_id", () => {
    expect(estraiIdentificativoSdi(fattura("DELIVERED"))).toBe("8214537");
  });
  it("lo stato del lavoro di openapi non si scambia per un esito", () => {
    expect(estraiStato({ data: { state: "DONE" } })).toBeNull();
  });
});
