import { describe, expect, it } from "vitest";
import { EnergySurveyPdf } from "@/lib/surveys/energySurveyPdf";
import { makeEnergySurvey } from "../fixtures/energySurvey";

describe("Testi del disegno energetico nel PDF", () => {
  it("stampa partenza e arrivo senza frecce non supportate dal font PDF", () => {
    const detail = makeEnergySurvey("clima");
    const type = detail.template.schema.element_types.find(
      (candidate) => candidate.key === "en_percorso_termico",
    )!;
    expect(type).toBeDefined();
    const view = EnergySurveyPdf({
      type,
      values: { en_from: "Split soggiorno", en_to: "Balcone", en_length: 6.5 },
    });
    const label = view.props.children[0].props.children[0].props.children;
    expect(label).toBe("Split soggiorno - Balcone");
    expect(label).not.toContain("→");
  });
});
