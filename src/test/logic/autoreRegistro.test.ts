import { describe, it, expect } from "vitest";
import { autoreAzione, etichettaAttivita, nomeFlussoDaTesto } from "@/lib/marketing/autoreRegistro";

// 18/09/2026: nel registro non si capiva chi avesse mosso una scheda. Ora ogni
// riga ha un autore — persona o automazione — e un nome in italiano.
describe("registro attività: chi ha fatto cosa", () => {
  const nomi = new Map([["u1", "Venusia BeMade"]]);

  it("i tipi di attività si leggono in italiano", () => {
    expect(etichettaAttivita("stage_changed")).toBe("Fase cambiata");
    expect(etichettaAttivita("opportunity_deleted")).toBe("Opportunità nel cestino");
    expect(etichettaAttivita("opportunity_restored")).toBe("Opportunità ripristinata");
    expect(etichettaAttivita("lead_form_submission")).toBe("Nuova richiesta dal modulo");
    // Tipo nuovo, mai visto: si legge lo stesso, senza trattini bassi.
    expect(etichettaAttivita("qualcosa_di_nuovo")).toBe("Qualcosa di nuovo");
    expect(etichettaAttivita(null)).toBe("Attività");
  });

  it("la persona si riconosce dall'id, anche se non è più in squadra", () => {
    expect(autoreAzione({ agentId: "u1", nomi })).toEqual({ nome: "Venusia BeMade", automatica: false });
    expect(autoreAzione({ agentId: "u9", nomi })).toEqual({ nome: "un utente non più in squadra", automatica: false });
    expect(autoreAzione({ agentName: "Agente AI", nomi })).toEqual({ nome: "Agente AI", automatica: false });
  });

  it("senza utente è il sistema, e se la nota nomina il flusso lo dice", () => {
    expect(autoreAzione({ agentId: null, nomi })).toEqual({ nome: "Automazione", automatica: true });
    expect(
      autoreAzione({
        agentId: null,
        testo: "L'automazione «FB - Nuovo» ha ritrovato questa opportunità aperta in «Non risponde»: non ne ha creata un'altra.",
        nomi,
      }),
    ).toEqual({ nome: "Automazione «FB - Nuovo»", automatica: true });
  });

  it("il nome del flusso si pesca solo dove c'è davvero", () => {
    expect(nomeFlussoDaTesto("L'automazione «Sito - Nuovo» ha ritrovato…")).toBe("Sito - Nuovo");
    expect(nomeFlussoDaTesto("Ha compilato di nuovo il modulo di Facebook")).toBeNull();
    expect(nomeFlussoDaTesto(null)).toBeNull();
  });
});
