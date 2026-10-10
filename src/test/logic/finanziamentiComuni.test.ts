/**
 * Finanziamenti (10/10/2026): i pezzi in comune delle quattro pagine — la data all'italiana, il giorno di oggi
 * nel fuso del computer, se una tabella vale oggi e le frasi d'errore che non lasciano mai il testo tecnico.
 */
// Il fuso dell'Italia: è quello in cui «ieri» e «oggi» di notte sono diversi in UTC. Va scritto prima di ogni Date.
process.env.TZ = "Europe/Rome";

import { describe, expect, it } from "vitest";
import {
  conteggio,
  dataItaliana,
  erroreComprensibile,
  formattaEuro,
  formattaPercentuale,
  oggiLocale,
  scadeEntro,
  statoValidita,
} from "@/pages/azienda/settings/_finanziamenti/comuni";

describe("dataItaliana", () => {
  it("scrive gg/mm/aaaa, anche se dopo la data c'è l'ora", () => {
    expect(dataItaliana("2026-10-01")).toBe("01/10/2026");
    expect(dataItaliana("2026-11-15T00:00:00+00:00")).toBe("15/11/2026");
  });
  it("senza una data scrive un trattino", () => {
    expect(dataItaliana(null)).toBe("—");
    expect(dataItaliana(undefined)).toBe("—");
    expect(dataItaliana("")).toBe("—");
    expect(dataItaliana("domani")).toBe("—");
  });
});

describe("oggiLocale", () => {
  it("è il giorno del computer, non quello UTC: dopo mezzanotte in Italia è già il giorno nuovo", () => {
    // Le 23:30 UTC del 10 ottobre sono l'1:30 dell'11 ottobre a Roma (CEST = UTC+2).
    const notte = new Date("2026-10-10T23:30:00Z");
    expect(notte.toISOString().slice(0, 10)).toBe("2026-10-10");
    expect(oggiLocale(notte)).toBe("2026-10-11");
  });
  it("mette gli zeri a mese e giorno", () => {
    expect(oggiLocale(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("statoValidita", () => {
  const oggi = "2026-10-10";
  it("scaduta se la scadenza è passata", () => {
    expect(statoValidita(null, "2026-10-09", oggi)).toBe("scaduta");
    expect(statoValidita("2026-01-01", "2026-09-30", oggi)).toBe("scaduta");
  });
  it("il giorno della scadenza vale ancora", () => {
    expect(statoValidita(null, "2026-10-10", oggi)).toBe("valida");
  });
  it("futura se la decorrenza non è ancora arrivata", () => {
    expect(statoValidita("2026-10-11", null, oggi)).toBe("futura");
    expect(statoValidita("2026-10-11", "2027-01-01", oggi)).toBe("futura");
  });
  it("valida dentro le date, aperta senza date", () => {
    expect(statoValidita("2026-10-01", "2026-12-31", oggi)).toBe("valida");
    expect(statoValidita("2026-10-10", null, oggi)).toBe("valida");
    expect(statoValidita(null, null, oggi)).toBe("aperta");
  });
});

describe("scadeEntro", () => {
  const oggi = "2026-10-10";
  it("conta da oggi fino a 30 giorni dopo, estremi compresi", () => {
    expect(scadeEntro("2026-10-10", 30, oggi)).toBe(true);
    expect(scadeEntro("2026-11-09", 30, oggi)).toBe(true);
    expect(scadeEntro("2026-11-10", 30, oggi)).toBe(false);
  });
  it("una scaduta o senza scadenza non è «in scadenza»", () => {
    expect(scadeEntro("2026-10-09", 30, oggi)).toBe(false);
    expect(scadeEntro(null, 30, oggi)).toBe(false);
  });
  it("il cambio dell'ora (25/10/2026) non sposta i giorni", () => {
    expect(scadeEntro("2026-11-09", 30, "2026-10-10")).toBe(true);
    expect(scadeEntro("2026-10-30", 5, "2026-10-25")).toBe(true);
    expect(scadeEntro("2026-10-31", 5, "2026-10-25")).toBe(false);
  });
});

describe("numeri all'italiana", () => {
  it("euro con il punto delle migliaia e la virgola dei decimali", () => {
    expect(formattaEuro(30000)).toBe("30.000");
    expect(formattaEuro(140, 2)).toBe("140,00");
    expect(formattaEuro(1234.5, 2)).toBe("1234,50"); // l'italiano non mette il punto sotto le cinque cifre
    expect(formattaEuro(Number.NaN)).toBe("0");
  });
  it("percentuale con la virgola", () => {
    expect(formattaPercentuale(8.875)).toBe("8,88%");
    expect(formattaPercentuale(10.06)).toBe("10,06%");
  });
  it("singolare e plurale", () => {
    expect(conteggio(1, "tabella", "tabelle")).toBe("1 tabella");
    expect(conteggio(0, "tabella", "tabelle")).toBe("0 tabelle");
    expect(conteggio(10, "attiva", "attive")).toBe("10 attive");
  });
});

describe("erroreComprensibile", () => {
  it("le frasi scritte dalle pagine e da queries.ts, già in italiano, passano così come sono", () => {
    const frase = "Questa tabella è già usata in progetti/preventivi. Disattivala per impedirne nuovi utilizzi senza perdere lo storico.";
    expect(erroreComprensibile(new Error(frase), "Riprova.")).toBe(frase);
    expect(erroreComprensibile(new Error("La data di scadenza non può essere precedente alla decorrenza"), "Riprova.")).toBe(
      "La data di scadenza non può essere precedente alla decorrenza",
    );
  });
  it("un errore del database non arriva mai a schermo com'è", () => {
    const errore = {
      code: "23503",
      message: 'update or delete on table "eic_tabelle_finanziamento" violates foreign key constraint "x_fkey" on table "y"',
    };
    const frase = erroreComprensibile(errore, "Riprova.");
    expect(frase).toBe("Impossibile completare: l'elemento è collegato ad altri dati.");
    expect(frase).not.toMatch(/violates|constraint|eic_/i);
  });
  it("la rete che cade diventa «Connessione persa», anche se l'errore è un Error semplice", () => {
    expect(erroreComprensibile(new Error("Failed to fetch"), "Riprova.")).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(erroreComprensibile(new TypeError("Failed to fetch"), "Riprova.")).toBe("Connessione persa. Controlla la rete e riprova.");
  });
  it("un Error semplice con un testo del database inglese non passa", () => {
    expect(erroreComprensibile(new Error("duplicate key value violates unique constraint"), "Riprova.")).toBe(
      "Esiste già un elemento con questi dati. Controlla e riprova.",
    );
  });
  it("l'errore di una funzione dice solo «non-2xx»: conta lo stato della risposta", () => {
    class FunctionsHttpError extends Error {
      context = { status: 502 };
    }
    const errore = new FunctionsHttpError("Edge Function returned a non-2xx status code");
    expect(erroreComprensibile(errore, "Riprova.")).toBe("Errore temporaneo del server. Riprova tra qualche istante.");
    class Pagamento extends Error {
      context = { status: 402 };
    }
    // niente di riconosciuto: la frase di ripiego, mai «non-2xx»
    expect(erroreComprensibile(new Pagamento("Edge Function returned a non-2xx status code"), "Riprova tra poco.")).toBe("Riprova tra poco.");
  });
  it("di un errore sconosciuto resta la frase di ripiego", () => {
    expect(erroreComprensibile(undefined, "Riprova tra poco.")).toBe("Riprova tra poco.");
    expect(erroreComprensibile({ qualcosa: 1 }, "Riprova tra poco.")).toBe("Riprova tra poco.");
  });
});
