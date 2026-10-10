/**
 * Gli errori delle funzioni che gestiscono le persone si leggono in italiano (09/10/2026).
 *
 * reset-customer-password risponde «Permission denied: Only admins can reset
 * passwords»; la pagina lo mostrava così, in un avviso rosso. Le frasi sono
 * quelle vere che la funzione può dire.
 */
import { describe, expect, it } from "vitest";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";

const RIPIEGO = "Riprova tra un attimo.";

describe("messaggioErrorePersone", () => {
  it.each([
    ["Permission denied: Only admins can reset passwords", "Solo un amministratore può cambiare la password di un'altra persona."],
    ["Permission denied: Cannot reset another admin's password", "La password di un altro amministratore non si cambia da qui."],
    ["Permission denied: Cannot reset password for users in other companies", "Questa persona è di un'altra azienda: la sua password non si cambia da qui."],
    ["Permission denied: Cannot reset the password of a multi-company administrator", "È un amministratore con accesso a più aziende: la sua password la cambia solo la piattaforma."],
    ["Cannot reset super admin password", "La password di un super admin non si cambia da qui."],
    ["Target user has no role", "Questa persona non ha un ruolo: assegnaglielo prima."],
    ["User not found", "Persona non trovata."],
    ["Only company admins can create staff users", "Solo un amministratore può creare nuovi utenti."],
    ["Template not found", "Questo modello non esiste più: ricarica la pagina."],
    ["User not in your company", "Questa persona non è di questa azienda."],
    ["Cannot edit this template", "I modelli di sistema non si possono modificare."],
    ["Cannot delete this template", "I modelli di sistema non si possono eliminare."],
    ["No company found", "Non trovo l'azienda: ricarica la pagina e riprova."],
    ["Failed to update password: weak", "Non sono riuscito a cambiare la password. Riprova tra un attimo."],
    ["Unauthorized", "Sessione scaduta. Accedi di nuovo per continuare."],
    ["Non autorizzato", "Sessione scaduta. Accedi di nuovo per continuare."],
    ["Edge Function returned a non-2xx status code", "L'operazione non è riuscita. Riprova tra un attimo."],
  ])("«%s»", (grezzo, atteso) => {
    expect(messaggioErrorePersone(grezzo, RIPIEGO)).toBe(atteso);
    expect(messaggioErrorePersone(new Error(grezzo), RIPIEGO)).toBe(atteso);
    expect(messaggioErrorePersone({ message: grezzo }, RIPIEGO)).toBe(atteso);
  });

  it("una frase già in italiano passa com'è (le funzioni nuove rispondono così)", () => {
    expect(messaggioErrorePersone("I permessi non sono stati salvati: il database non ha confermato. Ricarica la pagina e riprova.", RIPIEGO))
      .toBe("I permessi non sono stati salvati: il database non ha confermato. Ricarica la pagina e riprova.");
    expect(messaggioErrorePersone("È l'ultimo amministratore dell'azienda: nomina prima un altro amministratore.", RIPIEGO))
      .toBe("È l'ultimo amministratore dell'azienda: nomina prima un altro amministratore.");
  });

  it("un errore inglese che non conosciamo non si mostra: ripiego (o la frase generica per rete e permessi)", () => {
    expect(messaggioErrorePersone("Something exploded in the database", RIPIEGO)).toBe(RIPIEGO);
    expect(messaggioErrorePersone("duplicate key value violates unique constraint", RIPIEGO)).toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
    expect(messaggioErrorePersone(new TypeError("Failed to fetch"), RIPIEGO)).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(messaggioErrorePersone("Cannot do the thing", RIPIEGO)).toBe(RIPIEGO);
  });

  it("senza messaggio: il ripiego", () => {
    expect(messaggioErrorePersone(undefined, RIPIEGO)).toBe(RIPIEGO);
    expect(messaggioErrorePersone(null, RIPIEGO)).toBe(RIPIEGO);
    expect(messaggioErrorePersone("   ", RIPIEGO)).toBe(RIPIEGO);
    expect(messaggioErrorePersone({}, RIPIEGO)).toBe(RIPIEGO);
  });
});
