import type { SurveyDetail } from "@/lib/api/surveys";
import { validateEnergyValues } from "./energyDrawing";
import { energyGeometryIssues } from "./energyDrawing";
import { energyIssues } from "./energySurvey";
import type { SurveyElementRow } from "@/types/surveys";
import { buildSurveyReport, surveySections, type SurveyReport } from "./report";
import {
  flattenWindowFields,
  readWindowPins,
  validateWindowSurvey,
  windowSurveySections,
  windowLeafSummary,
  portoncinoOpeningComplete,
} from "./windowSurvey";

export type SurveyReportElement = SurveyReport["unassigned"][number];
export type SurveySelection =
  | { kind: "overview" }
  | { kind: "area" | "element"; id: string };
export function surveyElementSummary(element: SurveyReportElement) {
  const fields = element.sections
    .flatMap((s) => s.fields)
    .filter((f) => !f.missing);
  const find = (pattern: RegExp) =>
    fields.find((f) => pattern.test(`${f.key} ${f.label}`));
  const width = find(/larghezza|width|lunghezza/i),
    height = find(/altezza|height/i);
  const dimensions =
    width && height
      ? `${width.value} × ${height.value}`
      : width?.value || height?.value;
  const material = find(/materiale|material/i),
    opening = find(/apertura|apre|comando/i);
  // The summary is derived from the template, not from a hard-coded infissi model.
  return (
    [
      ...new Set(
        [
          dimensions,
          material?.value,
          windowLeafSummary(element.values, element.element_type) ||
            opening?.value,
          ...fields
            .filter((f) => ![width, height, material, opening].includes(f))
            .slice(0, dimensions ? 0 : 2)
            .map((f) => `${f.label}: ${f.value}`),
        ].filter(Boolean),
      ),
    ].join(" · ") || "Nessun dato di sintesi compilato"
  );
}
export function surveyElementQuality(
  detail: SurveyDetail,
  element: SurveyReportElement,
) {
  const missingFields = element.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && f.missing);
  const type = detail.template.schema.element_types.find(
    (t) => t.key === element.element_type,
  );
  const photos = (type?.required_photos ?? []).filter((p) => p.required);
  const media = detail.media.filter((m) => m.element_id === element.id);
  const missingPhotos = photos.filter(
    (p) =>
      !media.some(
        (m) =>
          ["photo", "annotated_photo", "sketch"].includes(m.type) &&
          m.checklist_key === p.key,
      ),
  );
  return {
    missingFields,
    missingPhotos,
    media,
    missing: missingFields.length + missingPhotos.length + (type ? energyIssues(type, element.values).length + energyGeometryIssues(type, element.values).length : 0),
  };
}
export function surveyTechnicalIssues(report: SurveyReport) {
  return [
    ...report.header.flatMap((s) =>
      s.fields
        .filter((f) => f.required && f.missing)
        .map((f) => `${s.label}: ${f.label}`),
    ),
    ...report.areas.flatMap((a) =>
      a.fields
        .filter((f) => f.required && f.missing)
        .map((f) => `${a.name}: ${f.label}`),
    ),
    ...report.areas
      .flatMap((a) => a.elements)
      .concat(report.unassigned)
      .flatMap((e) =>
        e.sections.flatMap((s) =>
          s.fields
            .filter((f) => f.required && f.missing)
            .map((f) => `${e.title}: ${f.label}`),
        ),
      ),
    ...report.requiredPhotos
      .filter((p) => !p.present)
      .map((p) => `Foto · ${p.label}`),
  ];
}
export type SurveyElementDraft = Pick<
  SurveyElementRow,
  "values" | "quantity" | "notes" | "element_label"
>;
export function surveyElementPatch(
  detail: SurveyDetail,
  element: SurveyElementRow,
  draft: SurveyElementDraft,
) {
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1)
    throw new Error(
      "La quantità deve essere un numero intero maggiore di zero.",
    );
  const type = detail.template.schema.element_types.find(
    (t) => t.key === element.element_type,
  );
  if (!type)
    throw new Error(
      "Il modello di questo elemento non è più disponibile. Usa l’editor completo.",
    );
  validateWindowSurvey(type, draft.values);
  validateEnergyValues(type, draft.values);
  for (const pin of readWindowPins(draft.values)) {
    if (
      pin.photoId &&
      !detail.media.some(
        (m) =>
          m.id === pin.photoId &&
          m.element_id === element.id &&
          ["photo", "annotated_photo", "sketch"].includes(m.type),
      )
    )
      throw new Error(
        "La foto collegata alla nota non appartiene a questo elemento o non è più disponibile.",
      );
  }
  const sections = windowSurveySections(type);
  const visible = surveySections(sections, draft.values).flatMap(
    (s) => s.fields,
  );
  const definitions = sections.flatMap((s) => flattenWindowFields(s.fields));
  for (const field of visible) {
    const def = definitions.find((f) => f.key === field.key),
      value = draft.values[field.key];
    if (
      def &&
      ["dimension", "number", "currency"].includes(def.type) &&
      value != null &&
      value !== ""
    ) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (def.min != null && value < def.min) ||
        (def.max != null && value > def.max)
      )
        throw new Error(
          `Controlla il valore di «${def.label}» e i limiti del modello.`,
        );
    }
  }
  const missing = visible
    .filter(
      (f) =>
        f.required &&
        f.missing &&
        !(
          type.key === "portoncino_blindato" &&
          f.key === "apertura" &&
          portoncinoOpeningComplete(draft.values)
        ),
    )
    .map((f) => f.key);
  const next = { ...element, ...draft };
  const preview = buildSurveyReport({
    ...detail,
    elements: detail.elements.map((e) => (e.id === next.id ? next : e)),
  });
  const computed = preview.areas
    .flatMap((a) => a.elements)
    .concat(preview.unassigned)
    .find((e) => e.id === next.id)!;
  return {
    values: draft.values,
    quantity: draft.quantity,
    notes: draft.notes,
    element_label: draft.element_label?.trim() || null,
    missing_required_fields: missing,
    is_complete: surveyElementQuality(detail, computed).missing === 0,
  };
}
