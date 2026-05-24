import { describe, expect, it } from "vitest";
import { classifyWhatsAppOperationalMessage } from "@/lib/whatsappOperationalTriage";

describe("whatsapp operational triage", () => {
  it("recognizes DDT and marks it for high-priority review", () => {
    const triage = classifyWhatsAppOperationalMessage({
      message_type: "image",
      content_text: "DDT fornitore Rossi consegna materiale in cantiere",
      processing_status: "processed",
    });

    expect(triage.intent).toBe("ddt");
    expect(triage.priority).toBe("alta");
    expect(triage.requiresReview).toBe(true);
    expect(triage.route).toContain("Magazzino");
  });

  it("recognizes daily work reports from audio-like messages", () => {
    const triage = classifyWhatsAppOperationalMessage({
      message_type: "audio",
      content_text: "Oggi abbiamo fatto posa telai 7 ore materiali usati schiuma e tasselli",
      processing_status: "processed",
    });

    expect(triage.intent).toBe("rapportino");
    expect(triage.route).toContain("Rapportini");
    expect(triage.confidence).toBeGreaterThan(0.7);
  });

  it("prefers saved AI triage when present", () => {
    const triage = classifyWhatsAppOperationalMessage({
      message_type: "text",
      content_text: "ok",
      ai_extracted_data: {
        operational_triage: {
          intent: "presenze",
          confidence: 0.93,
          priority: "media",
          requires_review: false,
          route: "Timbrature",
          title: "Timbratura confermata",
          summary: "Entrata rilevata.",
          suggested_action: "Registra ingresso.",
          signals: ["saved"],
        },
      },
    });

    expect(triage.source).toBe("saved");
    expect(triage.intent).toBe("presenze");
    expect(triage.requiresReview).toBe(false);
  });
});
