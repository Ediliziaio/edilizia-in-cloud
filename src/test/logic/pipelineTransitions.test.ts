import { describe, expect, it } from "vitest";
import {
  planPipelineTransition,
  type PipelineDocument,
} from "@/lib/orders/pipelineTransitions";
const doc: PipelineDocument = {
  id: "1",
  label: "Documento",
  status: "draft",
  stage: "da_pianificare",
  href: "/detail",
};
describe("Passaggi pipeline", () => {
  it("non modifica la stessa fase e pianifica attraverso il calendario", () => {
    expect(planPipelineTransition("survey", doc, "da_pianificare")).toBeNull();
    expect(planPipelineTransition("survey", doc, "pianificato")?.action).toBe(
      "plan",
    );
    expect(planPipelineTransition("survey", doc, "in_corso")?.status).toBe(
      "in_progress",
    );
    expect(planPipelineTransition("survey", doc, "completato")?.status).toBe(
      "completed",
    );
  });
  it("non inventa firme, preventivi o rimuove collegamenti", () => {
    for (const target of ["firmato", "preventivo"])
      expect(planPipelineTransition("survey", doc, target)?.action).toBe(
        "detail",
      );
    for (const extra of [
      { status: "signed" },
      { linked: true },
      { status: "converted" },
    ])
      expect(
        planPipelineTransition("survey", { ...doc, ...extra }, "in_corso")
          ?.action,
      ).toBe("detail");
  });
  it("valuta soltanto risposte effettive, senza aggiudicare o fingere un invio", () => {
    const rfq = { ...doc, status: "inviata", stage: "inviata", responses: 0 };
    expect(planPipelineTransition("rfq", rfq, "in_valutazione")?.action).toBe(
      "detail",
    );
    expect(
      planPipelineTransition("rfq", { ...rfq, responses: 1 }, "in_valutazione")
        ?.status,
    ).toBe("in_valutazione");
    expect(planPipelineTransition("rfq", rfq, "aggiudicata")?.action).toBe(
      "detail",
    );
    expect(
      planPipelineTransition(
        "rfq",
        { ...rfq, status: "bozza", stage: "bozza" },
        "inviata",
      )?.action,
    ).toBe("detail");
    expect(planPipelineTransition("rfq", rfq, "chiusa")?.status).toBe("chiusa");
  });
  it("verifica solo merce ricevuta senza danni; quantità e non conformità usano il dettaglio", () => {
    const ddt = { ...doc, status: "ricevuto", stage: "ricevuto", quantity: 2 };
    expect(planPipelineTransition("ddt", ddt, "verificato")?.status).toBe(
      "verificato",
    );
    for (const extra of [
      { quantity: 0 },
      { damages: true },
      { status: "atteso" },
    ])
      expect(
        planPipelineTransition("ddt", { ...ddt, ...extra }, "verificato")
          ?.action,
      ).toBe("detail");
    expect(planPipelineTransition("ddt", ddt, "non_conforme")?.action).toBe(
      "detail",
    );
    expect(
      planPipelineTransition(
        "ddt",
        { ...ddt, status: "verificato", stage: "verificato" },
        "ricevuto",
      )?.action,
    ).toBe("save");
  });
  it("gli arrivi non sono un cambio etichetta e nessun drop invia email", () => {
    const oda = { ...doc, status: "bozza", stage: "da_ordinare" };
    expect(planPipelineTransition("oda", oda, "ordinato")?.status).toBe(
      "inviato",
    );
    for (const target of ["in_consegna", "consegnato", "offerta"])
      expect(planPipelineTransition("oda", oda, target)?.action).toBe("detail");
  });
});
