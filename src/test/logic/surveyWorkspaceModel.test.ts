import { describe, it, expect } from "vitest";
import { makeSurveyDetail } from "../fixtures/surveyDetail";
import { buildSurveyReport } from "@/lib/surveys/report";
import {
  surveyElementSummary,
  surveyElementQuality,
  surveyElementPatch,
  surveyTechnicalIssues,
} from "@/lib/surveys/workspace";
describe("Sintesi e modifiche del sopralluogo", () => {
  it("riassume misure vere senza usare quantità o valori come prezzi", () => {
    const d = makeSurveyDetail(),
      r = buildSurveyReport(d),
      e = r.areas[0].elements[0];
    expect(surveyElementSummary(e)).toBe("120 cm × 140 cm");
    expect(surveyElementQuality(d, e).missing).toBe(1);
    expect(surveyTechnicalIssues(r)).toHaveLength(3);
  });
  it("funziona con un elemento fotovoltaico e campi diversi dagli infissi", () => {
    const d = makeSurveyDetail();
    d.template.schema.element_types[0].sections = [
      {
        key: "impianto",
        label: "Impianto",
        fields: [
          { key: "potenza", label: "Potenza", type: "dimension", unit: "kw" },
          {
            key: "batteria",
            label: "Batteria",
            type: "dimension",
            unit: "kwh",
          },
        ],
      },
    ];
    d.elements[0].values = { potenza: 6, batteria: 10 };
    expect(
      surveyElementSummary(buildSurveyReport(d).areas[0].elements[0]),
    ).toBe("Potenza: 6 kw · Batteria: 10 kwh");
  });
  it("salva soltanto i campi ammessi conservando il resto dei valori del modello", () => {
    const d = makeSurveyDetail(),
      e = d.elements[0];
    const patch = surveyElementPatch(d, e, {
      ...e,
      values: { ...e.values, larghezza: 135, legacy: "da conservare" },
    });
    expect(patch.values.legacy).toBe("da conservare");
    expect(patch.values.larghezza).toBe(135);
    expect(patch).not.toHaveProperty("survey_id");
    expect(patch).not.toHaveProperty("area_id");
    expect(patch.is_complete).toBe(false);
    expect(e.values.larghezza).toBe(120);
  });
  it.each([0, -1, 1.5, NaN])("rifiuta quantità non valida %s", (quantity) => {
    const d = makeSurveyDetail();
    expect(() =>
      surveyElementPatch(d, d.elements[0], { ...d.elements[0], quantity }),
    ).toThrow("quantità");
  });
  it("controlla i limiti delle misure ma permette bozze incomplete esplicite", () => {
    const d = makeSurveyDetail(),
      e = d.elements[0];
    d.template.schema.element_types[0].sections[0].fields[0].min = 1;
    expect(() =>
      surveyElementPatch(d, e, {
        ...e,
        values: { ...e.values, larghezza: -1 },
      }),
    ).toThrow("Larghezza");
    const patch = surveyElementPatch(d, e, {
      ...e,
      values: { ...e.values, larghezza: null },
    });
    expect(patch.missing_required_fields).toContain("larghezza");
    expect(patch.is_complete).toBe(false);
  });
});
