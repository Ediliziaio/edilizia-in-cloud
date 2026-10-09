// src/test/ui/modelliErroriInItaliano.test.ts
// I rifiuti che il titolare può causare si leggono in italiano; gli errori tecnici (rete, errori interni) non arrivano col
// loro testo («Failed to fetch», «connection reset»…): una frase che dice cosa fare.
import { describe, expect, it } from "vitest";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { messaggioModelloPagamento } from "@/hooks/useModelliPagamento";

/** Errori tecnici e quello che deve leggere il titolare al loro posto (userErrorMessage). */
const tecnici: [unknown, string][] = [
  [{ message: "Failed to fetch" }, "Connessione persa. Controlla la rete e riprova."],
  [new TypeError("NetworkError when attempting to fetch resource."), "Connessione persa. Controlla la rete e riprova."],
  [{ code: "PGRST301", message: "JWT expired" }, "Sessione scaduta. Accedi di nuovo per continuare."],
  [{ code: "XX000", message: "connection reset by peer" }, "Operazione non riuscita. Riprova tra poco."],
];

describe.each([
  ["modelli di fasi", (e: unknown) => messaggioModello(e), "Non hai il permesso di modificare i modelli di fasi."],
  ["modelli di pagamento", (e: unknown) => messaggioModelloPagamento(e), "Non hai il permesso di modificare i modelli di pagamento."],
])("%s", (_nome, messaggio, permesso) => {
  it("un errore tecnico dice cosa fare, senza il suo testo", () => {
    for (const [errore, atteso] of tecnici) {
      expect(messaggio(errore)).toBe(atteso);
    }
    expect(messaggio(null)).toBe("Operazione non riuscita. Riprova tra poco.");
    expect(messaggio(undefined)).toBe("Operazione non riuscita. Riprova tra poco.");
  });

  it("il permesso mancante e il nome già usato hanno la loro frase", () => {
    expect(messaggio({ code: "42501", message: "permission denied" })).toBe(permesso);
    expect(messaggio({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("Esiste già un modello con questo nome.");
  });

  it("i controlli del database, che rispondono già in italiano, si leggono com'è", () => {
    expect(messaggio({ code: "22023", message: "Dai un nome al modello (massimo 80 caratteri)." })).toBe("Dai un nome al modello (massimo 80 caratteri).");
    expect(messaggio({ code: "P0002", message: "Modello non trovato." })).toBe("Modello non trovato.");
  });
});
