import { describe, expect, it } from "vitest";
import {
  copySurveyValues,
  applyCommonSurveyValues,
  surveyDuplicatePayload,
} from "@/lib/surveys/copyElement";
import { makeCompleteWindowSurvey } from "../fixtures/completeWindowSurvey";
import { WINDOW_PINS } from "@/lib/surveys/windowSurvey";
describe("Copia sicura delle schede del rilievo", () => {
  const detail = makeCompleteWindowSurvey(),
    source = detail.elements[6],
    target = detail.elements[7];
  const type = detail.template.schema.element_types.find(
    (t) => t.key === source.element_type,
  )!;
  const request = {
    id: "20261027-1000-4000-a000-000000000001",
    sourceId: source.id,
    areaId: detail.areas[0].id,
    label: "T03 · nuova tapparella",
    mode: "all" as const,
  };
  it.each(detail.elements)(
    "$element_label: tutte le modalità generano copie indipendenti e non verificate",
    (piece) => {
      const before = structuredClone(piece);
      const definition = detail.template.schema.element_types.find(
        (t) => t.key === piece.element_type,
      )!;
      for (const mode of ["common", "product", "all"] as const) {
        const payload = surveyDuplicatePayload(
          detail,
          piece,
          { ...request, sourceId: piece.id, mode },
          detail.survey.company_id,
        );
        expect(payload.values).toEqual(
          copySurveyValues(definition, piece.values, mode),
        );
        expect(payload.values.rv_order_checked).toBe(false);
        expect(payload.quantity).toBe(1);
        expect(payload.is_complete).toBe(false);
        expect(payload.values).not.toHaveProperty(WINDOW_PINS);
        for (const key of Object.keys(payload.values)) {
          if (Array.isArray(payload.values[key]))
            (payload.values[key] as unknown[]).push("independent-copy");
        }
        expect(piece).toEqual(before);
      }
    },
  );
  it("copia materiali/accessori, non quote, direzioni o dati locali", () => {
    const copied = copySurveyValues(type, source.values, "common");
    expect(copied.materiale).toBe(source.values.materiale);
    expect(copied.accessori).toEqual(source.values.accessori);
    for (const key of [
      "larghezza",
      "altezza",
      "tipo",
      "rv_roller_length",
      "rv_measure_basis",
      "rv_tap_space",
      "rv_tap_slat_thickness",
    ])
      expect(copied).not.toHaveProperty(key);
  });
  it("consente esplicitamente gli spessori prodotto, non lo spazio disponibile o le lunghezze del vano", () => {
    const copied = copySurveyValues(type, source.values, "product");
    expect(copied.rv_tap_slat_thickness).toBe(9);
    for (const key of [
      "larghezza",
      "altezza",
      "rv_guide_sx",
      "rv_roller_length",
      "rv_tap_space",
    ])
      expect(copied).not.toHaveProperty(key);
  });
  it("la copia completa esclude sempre foto, approvazione e dimensioni ordine", () => {
    const copied = copySurveyValues(
      type,
      {
        ...source.values,
        rv_order_checked: true,
        rv_order_width: 1190,
        rv_order_reference: "Tecnico",
        [WINDOW_PINS]: [{ photoId: "old-photo" }],
        unknownFile: { url: "private" },
      },
      "all",
    );
    expect(copied.larghezza).toBe(120);
    expect(copied.rv_order_checked).toBe(false);
    expect(copied).not.toHaveProperty("rv_order_width");
    expect(copied).not.toHaveProperty(WINDOW_PINS);
    expect(copied).not.toHaveProperty("unknownFile");
  });
  it("applica i dati comuni conservando misure, apertura, quantità e note del pezzo corrente", () => {
    const before = structuredClone(target);
    const next = applyCommonSurveyValues(
      type,
      source,
      { ...target, quantity: 3, notes: "Nota mia" },
      true,
    );
    expect(next.values.larghezza).toBe(140);
    expect(next.values.altezza).toBe(240);
    expect(next.values.tipo).toBe(target.values.tipo);
    expect(next.quantity).toBe(3);
    expect(next.notes).toBe("Nota mia");
    expect(next.element_label).toBe(target.element_label);
    expect(target).toEqual(before);
    expect(next.values.rv_order_checked).toBe(false);
  });
  it("conserva come testo le note grafiche del destinatario, senza riutilizzare coordinate o foto dell’originale", () => {
    const current = {
      ...target,
      values: {
        ...target.values,
        [WINDOW_PINS]: [
          {
            id: "pin",
            x: 0.2,
            y: 0.3,
            view: "interna",
            text: "Vite da spostare",
          },
        ],
      },
    };
    const next = applyCommonSurveyValues(type, source, current);
    expect(next.notes).toContain("Vite da spostare");
    expect(next.values).not.toHaveProperty(WINDOW_PINS);
  });
  it("non applica dati tra famiglie diverse", () =>
    expect(() =>
      applyCommonSurveyValues(type, detail.elements[0], target),
    ).toThrow("stesso tipo"));
  it("duplica come scheda nuova, quantità 1 e stato non verificato anche se la sorgente è completa", () => {
    const payload = surveyDuplicatePayload(
      detail,
      { ...source, is_complete: true },
      request,
      detail.survey.company_id,
    );
    expect(payload.quantity).toBe(1);
    expect(payload.is_complete).toBe(false);
    expect(payload.id).toBe(request.id);
    expect(payload.area_id).toBe(request.areaId);
    expect(payload).not.toHaveProperty("audio_url");
    expect(payload).not.toHaveProperty("notes");
    expect(payload.values.rv_order_checked).toBe(false);
  });
  it("rifiuta aziende, ambienti, sorgenti e identità discordanti", () => {
    expect(() =>
      surveyDuplicatePayload(detail, source, request, "other"),
    ).toThrow();
    expect(() =>
      surveyDuplicatePayload(
        detail,
        source,
        { ...request, areaId: "other" },
        detail.survey.company_id,
      ),
    ).toThrow();
    expect(() =>
      surveyDuplicatePayload(
        detail,
        { ...source, updated_at: "changed" },
        request,
        detail.survey.company_id,
      ),
    ).toThrow();
    expect(() =>
      surveyDuplicatePayload(
        detail,
        source,
        { ...request, id: "bad" },
        detail.survey.company_id,
      ),
    ).toThrow();
  });
  it("non duplica un verbale firmato", () => {
    expect(() =>
      surveyDuplicatePayload(
        { ...detail, survey: { ...detail.survey, status: "signed" } },
        source,
        request,
        detail.survey.company_id,
      ),
    ).toThrow("firma");
  });
});
