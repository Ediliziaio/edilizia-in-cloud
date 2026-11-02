import { describe, expect, it } from "vitest";
import { fraseErroreRender } from "@/lib/planimetrie/render/renderDallaPianta";

describe("frasi d'errore del render dalla pianta", () => {
  it("dice cosa fare per crediti, chiavi, richieste e tempi", () => {
    expect(fraseErroreRender("insufficient_credits")).toMatch(/Crediti render finiti/);
    expect(fraseErroreRender("OPENROUTER_API_KEY non configurata in Supabase secrets")).toMatch(/avvisa l'assistenza/);
    expect(fraseErroreRender("Incorrect API key provided")).toMatch(/avvisa l'assistenza/);
    expect(fraseErroreRender("429 rate limit")).toMatch(/riprova fra un minuto/);
    expect(fraseErroreRender("Signal timed out")).toMatch(/più del solito/);
  });
  it("altri messaggi restano com'erano, vuoti diventano una frase", () => {
    expect(fraseErroreRender("La stanza non ha pareti")).toBe("La stanza non ha pareti");
    expect(fraseErroreRender("")).toBe("Render non avviato: riprova.");
  });
});
