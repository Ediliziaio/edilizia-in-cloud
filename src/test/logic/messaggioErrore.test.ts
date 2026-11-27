import { describe, expect, it } from "vitest";
import { messaggioErrore, messaggioErroreCompleto, testoGrezzoErrore } from "@/lib/messaggioErrore";
import { RIPIEGO_ERRORE } from "@/lib/silvio-commessa/testoErrore";

// Il PostgrestError che un'impresa cliente ha visto come «[object Object]» il 27/11/2026.
const CASO_27_11: { message: string; code: string; details: string | null; hint: string | null } = {
  message: "Questa fattura è stata incassata dallo scadenzario: annulla prima l'incasso dallo scadenzario.",
  code: "23514",
  details: null,
  hint: null,
};

describe("messaggioErrore", () => {
  it("il messaggio italiano del database (23514) passa intatto", () => {
    expect(messaggioErrore(CASO_27_11)).toBe(CASO_27_11.message);
  });

  it("anche con P0001, 42501 e P0002 il messaggio italiano non si tocca", () => {
    for (const code of ["P0001", "42501", "P0002"]) {
      expect(messaggioErrore({ message: "Non hai il permesso «Fatture → modifica».", code, details: null, hint: null }))
        .toBe("Non hai il permesso «Fatture → modifica».");
    }
  });

  it("aggiunge details e hint quando dicono qualcosa di più", () => {
    expect(messaggioErrore({ message: "Fattura già chiusa", code: "P0001", details: "La rata è stata pagata il 03/11.", hint: "Riaprila dallo scadenzario." }))
      .toBe("Fattura già chiusa. La rata è stata pagata il 03/11. Riaprila dallo scadenzario.");
  });

  it("non aggiunge details tecnici", () => {
    expect(messaggioErrore({ message: "Fattura già chiusa.", code: "P0001", details: "Key (id)=(1) is still referenced from table \"x\".", hint: null }))
      .toBe("Fattura già chiusa.");
  });

  it("un Error dà il suo messaggio", () => {
    expect(messaggioErrore(new Error("Commessa non trovata"))).toBe("Commessa non trovata");
  });

  it("una stringa passa com'è", () => {
    expect(messaggioErrore("Manca la data del documento")).toBe("Manca la data del documento");
  });

  it("un oggetto vuoto, null e undefined danno il ripiego, mai [object Object]", () => {
    expect(messaggioErrore({})).toBe(RIPIEGO_ERRORE);
    expect(messaggioErrore(null)).toBe(RIPIEGO_ERRORE);
    expect(messaggioErrore(undefined, "Non salvato")).toBe("Non salvato");
    expect(messaggioErrore(new Error(String({})))).toBe(RIPIEGO_ERRORE);
    expect(messaggioErrore("undefined")).toBe(RIPIEGO_ERRORE);
  });

  it("niente JSON grezzo: di un JSON si prende il messaggio", () => {
    expect(messaggioErrore('{"error":"Credito AI esaurito"}')).toBe("Credito AI esaurito");
    expect(messaggioErrore('{"foo":1}')).toBe(RIPIEGO_ERRORE);
    expect(messaggioErrore({ error: "Documento già firmato" })).toBe("Documento già firmato");
    expect(messaggioErrore({ error: { message: "Documento già firmato" } })).toBe("Documento già firmato");
  });

  it("il timeout del database diventa una frase italiana", () => {
    const m = messaggioErrore({ message: "canceling statement due to statement timeout", code: "57014", details: null, hint: null });
    expect(m).not.toMatch(/canceling|statement/i);
    expect(m).toMatch(/tempo|riprova/i);
  });

  it("permission denied e violates diventano frasi italiane", () => {
    expect(messaggioErrore({ message: "permission denied for table invoices", code: "42501" })).toMatch(/permess/i);
    expect(messaggioErrore({ message: 'insert or update on table "x" violates foreign key constraint "y"', code: "23503" }))
      .toMatch(/collegato/i);
    expect(messaggioErrore({ message: 'new row for relation "x" violates check constraint "y"', code: "23514" }))
      .toMatch(/non sono validi/i);
  });

  it("gli errori del browser seguono le regole di erroreLeggibile", () => {
    expect(messaggioErrore(new TypeError("Failed to fetch"))).toMatch(/Connessione/);
    expect(messaggioErrore(new Error("Edge Function returned a non-2xx status code"))).toBe(RIPIEGO_ERRORE);
    expect(messaggioErrore(new TypeError("Cannot read properties of undefined (reading 'x')"), "Non riuscito")).toBe("Non riuscito");
  });

  it("FunctionsHttpError con il corpo già letto in context: parla il corpo", () => {
    const e = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: { error: "Il mese è già chiuso" } });
    expect(messaggioErrore(e)).toBe("Il mese è già chiuso");
  });

  it("FunctionsHttpError con una Response in context: la versione completa legge il JSON", async () => {
    const e = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Il mese è già chiuso" }), { status: 400 }),
    });
    expect(messaggioErrore(e)).toBe(RIPIEGO_ERRORE);
    expect(await messaggioErroreCompleto(e)).toBe("Il mese è già chiuso");
  });
});

describe("testoGrezzoErrore", () => {
  it("non traduce: serve a riconoscere l'errore", () => {
    expect(testoGrezzoErrore(new Error("NotAllowedError: Permission denied"))).toBe("NotAllowedError: Permission denied");
    expect(testoGrezzoErrore({ message: "duplicate key value violates unique constraint" })).toBe("duplicate key value violates unique constraint");
  });

  it("mai [object Object]", () => {
    expect(testoGrezzoErrore({})).toBe(RIPIEGO_ERRORE);
    expect(testoGrezzoErrore({}, "")).toBe("");
  });
});
