import { describe, it, expect } from "vitest";
import {
  nextSurveyElement,
  sectionsForSurveyStep,
  surveyProductGuide,
  surveyElementReview,
  visibleSurveySections,
} from "@/lib/surveys/elementWorkflow";
import { windowSurveySections } from "@/lib/surveys/windowSurvey";
import { makeWindowSurveyDetail } from "../fixtures/windowSurvey";

describe("Percorso prodotto del rilievo", () => {
  it("segue aree e posizioni senza mutare l’ordine originale, poi passa agli elementi senza area", () => {
    const d = makeWindowSurveyDetail(),
      e = d.elements[0];
    d.elements = [
      { ...e, id: "unassigned", area_id: null, position: 0 },
      { ...e, id: "last", position: 8 },
      { ...e, id: "first", position: 2 },
    ];
    expect(nextSurveyElement(d, "first")?.id).toBe("last");
    expect(nextSurveyElement(d, "last")?.id).toBe("unassigned");
    expect(nextSurveyElement(d, "unassigned")).toBeUndefined();
    expect(nextSurveyElement(d, "absent")).toBeUndefined();
    expect(d.elements[0].id).toBe("unassigned");
  });
  it("non porta a una scheda senza modello disponibile", () => {
    const d = makeWindowSurveyDetail(),
      e = d.elements[0];
    d.elements = [
      e,
      { ...e, id: "old", element_type: "removed", position: 1 },
      { ...e, id: "next", position: 2 },
    ];
    expect(nextSurveyElement(d, e.id)?.id).toBe("next");
  });
  it.each([
    "infisso",
    "portoncino_blindato",
    "cassonetto_standalone",
    "tapparella_standalone",
    "zanzariera_standalone",
    "persiana_standalone",
  ])("%s: conserva ogni campo del modello in un solo passo", (key) => {
    const type = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === key,
    )!;
    const sections = windowSurveySections(type);
    const expected = sections.flatMap((s) => s.fields.map((f) => f.key)).sort();
    const actual = [0, 1, 2, 3]
      .flatMap((step) =>
        sectionsForSurveyStep(sections, step).flatMap((s) =>
          s.fields.map((f) => f.key),
        ),
      )
      .sort();
    expect(actual).toEqual(expected);
    expect(surveyProductGuide(type)).not.toContain("undefined");
  });
  it("porta la profondità del cassonetto al primo passo e non mostra complementi non selezionati", () => {
    const type = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === "cassonetto_standalone",
    )!;
    expect(
      sectionsForSurveyStep(windowSurveySections(type), 0).flatMap((s) =>
        s.fields.map((f) => f.key),
      ),
    ).toContain("profondita");
    const infisso = makeWindowSurveyDetail().template.schema.element_types[0];
    expect(
      visibleSurveySections(windowSurveySections(infisso), {
        complementi: [],
      }).some((s) => s.key === "rv_cassonetto"),
    ).toBe(false);
    expect(
      visibleSurveySections(windowSurveySections(infisso), {
        complementi: ["cassonetto"],
      }).some((s) => s.key === "rv_cassonetto"),
    ).toBe(true);
  });
  it("richiede solo dati pertinenti e foto del modello; apertura nuova porta sostituisce quella storica", () => {
    const type = makeWindowSurveyDetail().template.schema.element_types.find(
      (t) => t.key === "portoncino_blindato",
    )!;
    const review = surveyElementReview(
      type,
      { rv_door_hinge: "dx", rv_door_swing: "spingere" },
      new Set(),
    );
    expect(review.missing.some((f) => f.key === "apertura")).toBe(false);
    expect(
      review.checks.some((message) => message.includes("Conferma cerniere")),
    ).toBe(false);
    expect(
      surveyElementReview(type, { apertura: "dx" }, new Set()).checks,
    ).toContain(
      "Conferma cerniere e spingere/tirare guardando il portoncino dall’esterno.",
    );
    expect(review.missing.length).toBeGreaterThan(0);
    const required = type.required_photos.filter((p) => p.required);
    expect(review.photos).toEqual(required);
    expect(
      surveyElementReview(type, {}, new Set(required.map((p) => p.key))).photos,
    ).toEqual([]);
  });
});
