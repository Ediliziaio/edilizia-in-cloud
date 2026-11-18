import { describe, it, expect } from "vitest";

/**
 * «Invio allo SDI non riuscito: dati fiscali non validi» senza dire QUALI (18/11/2026).
 *
 * I controlli di `invia-sdi` rispondono 422 con l'elenco in `details`; il messaggio mostrato a chi preme
 * «Invia allo SDI» prendeva solo `error` e buttava via l'elenco. Un'impresa ha passato il pomeriggio a
 * ricontrollare partita IVA e codice fiscale del cliente, che erano giusti: mancavano numero REA e capitale
 * sociale della PROPRIA azienda, e nessuno glielo diceva.
 */
import { motivoDellaRisposta } from "@/hooks/useInvioSdi";

const rispostaConCorpo = (status: number, corpo: unknown) =>
  Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: { status, json: async () => corpo } as unknown as Response,
  });

describe("il motivo di un invio allo SDI rifiutato", () => {
  it("dice che cosa manca, non solo che qualcosa manca", async () => {
    const esito = await motivoDellaRisposta(rispostaConCorpo(422, {
      error: "Dati fiscali non validi",
      details: [
        "Numero REA mancante: per le società va indicato in fattura (art. 2250 c.c.).",
        "Capitale sociale versato mancante: per S.r.l. e S.p.A. va indicato in fattura (art. 2250 c.c.).",
      ],
    }));
    expect(esito.status).toBe(422);
    expect(esito.messaggio).toContain("Dati fiscali non validi");
    expect(esito.messaggio).toContain("Numero REA mancante");
    expect(esito.messaggio).toContain("Capitale sociale versato mancante");
  });

  it("senza elenco resta il messaggio di prima, senza due punti a vuoto", async () => {
    const esito = await motivoDellaRisposta(rispostaConCorpo(409, { error: "Documento già trasmesso" }));
    expect(esito.messaggio).toBe("Documento già trasmesso");
  });

  it("un elenco con dentro qualcosa che non è testo non rompe il messaggio", async () => {
    const esito = await motivoDellaRisposta(rispostaConCorpo(422, {
      error: "Dati fiscali non validi",
      details: ["CAP del cliente mancante o non valido: servono 5 cifre", null, 7, "  "],
    }));
    expect(esito.messaggio).toBe("Dati fiscali non validi: CAP del cliente mancante o non valido: servono 5 cifre");
  });

  it("un corpo illeggibile lascia il messaggio generico", async () => {
    const rotto = Object.assign(new Error("Operazione non riuscita"), {
      context: { status: 500, json: async () => { throw new Error("non è JSON"); } } as unknown as Response,
    });
    expect((await motivoDellaRisposta(rotto)).messaggio).toBe("Operazione non riuscita");
  });
});
