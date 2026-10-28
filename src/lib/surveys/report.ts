import type { SurveyDetail } from "@/lib/api/surveys";
import type {
  FieldDefinition,
  FieldSection,
  SurveyMediaRow,
} from "@/types/surveys";
import { isVisible } from "@/components/surveys/engine/evalConditions";
import { energyIssues } from "./energySurvey";
import { energyGeometryIssues } from "./energyDrawing";
import {
  windowLeafSummary,
  windowSurveyReportSections,
  portoncinoOpeningComplete,
} from "./windowSurvey";

export const SURVEY_STATUS: Record<string, string> = {
  draft: "Bozza",
  in_progress: "In corso",
  completed: "Da revisionare",
  reviewed: "Revisionato dall’ufficio",
  signed: "Firmato",
  converted: "Convertito",
  archived: "Archiviato",
  cancelled: "Annullato",
};
export type ReportField = {
  key: string;
  label: string;
  value: string;
  missing: boolean;
  required: boolean;
};
export type ReportSection = {
  key: string;
  label: string;
  fields: ReportField[];
};
export function dateSurvey(value: string | null | undefined, time = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Non indicata";
  return new Date(value).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
/** Child edits and uploads do not necessarily touch the survey header. */
export function surveyLastUpdated(detail: SurveyDetail): string {
  return [
    detail.survey.updated_at,
    ...detail.areas.map((a) => a.updated_at),
    ...detail.elements.map((e) => e.updated_at),
    ...detail.media.map((m) => m.created_at),
  ].reduce(
    (latest, value) =>
      Number.isFinite(Date.parse(value)) &&
      (!Number.isFinite(Date.parse(latest)) ||
        Date.parse(value) > Date.parse(latest))
        ? value
        : latest,
    detail.survey.updated_at,
  );
}
/** Keep office review distinct from the technician's notes and from a legal certification. */
export function surveyOfficeReviewText(
  survey: SurveyDetail["survey"],
): string | null {
  if (!survey.field_review_note?.trim()) return null;
  return `${SURVEY_STATUS[survey.status] || survey.status}${survey.reviewed_at ? ` - ${dateSurvey(survey.reviewed_at, true)}` : ""}\n${survey.field_review_note.trim()}`;
}
export const hasSurveyValue = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);
const textValue = (v: unknown): string => {
  if (typeof v === "boolean") return v ? "Sì" : "No";
  if (typeof v === "number")
    return Number.isFinite(v)
      ? v.toLocaleString("it-IT", { maximumFractionDigits: 4 })
      : "Non indicato";
  if (Array.isArray(v)) return v.map(textValue).join(", ");
  if (v && typeof v === "object")
    return Object.entries(v)
      .map(([key, value]) => `${key}: ${textValue(value)}`)
      .join("; ");
  return String(v ?? "");
};
export function formatSurveyValue(
  field: FieldDefinition,
  value: unknown,
): string {
  if (!hasSurveyValue(value)) return "Non indicato";
  if (field.type === "date") return dateSurvey(String(value));
  const label = (v: unknown) =>
    field.options?.find((o) => o.value === String(v))?.label ?? textValue(v);
  const result = Array.isArray(value)
    ? value.map(label).join(", ")
    : label(value);
  return field.unit && typeof value === "number"
    ? `${result} ${field.unit}`
    : result;
}
export function surveyFields(
  fields: readonly FieldDefinition[],
  values: Record<string, unknown>,
): ReportField[] {
  return fields.flatMap((field) => {
    if (!isVisible(field.show_if, values)) return [];
    const value = values[field.key];
    const row = {
      key: field.key,
      label: field.label,
      value: formatSurveyValue(field, value),
      missing: !hasSurveyValue(value),
      required: field.required === true,
    };
    return [
      row,
      ...(field.type === "compound_boolean" && value === true
        ? surveyFields(field.nested_fields ?? [], values)
        : []),
    ];
  });
}
export function surveySections(
  sections: readonly FieldSection[],
  values: Record<string, unknown>,
): ReportSection[] {
  return sections
    .filter((s) => isVisible(s.show_if, values))
    .map((section) => ({
      key: section.key,
      label: section.label,
      fields: surveyFields(section.fields, values),
    }));
}
export function surveyMediaIsImage(media: SurveyMediaRow) {
  return ["photo", "annotated_photo", "sketch", "signature"].includes(
    media.type,
  );
}
/** Never put javascript/file URLs or remote signed tokens into a generated PDF. */
export function surveyMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(url)) return url;
  return null;
}
export function buildSurveyReport(detail: SurveyDetail) {
  const { survey, template, media } = detail;
  const header = surveySections(
    template.schema.header_schema ?? [],
    survey.header_data ?? {},
  );
  const areaIds = new Set(detail.areas.map((a) => a.id));
  const sectionsForElement = (element: SurveyDetail["elements"][number]) => {
    const type = template.schema.element_types?.find(
      (t) => t.key === element.element_type,
    );
    const technical = type
      ? windowSurveyReportSections(type, element.values ?? {}, element.quantity)
      : null;
    const technicalSections: ReportSection[] = technical
      ? [
          ...surveySections(technical.sections, element.values ?? {})
            .map((s) => ({ ...s, fields: s.fields.filter((f) => !f.missing) }))
            .filter((s) => s.fields.length),
          ...(technical.summary.length
            ? [
                {
                  key: "rv_summary",
                  label: "Note grafiche e verifiche tecniche",
                  fields: technical.summary,
                },
              ]
            : []),
        ]
      : [];
    return {
      ...element,
      title: element.element_label || type?.label || element.element_type,
      sections: type
        ? [
            ...surveySections(type.sections ?? [], element.values ?? {}).map(
              (s) => ({
                ...s,
                fields: s.fields.map((f) =>
                  type.key === "portoncino_blindato" &&
                  f.key === "apertura" &&
                  f.missing &&
                  portoncinoOpeningComplete(element.values)
                    ? {
                        ...f,
                        label: "Apertura rilevata",
                        value: windowLeafSummary(element.values, type.key),
                        missing: false,
                      }
                    : f.key === "apertura" &&
                        windowLeafSummary(element.values, type.key)
                      ? {
                          ...f,
                          label: `${f.label} · dato sintetico precedente`,
                        }
                      : f,
                ),
              }),
            ),
            ...technicalSections,
            ...(type &&
            [
              ...energyIssues(type, element.values),
              ...energyGeometryIssues(type, element.values),
            ].length
              ? [
                  {
                    key: "en_checks",
                    label: "Verifiche energetiche aperte",
                    fields: [
                      ...energyIssues(type, element.values),
                      ...energyGeometryIssues(type, element.values),
                    ].map((value, i) => ({
                      key: `en_issue_${i}`,
                      label: "Da verificare",
                      value,
                      missing: false,
                      required: false,
                    })),
                  },
                ]
              : []),
          ]
        : [
            {
              key: "dati",
              label: "Dati rilevati",
              fields: Object.entries(element.values ?? {}).map(
                ([key, value]) => ({
                  key,
                  label: key.replaceAll("_", " "),
                  value: textValue(value),
                  missing: !hasSurveyValue(value),
                  required: false,
                }),
              ),
            },
          ],
    };
  };
  const areas = [...detail.areas]
    .sort((a, b) => a.position - b.position)
    .map((area) => ({
      ...area,
      fields: surveyFields(
        template.schema.area_definition?.fields ?? [],
        area.area_data ?? {},
      ),
      elements: detail.elements
        .filter((e) => e.area_id === area.id)
        .sort((a, b) => a.position - b.position)
        .map(sectionsForElement),
    }));
  const unassigned = detail.elements
    .filter((e) => !areaIds.has(e.area_id))
    .sort((a, b) => a.position - b.position)
    .map(sectionsForElement);
  const requiredFields = [
    ...header.flatMap((s) => s.fields),
    ...areas.flatMap((a) => a.fields),
    ...areas
      .flatMap((a) => a.elements)
      .concat(unassigned)
      .flatMap((e) => e.sections.flatMap((s) => s.fields)),
  ].filter((f) => f.required);
  const requiredPhotos: Array<{ label: string; present: boolean }> = [];
  const addPhotoChecks = (
    items: typeof template.schema.general_required_photos,
    scope: { area?: string; element?: string },
    prefix: string,
  ) => {
    for (const photo of items ?? [])
      if (photo.required)
        requiredPhotos.push({
          label: `${prefix}: ${photo.label}`,
          present: media.some(
            (m) =>
              surveyMediaIsImage(m) &&
              m.checklist_key === photo.key &&
              (scope.element
                ? m.element_id === scope.element
                : scope.area
                  ? m.area_id === scope.area && !m.element_id
                  : !m.area_id && !m.element_id),
          ),
        });
  };
  addPhotoChecks(template.schema.general_required_photos, {}, "Foto generali");
  for (const area of detail.areas)
    addPhotoChecks(
      template.schema.area_definition?.required_photos ?? [],
      { area: area.id },
      area.name,
    );
  for (const element of detail.elements)
    addPhotoChecks(
      template.schema.element_types?.find((t) => t.key === element.element_type)
        ?.required_photos ?? [],
      { element: element.id },
      element.element_label ||
        template.schema.element_types?.find(
          (t) => t.key === element.element_type,
        )?.label ||
        "Elemento",
    );
  const missingFields = requiredFields.filter((f) => f.missing).length;
  return {
    survey,
    header,
    areas,
    unassigned,
    media: [...media].sort((a, b) => a.position - b.position),
    missingFields,
    requiredPhotos,
    missingPhotos: requiredPhotos.filter((p) => !p.present).length,
    requiredCount: requiredFields.length + requiredPhotos.length,
    completedCount:
      requiredFields.length -
      missingFields +
      requiredPhotos.filter((p) => p.present).length,
  };
}
export type SurveyReferences = {
  reference: string | null;
  assignees: string[];
};
export function surveyAddress(survey: {
  address: string | null;
  city: string | null;
}) {
  const address = survey.address?.trim() ?? "",
    city = survey.city?.trim() ?? "";
  return (
    [
      address,
      city &&
      !address
        .toLocaleLowerCase("it-IT")
        .endsWith(city.toLocaleLowerCase("it-IT"))
        ? city
        : "",
    ]
      .filter(Boolean)
      .join(", ") || "Indirizzo non indicato"
  );
}
export type SurveyReport = ReturnType<typeof buildSurveyReport>;
export const surveyPdfName = (code: string) =>
  `Sopralluogo-${code.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 100) || "rilievo"}.pdf`;
