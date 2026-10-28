/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { makeCompleteWindowSurvey } from "../fixtures/completeWindowSurvey";
import {
  windowSurveyDrawing,
  windowSurveySections,
  validateWindowSurvey,
  windowComponentData,
} from "@/lib/surveys/windowSurvey";
import { buildSurveyReport } from "@/lib/surveys/report";
import { renderSurveyPdf } from "@/lib/surveys/reportPdf";
describe("Sopralluogo completo dimostrativo", () => {
  const detail = makeCompleteWindowSurvey();
  it("copre tutte le famiglie, senza foto, firme o approvazioni inventate", () => {
    expect(detail.elements).toHaveLength(16);
    expect(detail.areas).toHaveLength(6);
    expect(new Set(detail.elements.map((e) => e.element_type)).size).toBe(7);
    expect(detail.media).toHaveLength(0);
    expect(detail.survey.client_signature_at).toBeNull();
    expect(
      detail.elements.every((e) => e.values.rv_order_checked === false),
    ).toBe(true);
    expect(
      buildSurveyReport(detail).areas.flatMap((a) => a.elements),
    ).toHaveLength(16);
  });
  it.each(detail.elements)(
    "$element_label: campi, scene e quote coerenti",
    (e) => {
      const type = detail.template.schema.element_types.find(
        (t) => t.key === e.element_type,
      )!;
      expect(type).toBeDefined();
      expect(() => validateWindowSurvey(type, e.values)).not.toThrow();
      expect(
        windowSurveyDrawing(type, e.values)?.scene.larghezza,
      ).toBeGreaterThan(0);
      const fields = windowSurveySections(type).flatMap((s) => s.fields);
      for (const f of fields)
        if (
          f.type === "select" &&
          e.values[f.key] != null &&
          e.values[f.key] !== ""
        )
          expect(
            f.options?.some((o) => o.value === e.values[f.key]),
            f.key,
          ).toBe(true);
      if (type.key === "infisso" && Array.isArray(e.values.complementi))
        for (const component of [
          "tapparella",
          "cassonetto",
          "zanzariera",
          "persiana",
        ] as const)
          if (e.values.complementi.includes(component)) {
            const projected = windowComponentData(type, e.values, component);
            expect(
              windowSurveyDrawing(projected.type, projected.values),
              component,
            ).not.toBeNull();
          }
    },
  );
  it("due tapparelle dello stesso prodotto mantengono vani differenti", () => {
    const [a, b] = detail.elements.filter(
      (e) => e.element_type === "tapparella_standalone",
    );
    expect(a.values.rv_tap_slat_thickness).toBe(b.values.rv_tap_slat_thickness);
    expect(a.values.larghezza).toBe(120);
    expect(b.values.larghezza).toBe(140);
    expect(a.values.altezza).toBe(140);
    expect(b.values.altezza).toBe(240);
  });
  it("genera il PDF completo nativo senza dati reali", async () => {
    const blob = await renderSurveyPdf(
      detail,
      "Azienda dimostrativa - simulazione",
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    if (process.env.COMPLETE_SURVEY_PDF_QA === "1") {
      await mkdir("output/pdf", { recursive: true });
      await writeFile(
        "output/pdf/Sopralluogo-completo-serramenti-SIMULAZIONE.pdf",
        bytes,
      );
    }
  }, 30000);
});
