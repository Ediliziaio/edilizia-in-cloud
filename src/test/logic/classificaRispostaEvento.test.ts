/**
 * Risposte agli inviti di un evento: il tag nasce solo da frasi chiare o da un'AI senza equivoci.
 */
import { describe, expect, it } from "vitest";
import {
  classificaConParole,
  esitoAIConControllo,
  esitoDaAI,
  impostazioniClassifica,
} from "../../../supabase/functions/_shared/classificaRispostaEvento";

describe("classificaConParole", () => {
  it.each([
    "Non sono interessato, grazie",
    "Troppo lontano grazie",
    "La ringrazio molto ma non riesco. Buon pomeriggio",
    "Non riesco mi dispiace",
    "Purtroppo devo dire di no per un impegno",
    "Purtroppo non sarà possibile, sarà per la prossima volta",
    "Grazie ma nn riesco",
    "No pozo",
    "Divano già preso 🤗",
    "Ciao Roberta, ma lo abbiamo già visto sabato",
    "non mi interessa",
    "No grazie",
    "Purtroppo non vengo",
    "Non potrò venire, mi dispiace",
    "Disdico",
    "Toglietemi dalla lista per favore",
    "Non scrivetemi più",
  ])("rifiuto: %s", (t) => expect(classificaConParole(t)).toBe("no"));

  it.each(["Confermo!", "Sì", "Sì, ci sono", "Sì vorrei venire", "ok ci saremo", "Verrò volentieri"])(
    "conferma: %s",
    (t) => expect(classificaConParole(t)).toBe("si"),
  );

  it.each([
    "Non so se ci sono",
    "Ok grazie",
    "Ciao Roberta lo trovo bellissimo! Io però sono su Pavia",
    "Sì ma devo chiedere a mio marito",
    "Perfetto, a stasera",
    "A che ora inizia?",
    "forse",
    "👍",
    "Posso portare un amico?",
    "",
    null,
  ])("dubbio, serve l'AI o niente: %s", (t) => expect(classificaConParole(t as string | null)).toBeNull());

  it("il rifiuto vince sulla conferma", () => {
    expect(classificaConParole("Ok ma non vengo")).toBe("no");
  });
});

describe("esitoAIConControllo", () => {
  it("un sì dell'AI senza segno di presenza non vale", () => {
    expect(esitoAIConControllo("si", "Ok grazie")).toBe("altro");
    expect(esitoAIConControllo("si", "Penso in due")).toBe("si");
    expect(esitoAIConControllo("si", "Va bene, è possibile domani verso le 14?")).toBe("si");
    expect(esitoAIConControllo("no", "Ok grazie")).toBe("no");
  });
});

describe("esitoDaAI", () => {
  it("accetta solo si e no", () => {
    expect(esitoDaAI("si")).toBe("si");
    expect(esitoDaAI(" No. ")).toBe("no");
    expect(esitoDaAI("altro")).toBe("altro");
    expect(esitoDaAI("Penso di sì")).toBe("altro");
    expect(esitoDaAI(null)).toBe("altro");
  });
});

describe("impostazioniClassifica", () => {
  it("serve tutto o niente", () => {
    expect(impostazioniClassifica(null)).toBeNull();
    expect(impostazioniClassifica({})).toBeNull();
    expect(impostazioniClassifica({ classifica_risposte: { tag_filtro: "a", tag_si: "b" } })).toBeNull();
    expect(impostazioniClassifica({ classifica_risposte: { tag_filtro: "a", tag_si: "b", tag_no: "c" } })).toEqual({
      tag_filtro: "a",
      tag_si: "b",
      tag_no: "c",
    });
  });
});
