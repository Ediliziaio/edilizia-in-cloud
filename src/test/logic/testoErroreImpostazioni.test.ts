/**
 * La frase che si vede quando, nelle impostazioni, un'azione non riesce (10/10/2026).
 * Prima si mostrava `err.message` com'era: «Failed to fetch», i testi del database.
 */
import { describe, expect, it } from "vitest";
import { testoErrore } from "@/lib/impostazioni/testoErrore";

describe("testoErrore", () => {
  it("la rete che manca si dice in italiano", () => {
    expect(testoErrore(new TypeError("Failed to fetch"))).toBe("Connessione persa. Controlla la rete e riprova.");
  });

  it("un permesso negato dal database non mostra il testo del database", () => {
    expect(testoErrore({ code: "42501", message: 'new row violates row-level security policy for table "x"' }))
      .toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("una modifica che il database ignora (PGRST116) dice che non è cambiato niente", () => {
    expect(testoErrore({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, "Voce non salvata."))
      .toBe("Voce non salvata. Non è stato cambiato niente: forse non hai il permesso, o l'elemento non esiste più.");
  });

  it("un messaggio scritto da noi in italiano si legge com'è", () => {
    expect(testoErrore(new Error("Troppe righe in un singolo batch (max 5000)"))).toBe("Troppe righe in un singolo batch (max 5000)");
    expect(testoErrore("Nessuna azienda associata all'utente")).toBe("Nessuna azienda associata all'utente");
  });

  it("il testo di una libreria o del browser non si mostra: si dice di riprovare", () => {
    expect(testoErrore(new TypeError("Cannot read properties of undefined (reading 'sheet')"))).toBe("Riprova tra poco.");
    expect(testoErrore({ message: "PGRST204: Could not find the 'x' column" })).toBe("Riprova tra poco.");
  });

  it("la frase di apertura si mette davanti solo se c'è", () => {
    expect(testoErrore(new TypeError("Cannot read properties of undefined"), "Importazione non riuscita.")).toBe("Importazione non riuscita. Riprova tra poco.");
    expect(testoErrore(new TypeError("Failed to fetch"), "Importazione non riuscita.")).toBe("Importazione non riuscita. Connessione persa. Controlla la rete e riprova.");
  });

  it("il testo inglese di una funzione o di un server non si mostra", () => {
    expect(testoErrore(new Error("Edge Function returned a non-2xx status code"))).toBe("Riprova tra poco.");
    expect(testoErrore(new Error("Bad Request"), "Importazione non riuscita.")).toBe("Importazione non riuscita. Riprova tra poco.");
    expect(testoErrore(new Error("Invalid API key"))).toBe("Riprova tra poco.");
    expect(testoErrore(new Error('column "x" of relation "y" does not exist'))).toBe("Riprova tra poco.");
    // un file Excel vecchio o rotto: il testo della libreria che lo legge
    expect(testoErrore(new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"))).toBe("Riprova tra poco.");
    // le frasi italiane con l'apostrofo si leggono ancora
    expect(testoErrore(new Error("Nessun'azienda associata all'utente"))).toBe("Nessun'azienda associata all'utente");
  });

  it("un oggetto con un messaggio scritto da noi si legge com'è", () => {
    expect(testoErrore({ message: "Il prodotto è usato in un preventivo firmato" })).toBe("Il prodotto è usato in un preventivo firmato");
    expect(testoErrore({ message: "PGRST204: Could not find the 'x' column" })).toBe("Riprova tra poco.");
  });

  it("senza niente da dire resta la frase generica", () => {
    expect(testoErrore(null)).toBe("Riprova tra poco.");
    expect(testoErrore(undefined, "Non salvato.")).toBe("Non salvato. Riprova tra poco.");
  });
});
