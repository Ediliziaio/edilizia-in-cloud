/**
 * La «scheda dell'azienda» delle fatture (anagrafica_azienda): dal Profilo aziendale alla scheda, i segnaposto della
 * prima fattura, cosa manca per crearla, quando lo SDI si può attivare, come si dice un errore (10/10/2026).
 */
import { describe, expect, it } from "vitest";
import {
  SEGNAPOSTO_SCHEDA,
  campiMancantiPerCreare,
  campiProvvisori,
  datiBastanoPerAttivare,
  eSegnaposto,
  messaggioErroreSalvataggio,
  schedaDaMostrare,
  schedaDalProfilo,
} from "@/lib/fatturazione/schedaAzienda";

const SCHEDA_VERA = {
  ragione_sociale: "Rossi Costruzioni S.r.l.",
  partita_iva: "01234567897",
  codice_fiscale: "01234567897",
  forma_giuridica: "SRL",
  indirizzo_via: "Via Roma 1",
  indirizzo_cap: "00100",
  indirizzo_comune: "Roma",
  indirizzo_provincia: "RM",
  pec: "rossi@pec.it",
};
const SCHEDA_DELLA_PRIMA_FATTURA = {
  ...SCHEDA_VERA,
  ragione_sociale: "Da configurare",
  partita_iva: "00000000000",
  codice_fiscale: "00000000000",
  indirizzo_via: "Da configurare",
  indirizzo_cap: "00000",
  indirizzo_comune: "Da configurare",
  indirizzo_provincia: "XX",
};

describe("i segnaposto della prima fattura", () => {
  it("si riconoscono campo per campo: lo stesso valore in un altro campo non lo è", () => {
    expect(eSegnaposto("ragione_sociale", SEGNAPOSTO_SCHEDA.testo)).toBe(true);
    expect(eSegnaposto("partita_iva", SEGNAPOSTO_SCHEDA.partita_iva)).toBe(true);
    expect(eSegnaposto("indirizzo_cap", SEGNAPOSTO_SCHEDA.cap)).toBe(true);
    expect(eSegnaposto("indirizzo_provincia", SEGNAPOSTO_SCHEDA.provincia)).toBe(true);
    expect(eSegnaposto("partita_iva", SEGNAPOSTO_SCHEDA.testo)).toBe(false);
    expect(eSegnaposto("indirizzo_cap", "00100")).toBe(false);
    expect(eSegnaposto("ragione_sociale", "Rossi S.r.l.")).toBe(false);
    expect(eSegnaposto("ragione_sociale", null)).toBe(false);
    expect(eSegnaposto("pec", "Da configurare")).toBe(false);
  });

  it("nella pagina diventano campi vuoti; i dati veri restano", () => {
    expect(schedaDaMostrare(SCHEDA_DELLA_PRIMA_FATTURA)).toMatchObject({
      ragione_sociale: "", partita_iva: "", codice_fiscale: "", indirizzo_via: "", indirizzo_cap: "", indirizzo_comune: "", indirizzo_provincia: "",
      pec: "rossi@pec.it", forma_giuridica: "SRL",
    });
    expect(schedaDaMostrare(SCHEDA_VERA)).toEqual(SCHEDA_VERA);
    expect(schedaDaMostrare(null)).toEqual({});
  });

  it("l'avviso li elenca nell'ordine in cui i campi stanno nella pagina, con i nomi di un ufficio", () => {
    expect(campiProvvisori(SCHEDA_DELLA_PRIMA_FATTURA)).toEqual([
      "ragione sociale", "partita IVA (11 cifre)", "codice fiscale", "indirizzo della sede", "CAP (5 cifre)", "comune", "provincia (2 lettere)",
    ]);
    expect(campiProvvisori(SCHEDA_VERA)).toEqual([]);
    expect(campiProvvisori(null)).toEqual([]);
  });
});

describe("dal Profilo aziendale alla scheda fiscale", () => {
  const PROFILO = {
    name: "Rossi", business_name: "Rossi Costruzioni S.r.l.", vat_number: "IT 01234567897", fiscal_code: "rssmra80a01h501u",
    legal_address: "Via Roma 1", legal_city: "Roma", legal_province: "rm", legal_postal_code: "00100",
    pec: "rossi@pec.it", email: "info@rossi.it", phone: "+39 06 1234567", website: "https://www.rossi.it",
  };

  it("porta i dati che il profilo ha, nel formato della scheda (cifre, maiuscole)", () => {
    expect(schedaDalProfilo(PROFILO)).toEqual({
      ragione_sociale: "Rossi Costruzioni S.r.l.", partita_iva: "01234567897", codice_fiscale: "RSSMRA80A01H501U",
      indirizzo_via: "Via Roma 1", indirizzo_cap: "00100", indirizzo_comune: "Roma", indirizzo_provincia: "RM",
      pec: "rossi@pec.it", email: "info@rossi.it", telefono: "+39 06 1234567", sito_web: "https://www.rossi.it",
    });
  });

  it("senza ragione sociale usa il nome dell'azienda", () => {
    expect(schedaDalProfilo({ ...PROFILO, business_name: "  " }).ragione_sociale).toBe("Rossi");
  });

  it("lascia fuori ciò che il database rifiuterebbe: CAP di 4 cifre, provincia per esteso, partita IVA corta", () => {
    const dati = schedaDalProfilo({ ...PROFILO, legal_postal_code: "0010", legal_province: "Roma", vat_number: "0123456789", fiscal_code: "ABC" });
    expect(dati).not.toHaveProperty("indirizzo_cap");
    expect(dati).not.toHaveProperty("indirizzo_provincia");
    expect(dati).not.toHaveProperty("partita_iva");
    expect(dati).not.toHaveProperty("codice_fiscale");
  });

  it("non porta i campi vuoti (non devono nascondere ciò che l'utente sta per scrivere)", () => {
    expect(schedaDalProfilo({ name: "Rossi" })).toEqual({ ragione_sociale: "Rossi" });
    expect(schedaDalProfilo(null)).toEqual({});
    expect(schedaDalProfilo(undefined)).toEqual({});
  });
});

describe("cosa manca per creare la scheda", () => {
  it("con tutto a posto non manca niente", () => {
    expect(campiMancantiPerCreare(SCHEDA_VERA)).toEqual([]);
  });

  it("dice ogni campo che manca o è nel formato sbagliato, con il nome di un ufficio", () => {
    expect(campiMancantiPerCreare({})).toEqual([
      "ragione sociale", "partita IVA (11 cifre)", "codice fiscale", "forma giuridica", "indirizzo della sede", "CAP (5 cifre)", "comune", "provincia (2 lettere)",
    ]);
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, indirizzo_cap: "0010" })).toEqual(["CAP (5 cifre)"]);
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, partita_iva: "0123456789" })).toEqual(["partita IVA (11 cifre)"]);
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, indirizzo_provincia: "Roma" })).toEqual(["provincia (2 lettere)"]);
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, forma_giuridica: "" })).toEqual(["forma giuridica"]);
  });

  it("il codice fiscale vale se è di una società (11) o di una persona (16)", () => {
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, codice_fiscale: "RSSMRA80A01H501U" })).toEqual([]);
    expect(campiMancantiPerCreare({ ...SCHEDA_VERA, codice_fiscale: "RSSMRA80A01H" })).toEqual(["codice fiscale"]);
  });
});

describe("quando l'invio allo SDI si può attivare", () => {
  it("con partita IVA, ragione sociale e una PEC (o un'email) veri", () => {
    expect(datiBastanoPerAttivare(SCHEDA_VERA)).toBe(true);
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, pec: "", email: "info@rossi.it" })).toBe(true);
  });

  it("non con i segnaposto della prima fattura, anche se hanno la forma di una partita IVA", () => {
    expect(datiBastanoPerAttivare(SCHEDA_DELLA_PRIMA_FATTURA)).toBe(false);
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, partita_iva: "00000000000" })).toBe(false);
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, ragione_sociale: "Da configurare" })).toBe(false);
  });

  it("non senza contatto, senza ragione sociale o senza scheda", () => {
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, pec: "", email: "" })).toBe(false);
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, ragione_sociale: " " })).toBe(false);
    expect(datiBastanoPerAttivare({ ...SCHEDA_VERA, partita_iva: "123" })).toBe(false);
    expect(datiBastanoPerAttivare(null)).toBe(false);
  });
});

describe("l'errore di un salvataggio, in italiano", () => {
  it("una partita IVA o un codice fiscale sbagliati: la frase del controllo del database, che dice già cosa non va", () => {
    const frase = 'Partita IVA non valida: "01234567890". Devono essere 11 cifre e l\'ultima è di controllo: ricontrolla il numero.';
    expect(messaggioErroreSalvataggio({ code: "23514", message: frase })).toBe(frase);
  });

  it("un altro vincolo 23514 passa per la traduzione generica, non per il testo del database", () => {
    expect(messaggioErroreSalvataggio({ code: "23514", message: 'new row violates check constraint "chk_x"' })).toBe(
      "Alcuni dati non sono validi. Controlla i valori inseriti.",
    );
  });

  it("gli errori di rete e di permessi non arrivano grezzi", () => {
    expect(messaggioErroreSalvataggio(new Error("FetchError: Failed to fetch"))).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(messaggioErroreSalvataggio({ code: "42501", message: "permission denied for table x" })).toBe(
      "Non hai i permessi per questa operazione. Contatta l'amministratore.",
    );
  });

  it("un errore che non si riconosce dice di riprovare", () => {
    expect(messaggioErroreSalvataggio({ code: "XX999", message: "boh" })).toBe("Riprova tra poco.");
    expect(messaggioErroreSalvataggio(null)).toBe("Riprova tra poco.");
  });
});
