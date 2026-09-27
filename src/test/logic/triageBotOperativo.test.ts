import { describe, expect, it } from "vitest";
import { classifyOperationalMessage } from "../../../supabase/functions/whatsapp-ai-processor/operationalTriage";

const intento = (testo: string) => classifyOperationalMessage({ contentText: testo, messageType: "text" }).intent;

describe("smistamento dei messaggi del bot operativo", () => {
  it("una domanda non è una conferma perché contiene «si» dentro una parola (27/09/2026)", () => {
    expect(
      intento("[Audio trascritto]: Mi puoi dire qual è la situazione dei lavori nelle prossime due settimane? Quanti lavori ci sono da fare?"),
    ).toBe("domanda");
  });
  it("i sì veri restano conferme", () => {
    expect(intento("sì confermo")).toBe("conferma");
    expect(intento("ok")).toBe("conferma");
    expect(intento("Si, va bene")).toBe("conferma");
  });
  it("«ore» dentro «fornitore» non fa pensare a un rapportino", () => {
    expect(intento("ho ricevuto la bolla del fornitore")).toBe("ddt");
  });
  it("le parole lunghe valgono anche con un finale diverso", () => {
    expect(intento("ti mando le fotografie")).toBe("foto_cantiere");
    expect(intento("oggi 8 ore da Rossi")).toBe("rapportino");
  });
});
