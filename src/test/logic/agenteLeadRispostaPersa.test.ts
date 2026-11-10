/**
 * L'assistente WhatsApp dei lead non deve restare muto (10/11/2026).
 *
 * Il caso vero, Il Bagno Group: il 07/11 alle 08:35 Silvana scrive «non ho
 * ancora le chiavi, faccio il rogito al 20 di novembre». Il modello risponde
 * con 176 token: dentro c'è la frase per lei E la chiamata a salva_risposte.
 * Il codice teneva solo la chiamata e richiedeva la risposta: il modello,
 * che l'aveva già scritta, rispondeva vuoto (2 token). A Silvana non arriva
 * niente, e la chat muore lì. Stessa cosa il 09/11 con Andrea, due volte.
 * Dal 28/09 è successo a 18 contatti su 56.
 */
import { describe, expect, it } from "vitest";
import { rispostaDelModello, type MsgLlm, type ToolCallLlm } from "../../../supabase/functions/lead-agente-whatsapp/giroStrumenti";

const salvaRisposte: ToolCallLlm = {
  id: "t1",
  function: { name: "salva_risposte", arguments: '{"tempistica":"dopo il 20 novembre"}' },
};
const prenota: ToolCallLlm = {
  id: "t2",
  function: { name: "prenota_chiamata", arguments: '{"data":"2026-11-12","ora":"10:30"}' },
};

function giro(turni: MsgLlm[], esiti: Array<{ ok: boolean }> = []) {
  const chieste: Array<"auto" | "none"> = [];
  const eseguiti: string[] = [];
  let i = 0;
  let e = 0;
  return {
    chieste,
    eseguiti,
    run: () => rispostaDelModello({
      maxGiri: 5,
      chiedi: (scelta) => {
        chieste.push(scelta);
        return Promise.resolve(turni[i++] ?? { content: null });
      },
      annotaRichiesta: () => {},
      esegui: (tc) => {
        eseguiti.push(tc.function.name);
        return Promise.resolve(esiti[e++] ?? { ok: true });
      },
    }),
  };
}

describe("agente lead: la risposta scritta insieme allo strumento non si perde", () => {
  it("il caso di Silvana: testo + salva_risposte, poi il modello non ha più niente da dire", async () => {
    const g = giro([
      { content: "Capito, dopo il rogito. Un'ultima domanda: c'è un motivo che ti spinge a fare il lavoro?", tool_calls: [salvaRisposte] },
      { content: "" },
      { content: "" },
    ]);
    await expect(g.run()).resolves.toBe(
      "Capito, dopo il rogito. Un'ultima domanda: c'è un motivo che ti spinge a fare il lavoro?",
    );
    expect(g.eseguiti).toEqual(["salva_risposte"]);
  });

  it("se dopo lo strumento il modello parla davvero, vince quello che dice dopo", async () => {
    const g = giro([
      { content: "Un attimo che guardo il calendario.", tool_calls: [salvaRisposte] },
      { content: "Ho mercoledì alle 14:30 o alle 15:30: quale preferisci?" },
    ]);
    await expect(g.run()).resolves.toBe("Ho mercoledì alle 14:30 o alle 15:30: quale preferisci?");
    // La risposta è arrivata dal giro con gli strumenti: nessun tentativo in più.
    expect(g.chieste).toEqual(["auto", "auto"]);
  });

  it("se la prenotazione fallisce, NON si conferma al cliente un appuntamento che non esiste", async () => {
    const g = giro(
      [
        { content: "Perfetto, ti ho fissato giovedì alle 10:30.", tool_calls: [prenota] },
        { content: "" },
        { content: "" },
      ],
      [{ ok: false }],
    );
    await expect(g.run()).resolves.toBeFalsy();
  });

  it("senza strumenti resta com'era: si manda quello che scrive il modello", async () => {
    const g = giro([{ content: "Ciao Andrea, in che zona devi fare il lavoro?" }]);
    await expect(g.run()).resolves.toBe("Ciao Andrea, in che zona devi fare il lavoro?");
    expect(g.chieste).toEqual(["auto"]);
  });

  it("se il modello non dice proprio niente, il lead non riceve un messaggio vuoto", async () => {
    const g = giro([{ content: "", tool_calls: [salvaRisposte] }, { content: "" }, { content: null }]);
    await expect(g.run()).resolves.toBeFalsy();
  });
});
