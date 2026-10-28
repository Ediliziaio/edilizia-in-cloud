import { describe, it, expect } from "vitest";
import {
  buildSurveyReport,
  formatSurveyValue,
  surveyFields,
  surveyAddress,
  surveyMediaUrl,
  surveyPdfName,
  dateSurvey,
} from "@/lib/surveys/report";
import { makeSurveyDetail, surveyMedia } from "../fixtures/surveyDetail";

describe("Report sopralluogo fedele ai dati salvati", () => {
  it("conserva zero e falso, usa etichette del modello e unità italiane", () => {
    const r = buildSurveyReport(makeSurveyDetail());
    expect(r.header[0].fields.map((f) => f.value)).toEqual([
      "Appartamento",
      "0",
      "No",
    ]);
    expect(r.missingFields).toBe(0);
    expect(r.areas[0].fields[0].value).toBe("12,5 mq");
    expect(r.areas[0].elements[0].sections[0].fields[0].value).toBe("120 cm");
  });
  it("non confonde stato archiviato e completezza: controlla foto generali, di area e di elemento", () => {
    const d = makeSurveyDetail();
    d.survey.status = "archived";
    expect(buildSurveyReport(d).missingPhotos).toBe(3);
    d.media = [
      surveyMedia({ id: "p1", checklist_key: "facciata" }),
      surveyMedia({ id: "p2", area_id: "area1", checklist_key: "panoramica" }),
      surveyMedia({
        id: "p3",
        element_id: "element1",
        area_id: "area1",
        checklist_key: "frontale",
      }),
    ];
    expect(buildSurveyReport(d).missingPhotos).toBe(0);
    d.media[2].element_id = "altro";
    expect(buildSurveyReport(d).missingPhotos).toBe(1);
  });
  it("esclude i dati nascosti e conta i campi annidati soltanto quando attivi", () => {
    const fields = [
      {
        key: "si",
        label: "Presente",
        type: "compound_boolean" as const,
        nested_fields: [
          { key: "nota", label: "Nota", type: "text" as const, required: true },
        ],
      },
    ];
    expect(surveyFields(fields, { si: false, nota: "nascosta" })).toHaveLength(
      1,
    );
    expect(surveyFields(fields, { si: true, nota: "" })[1]).toMatchObject({
      missing: true,
      required: true,
    });
    expect(
      formatSurveyValue(
        {
          key: "m",
          label: "Scelte",
          type: "multiselect",
          options: [{ value: "a", label: "Alfa" }],
        },
        ["a", "b"],
      ),
    ).toBe("Alfa, b");
  });
  it("non perde elementi senza area o con tipi rimossi dal modello", () => {
    const d = makeSurveyDetail();
    d.elements[0].area_id = "rimosso";
    d.elements[0].element_type = "vecchio";
    const r = buildSurveyReport(d);
    expect(r.unassigned).toHaveLength(1);
    expect(r.unassigned[0].sections[0].fields[0].value).toBe("120");
    expect(d.elements[0].values.larghezza).toBe(120);
  });
  it("ordina senza modificare i dati originali del cache", () => {
    const d = makeSurveyDetail();
    d.areas.push({
      ...d.areas[0],
      id: "prima",
      name: "Ingresso",
      position: -1,
    });
    expect(buildSurveyReport(d).areas[0].id).toBe("prima");
    expect(d.areas[0].id).toBe("area1");
  });
  it("deduplica soltanto la rappresentazione dell’indirizzo e mantiene sicuri nomi e link", () => {
    expect(
      surveyAddress({ address: "Via Roma 8, Milano", city: "Milano" }),
    ).toBe("Via Roma 8, Milano");
    expect(surveyAddress({ address: null, city: "Lecco" })).toBe("Lecco");
    expect(surveyPdfName("A/B\\C")).not.toMatch(/[/\\]/);
    expect(surveyMediaUrl("javascript:alert(1)")).toBeNull();
    expect(surveyMediaUrl("data:image/svg+xml,test")).toBeNull();
    expect(surveyMediaUrl("https://example.test/file.pdf")).toContain("https:");
    expect(dateSurvey("non-data")).toBe("Non indicata");
  });
});
