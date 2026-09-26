import { describe, expect, it } from "vitest";
import { messaggiRiepilogo, notaRiepilogo } from "../../../supabase/functions/_shared/riepilogoChatLead";

const DATI = {
  nomeAzienda: "Il Bagno Group",
  nomeContatto: "Florin Andriciuc",
  qualificazione: { zona: "Milano", intervento: "Ristrutturazione bagno", tempistica: "", altro: "x" },
  esito: "Chiamata fissata lunedì 28 settembre 2026 alle 13:00",
  chat: [
    { role: "user" as const, content: "Ciao vorrei informazioni per il bagno" },
    { role: "assistant" as const, content: "Ciao! In quale zona?" },
    { role: "user" as const, content: "  " },
  ],
};

describe("riepilogo della chat negli appunti", () => {
  it("dà all'AI la chat, le risposte salvate e l'esito, e le vieta di inventare", () => {
    const [sistema, utente] = messaggiRiepilogo(DATI);
    expect(sistema.content).toContain("Il Bagno Group");
    expect(sistema.content).toContain("Non inventare");
    expect(utente.content).toContain("Cliente: Ciao vorrei informazioni per il bagno");
    expect(utente.content).toContain("Assistente: Ciao! In quale zona?");
    expect(utente.content).toContain("Risposte salvate: zona: Milano; intervento: Ristrutturazione bagno");
    expect(utente.content).not.toContain("tempistica:");
    expect(utente.content).not.toContain("altro");
    expect(utente.content).toContain("Esito: Chiamata fissata");
  });

  it("la nota dice chi l'ha scritta e l'esito, con righe a trattino e senza markdown", () => {
    const nota = notaRiepilogo("**Richiesta**: rifare il bagno\n\n- Zona: Milano", "Chiamata fissata");
    expect(nota.split("\n")).toEqual([
      "Riepilogo della chat WhatsApp (scritto dall'assistente AI)",
      "Esito: Chiamata fissata",
      "- Richiesta: rifare il bagno",
      "- Zona: Milano",
    ]);
  });
});
