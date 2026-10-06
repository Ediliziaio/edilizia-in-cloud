/**
 * Risposte agli inviti di un evento: il tag nasce solo da frasi chiare o da un'AI senza equivoci.
 */
import { describe, expect, it } from "vitest";
import {
  classificaConParole,
  esitoDaAI,
  impostazioniClassifica,
} from "../../../supabase/functions/_shared/classificaRispostaEvento";

describe("classificaConParole", () => {
  it.each([
    "Non sono interessato, grazie",
    "non mi interessa",
    "No grazie",
    "Purtroppo non vengo",
    "Non potrò venire, mi dispiace",
    "Disdico",
    "Toglietemi dalla lista per favore",
    "Non scrivetemi più",
  ])("rifiuto: %s", (t) => expect(classificaConParole(t)).toBe("no"));

  it.each(["Confermo!", "Sì, ci sono", "ok ci saremo", "Perfetto, a stasera", "Verrò volentieri"])(
    "conferma: %s",
    (t) => expect(classificaConParole(t)).toBe("si"),
  );

  it.each([
    "Non so se ci sono",
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
