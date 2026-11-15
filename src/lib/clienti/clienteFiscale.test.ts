import { describe, expect, it } from "vitest";
import {
  campiProfiloDaForm,
  erroreCodiceUfficio,
  etichettaTipoCliente,
  formDaAnagrafica,
  payloadSalvaAnagrafica,
  problemiClienteFiscale,
  sceltaDaSplit,
  splitDaScelta,
  type ClienteFiscaleForm,
} from "./clienteFiscale";
import { etichettaUfficioPa, ordinaUfficiPa, problemiUfficioPa, ufficioDaProporre } from "./ufficiPa";

// CF validi (carattere di controllo giusto) e P.IVA con checksum giusto.
const CF_PERSONA = "RSSMRA80A01H501U";
const PIVA = "01234567897";
const CF_ENTE = "80016350821";

const privato: ClienteFiscaleForm = { tipo: "B2C", nome: "Mario", cognome: "Rossi", codiceFiscale: CF_PERSONA };
const azienda: ClienteFiscaleForm = { tipo: "B2B", ragioneSociale: "Rossi Costruzioni S.r.l.", partitaIva: PIVA };
const ente: ClienteFiscaleForm = { tipo: "PA", ragioneSociale: "Comune di Prova", codiceFiscale: CF_ENTE };

describe("etichette", () => {
  it("chiama i tipi come li chiama chi lavora", () => {
    expect(etichettaTipoCliente("B2C")).toBe("Privato");
    expect(etichettaTipoCliente("B2B")).toBe("Azienda");
    expect(etichettaTipoCliente("PA")).toBe("Pubblica Amministrazione");
    expect(etichettaTipoCliente("Estero")).toBe("Estero");
    expect(etichettaTipoCliente(null)).toBe("—");
  });
});

describe("problemiClienteFiscale per tipo", () => {
  it("privato: nome e cognome obbligatori, il CF solo per fatturare", () => {
    expect(problemiClienteFiscale(privato)).toEqual({});
    const e = problemiClienteFiscale({ tipo: "B2C" });
    expect(e.nome).toBeTruthy();
    expect(e.cognome).toBeTruthy();
    expect(e.codiceFiscale).toBeUndefined();
    expect(problemiClienteFiscale({ tipo: "B2C", nome: "A", cognome: "B" }, true).codiceFiscale).toBeTruthy();
  });

  it("azienda: ragione sociale obbligatoria, codice destinatario di 7 caratteri", () => {
    expect(problemiClienteFiscale(azienda)).toEqual({});
    expect(problemiClienteFiscale({ tipo: "B2B" }).ragioneSociale).toBeTruthy();
    expect(problemiClienteFiscale({ ...azienda, codiceDestinatario: "ABC12" }).codiceDestinatario).toMatch(/7 caratteri/);
    expect(problemiClienteFiscale({ ...azienda, codiceDestinatario: "abc 1234" })).toEqual({});
    expect(problemiClienteFiscale({ ...azienda, partitaIva: "01234567890" }).partitaIva).toBeTruthy();
    expect(problemiClienteFiscale({ ...azienda, pec: "non-una-pec" }).pec).toBeTruthy();
  });

  it("PA: denominazione e codice fiscale dell'ente obbligatori, P.IVA facoltativa", () => {
    expect(problemiClienteFiscale(ente)).toEqual({});
    const e = problemiClienteFiscale({ tipo: "PA" });
    expect(e.ragioneSociale).toMatch(/denominazione/);
    expect(e.codiceFiscale).toMatch(/obbligatorio/);
    expect(e.partitaIva).toBeUndefined();
    // Un ente ha il CF numerico di 11 cifre, non quello di una persona.
    expect(problemiClienteFiscale({ ...ente, codiceFiscale: CF_PERSONA }).codiceFiscale).toMatch(/11 cifre/);
  });

  it("PA: codice IPA e primo ufficio controllati se scritti", () => {
    expect(problemiClienteFiscale({ ...ente, codiceIpa: "c_h501", ufficioCodice: "uf1234" })).toEqual({});
    expect(problemiClienteFiscale({ ...ente, ufficioCodice: "UF12" }).ufficioCodice).toMatch(/6 caratteri/);
    expect(problemiClienteFiscale({ ...ente, codiceIpa: "c-h501!" }).codiceIpa).toBeTruthy();
  });

  it("per fatturare chiede l'indirizzo, col CAP di 5 cifre in Italia", () => {
    const e = problemiClienteFiscale(azienda, true);
    expect(e.indirizzoVia).toBeTruthy();
    expect(e.indirizzoCap).toBeTruthy();
    const estero = problemiClienteFiscale({ ...azienda, indirizzoVia: "Rue X", indirizzoComune: "Paris", indirizzoNazione: "FR", indirizzoCap: "75" }, true);
    expect(estero.indirizzoCap).toBeUndefined();
  });
});

describe("erroreCodiceUfficio", () => {
  it("6 caratteri, lettere o cifre; 000000 non è un ufficio", () => {
    expect(erroreCodiceUfficio("UFABCD")).toBeNull();
    expect(erroreCodiceUfficio(" uf ab12 ")).toBeNull();
    expect(erroreCodiceUfficio("")).toMatch(/obbligatorio/);
    expect(erroreCodiceUfficio("ABC1234")).toMatch(/6 caratteri/);
    expect(erroreCodiceUfficio("AB-123")).toMatch(/6 caratteri/);
    expect(erroreCodiceUfficio("000000")).toMatch(/non è un ufficio/);
  });
});

describe("payloadSalvaAnagrafica", () => {
  it("privato: niente P.IVA né codice destinatario, intestazione da nome e cognome", () => {
    const p = payloadSalvaAnagrafica({ ...privato, partitaIva: PIVA, codiceDestinatario: "ABC1234" });
    expect(p).toMatchObject({ tipo_cliente: "B2C", ragione_sociale: "Mario Rossi", nome: "Mario", partita_iva: "", codice_sdi: "" });
    expect(p.split_payment).toBeNull();
  });

  it("azienda: codice destinatario maiuscolo, niente nome e cognome", () => {
    const p = payloadSalvaAnagrafica({ ...azienda, nome: "X", codiceDestinatario: "abc1234", partitaIva: `IT${PIVA}` });
    expect(p).toMatchObject({ tipo_cliente: "B2B", codice_sdi: "ABC1234", nome: "", partita_iva: PIVA });
  });

  it("PA: il codice destinatario non si scrive (viene dall'ufficio), split e IPA sì", () => {
    const p = payloadSalvaAnagrafica({ ...ente, codiceDestinatario: "ABC1234", codiceIpa: "c_h501", split: "si", ufficioCodice: "uf1234" });
    expect(p).not.toHaveProperty("codice_sdi");
    expect(p).toMatchObject({ tipo_cliente: "PA", codice_ipa: "c_h501", split_payment: true });
    expect(p).not.toHaveProperty("ufficio_codice");
    const conUfficio = payloadSalvaAnagrafica({ ...ente, ufficioCodice: "uf1234" }, { conUfficio: true });
    expect(conUfficio).toMatchObject({ ufficio_codice: "UF1234", ufficio_descrizione: "Ufficio di fatturazione" });
  });

  it("split payment: sì / no / come l'azienda (null)", () => {
    expect(splitDaScelta("si")).toBe(true);
    expect(splitDaScelta("no")).toBe(false);
    expect(splitDaScelta("azienda")).toBeNull();
    expect(sceltaDaSplit(null)).toBe("azienda");
    expect(sceltaDaSplit(false)).toBe("no");
    expect(payloadSalvaAnagrafica({ ...ente, split: "azienda" }).split_payment).toBeNull();
  });
});

describe("formDaAnagrafica e profilo", () => {
  it("rilegge la riga del database", () => {
    const f = formDaAnagrafica({ tipo_cliente: "PA", ragione_sociale: "Comune", codice_sdi: "UF1234", split_payment: false, codice_ipa: "c_x" });
    expect(f).toMatchObject({ tipo: "PA", ragioneSociale: "Comune", codiceDestinatario: "", split: "no", codiceIpa: "c_x", indirizzoNazione: "IT" });
    expect(formDaAnagrafica({ tipo_cliente: "B2B", codice_sdi: "ABC1234" }).codiceDestinatario).toBe("ABC1234");
    expect(formDaAnagrafica(null).tipo).toBe("B2B");
  });

  it("il profilo segue il tipo: PA e azienda sono is_business", () => {
    expect(campiProfiloDaForm(ente)).toEqual({ is_business: true, business_name: "Comune di Prova", vat_number: null, fiscal_code: CF_ENTE });
    expect(campiProfiloDaForm({ ...privato, partitaIva: PIVA })).toMatchObject({ is_business: false, vat_number: null, business_name: null });
  });
});

describe("uffici PA", () => {
  const u = (id: string, codice: string, descrizione: string, predefinito = false, attivo = true) => ({
    id,
    codice_univoco_ufficio: codice,
    descrizione,
    predefinito,
    attivo,
  });

  it("problemiUfficioPa: codice valido, non doppio, nome obbligatorio", () => {
    const altri = [u("1", "UF1234", "Ragioneria")];
    expect(problemiUfficioPa({ codice: "ab12cd", descrizione: "Lavori pubblici" }, altri)).toEqual({});
    expect(problemiUfficioPa({ codice: "uf1234", descrizione: "X" }, altri).codice).toMatch(/c'è già/);
    expect(problemiUfficioPa({ codice: "UF1234", descrizione: "X" }, altri, "1")).toEqual({});
    expect(problemiUfficioPa({ codice: "UF12", descrizione: "" }).descrizione).toBeTruthy();
  });

  it("ordina: predefinito, poi attivi per nome, poi disattivati", () => {
    const ord = ordinaUfficiPa([u("a", "AAAAAA", "Zeta"), u("b", "BBBBBB", "Vecchio", false, false), u("c", "CCCCCC", "Beta", true), u("d", "DDDDDD", "Alfa")]);
    expect(ord.map((x) => x.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("ufficioDaProporre: il predefinito attivo, o l'unico attivo, altrimenti nessuno", () => {
    expect(ufficioDaProporre([u("a", "AAAAAA", "A"), u("b", "BBBBBB", "B", true)])?.id).toBe("b");
    expect(ufficioDaProporre([u("a", "AAAAAA", "A"), u("b", "BBBBBB", "B", false, false)])?.id).toBe("a");
    expect(ufficioDaProporre([u("a", "AAAAAA", "A"), u("b", "BBBBBB", "B")])).toBeNull();
    expect(ufficioDaProporre([])).toBeNull();
  });

  it("etichetta con nome e codice", () => {
    expect(etichettaUfficioPa(u("a", "UF1234", "Lavori pubblici"))).toBe("Lavori pubblici · UF1234");
    expect(etichettaUfficioPa(u("a", "UF1234", ""))).toBe("UF1234");
  });
});
