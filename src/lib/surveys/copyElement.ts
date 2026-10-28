import type { ElementTypeDefinition, SurveyElementRow } from "@/types/surveys";
import type { SurveyDetail } from "@/lib/api/surveys";
import {
  flattenWindowFields,
  windowSurveySections,
  WINDOW_PINS,
  readWindowPins,
} from "./windowSurvey";
import type { SurveyElementDraft } from "./workspace";

export type SurveyCopyMode = "common" | "product" | "all";
const PRIVATE_FIELD =
  /^(?:id|survey_id|area_id|company_id|created_at|updated_at|is_complete|missing_required_fields)$|photo|foto|audio|signature|firma|verificat|verified|^rv_order_|^rv_annotations|^note|criticita|ostacol|^rv_.*(?:obstacles|notes|threshold|side_[ab])$/i;
const COMMON_FIELD =
  /material|colore|color|finitur|vetro|glass|(?:^|_)model|marca|produttore|serie|accessor|^rv_(?:motor$|caps$|guide_profile$|zan_(?:mechanism|guide_system|controls)$|door_(?:hardware|panel_internal|panel_external|finish_[ab]|performance)$)/i;
const PRODUCT_MEASURES = new Set([
  "larghezza_telaio",
  "zan_larghezza_telaio",
  "rv_tap_slat_thickness",
  "rv_tap_max_thickness",
  "rv_tap_slat_height",
  "rv_guide_width_sx",
  "rv_guide_width_dx",
  "rv_guide_outer_depth",
  "rv_guide_slot",
  "rv_roller_diameter",
  "rv_zan_total_depth",
  "rv_zan_guide_width",
  "rv_zan_guide_depth",
  "rv_zan_guide_height",
  "rv_zan_pack_depth",
  "rv_door_leaf_depth",
  "rv_door_fixed_frame_depth",
]);
/** Only fields defined by this survey's schema. Never transfers media, locations or order approval implicitly. */
export function copySurveyValues(
  type: ElementTypeDefinition,
  source: Record<string, unknown>,
  mode: SurveyCopyMode,
) {
  const result: Record<string, unknown> = {};
  for (const field of windowSurveySections(type).flatMap((s) =>
    flattenWindowFields(s.fields),
  )) {
    if (
      PRIVATE_FIELD.test(field.key) ||
      ["date", "currency"].includes(field.type)
    )
      continue;
    const value = source[field.key];
    if (value == null || value === "") continue;
    const numeric = ["number", "dimension"].includes(field.type);
    const eligible =
      mode === "all" ||
      (mode === "product" && PRODUCT_MEASURES.has(field.key)) ||
      (!numeric &&
        ["text", "select", "multiselect", "boolean", "color"].includes(
          field.type,
        ) &&
        COMMON_FIELD.test(field.key));
    if (!eligible) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      (Array.isArray(value) &&
        value.every(
          (v) =>
            typeof v === "string" ||
            (typeof v === "number" && Number.isFinite(v)),
        ))
    )
      result[field.key] = structuredClone(value);
  }
  // A copied product starts unverified, even if the source has already been checked.
  result.rv_order_checked = false;
  if (type.sections.some(s=>s.key.startsWith("en_"))) {
    delete result.en_check_reference;
    delete result.en_reference;
    delete result.en_load_reference;
    delete result.en_hybrid_kit;
    result.en_basis = "da_verificare";
    result.en_technical_check = "da_verificare";
  }
  return result;
}
export function applyCommonSurveyValues(
  type: ElementTypeDefinition,
  source: SurveyElementRow,
  current: SurveyElementDraft,
  includeProductDimensions = false,
): SurveyElementDraft {
  if (source.element_type !== type.key)
    throw new Error("Scegli un elemento dello stesso tipo.");
  const copied = copySurveyValues(
    type,
    source.values ?? {},
    includeProductDimensions ? "product" : "common",
  );
  const pins = readWindowPins(current.values);
  const values = { ...structuredClone(current.values), ...copied };
  delete values[WINDOW_PINS];
  return {
    ...current,
    values,
    notes: pins.length
      ? [
          current.notes,
          "Note grafiche precedenti da riposizionare dopo la copia:",
          ...pins.map((p) => `- ${p.text}`),
        ]
          .filter(Boolean)
          .join("\n")
      : current.notes,
  };
}
export type SurveyDuplicateRequest = {
  id: string;
  sourceId: string;
  areaId: string;
  label: string;
  mode: SurveyCopyMode;
};
export function surveyDuplicatePayload(
  detail: SurveyDetail,
  source: SurveyElementRow,
  request: SurveyDuplicateRequest,
  companyId: string,
) {
  if (
    detail.survey.company_id !== companyId ||
    !companyId ||
    source.survey_id !== detail.survey.id ||
    !detail.elements.some(
      (e) => e.id === source.id && e.updated_at === source.updated_at,
    ) ||
    request.sourceId !== source.id
  )
    throw new Error(
      "L’elemento non appartiene al sopralluogo corrente o è stato aggiornato.",
    );
  if (detail.survey.status === "signed" || detail.survey.client_signature_at)
    throw new Error(
      "Il sopralluogo contiene una firma: duplicazione non disponibile.",
    );
  if (!detail.areas.some((a) => a.id === request.areaId))
    throw new Error("Scegli un ambiente del sopralluogo corrente.");
  const type = detail.template.schema.element_types.find(
    (t) => t.key === source.element_type,
  );
  if (!type) throw new Error("Tipo di elemento non più disponibile.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.id,
    )
  )
    throw new Error("Identificativo copia non valido.");
  const label = request.label.trim();
  if (!label || label.length > 180)
    throw new Error("Indica un nome per la copia, al massimo 180 caratteri.");
  if (!["common", "product", "all"].includes(request.mode))
    throw new Error("Modalità copia non valida.");
  return {
    id: request.id,
    survey_id: detail.survey.id,
    area_id: request.areaId,
    element_type: source.element_type,
    element_label: label,
    values: copySurveyValues(type, source.values ?? {}, request.mode),
    quantity: 1,
    position:
      Math.max(
        -1,
        ...detail.elements
          .filter((e) => e.area_id === request.areaId)
          .map((e) => e.position),
      ) + 1,
    is_complete: false,
  };
}
