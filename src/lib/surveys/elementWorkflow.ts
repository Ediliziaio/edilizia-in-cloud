import type { SurveyDetail } from "@/lib/api/surveys";
import type { ElementTypeDefinition, FieldSection } from "@/types/surveys";
import { isVisible } from "@/components/surveys/engine/evalConditions";
import { surveySections } from "./report";
import { energyIssues } from "./energySurvey";
import { energyGeometryIssues } from "./energyDrawing";
import {
  portoncinoOpeningComplete,
  windowSurveyDrawing,
  windowSurveyIssues,
  windowSurveySections,
} from "./windowSurvey";

export const SURVEY_ELEMENT_STEPS = [
  "Misure",
  "Dettagli",
  "Accessori",
  "Verifica",
] as const;

/** Preserve all company-defined fields; only partition the form, never rewrite values. */
export function sectionsForSurveyStep(sections: FieldSection[], step: number) {
  return sections.flatMap((section) => {
    if (section.key.startsWith("en_")) {
      if (["en_roof", "en_measure", "en_identification"].includes(section.key)) {
        const fields = section.fields.filter(f=>{
          const group = section.key === "en_roof" ? /en_module_|en_count|en_orientation/.test(f.key) ? 1 : /en_margin|en_gap|en_structure/.test(f.key) ? 2 : 0
            : section.key === "en_identification" ? f.key === "en_model" ? 1 : 0
            : /en_free_|en_min_|en_space_|en_location/.test(f.key) ? 2 : /en_power|en_capacity/.test(f.key) ? 1 : 0;
          return group === step;
        });
        return fields.length ? [{...section,fields}] : [];
      }
      const group = section.key === "en_verify" ? 3 : section.key === "en_route" ? 2 : ["en_identification", "en_roof", "en_measure"].includes(section.key) ? 0 : 1;
      return group === step ? [section] : [];
    }
    if (section.key === "rv_misure") {
      const fields = section.fields.filter((f) =>
        step === 0
          ? f.key === "rv_measure_basis"
          : step === 3 && f.key !== "rv_measure_basis",
      );
      return fields.length
        ? [
            {
              ...section,
              fields,
              ...(step === 0
                ? {
                    key: "rv_measure_basis_step",
                    label: "A cosa si riferiscono le misure?",
                  }
                : { label: "Verifica misure per ordine · facoltativa" }),
            },
          ]
        : [];
    }
    if (section.key.startsWith("rv_") || /complementi|sez_/.test(section.key)) {
      const group =
        section.key === "rv_misure"
          ? 3
          : /complementi|sez_|rv_(cassonetto|tapparella|zanzariera|persiana|door_installation|abaco_posa)/.test(
                section.key,
              )
            ? 2
            : /identificazione|dati_chiave|misure|specifiche|rv_door_configuration/.test(
                  section.key,
                )
              ? 0
              : 1;
      return group === step ? [section] : [];
    }
    const fields = section.fields.filter((f) => {
      const group = /accessori|complementi/.test(f.key)
        ? 2
        : f.type === "textarea" || /note|criticita/.test(f.key)
          ? 3
          : /larghezza|altezza|width|height|profondita|spessore_muro|mazzetta|tipologia/.test(
                f.key,
              )
            ? 0
            : 1;
      return group === step;
    });
    return fields.length ? [{ ...section, fields }] : [];
  });
}

const PRODUCT_GUIDES: Record<string, string> = {
  infisso:
    "Rileva il foro, scegli telaio e apertura, poi aggiungi solo i complementi presenti.",
  portoncino_blindato:
    "Rileva vano e sopraluce, scegli ante e apertura dall’esterno; verifica controtelaio e finiture dei due lati.",
  porta_interna:
    "Identifica le stanze dei lati A e B; rileva vano, muro, apertura e controtelaio senza dedurre misure finite.",
  cassonetto_standalone:
    "Rileva L, H e P del cassonetto; indica separatamente C, la profondità totale del cielino.",
  tapparella_standalone:
    "Rileva il telo, poi verifica guide, rullo, comando e alimentazione del motore.",
  zanzariera_standalone:
    "Rileva il vano utile, scegli il tipo di apertura e controlla guide, soglia e ingombri.",
  persiana_standalone:
    "Rileva il vano, verifica ante, apertura e vincoli di fissaggio.",
};
export function surveyProductGuide(type: ElementTypeDefinition) {
  return (
    PRODUCT_GUIDES[type.key] ||
    type.description ||
    "Compila i dati pertinenti a questo elemento. Puoi salvare anche un rilievo da completare."
  );
}

/** The same area/element order used in the report, independent of current search filters. */
export function nextSurveyElement(detail: SurveyDetail, currentId: string) {
  const areas = [...detail.areas].sort((a, b) => a.position - b.position);
  const areaIds = new Set(areas.map((a) => a.id));
  const ordered = [
    ...areas.flatMap((a) =>
      detail.elements
        .filter((e) => e.area_id === a.id)
        .sort((a, b) => a.position - b.position),
    ),
    ...detail.elements
      .filter((e) => !areaIds.has(e.area_id))
      .sort((a, b) => a.position - b.position),
  ].filter((e) =>
    detail.template.schema.element_types.some((t) => t.key === e.element_type),
  );
  const index = ordered.findIndex((e) => e.id === currentId);
  return index < 0 ? undefined : ordered[index + 1];
}

export function surveyElementReview(
  type: ElementTypeDefinition,
  values: Record<string, unknown>,
  photoKeys: Set<string>,
) {
  const missing = surveySections(windowSurveySections(type), values)
    .flatMap((s) => s.fields)
    .filter(
      (f) =>
        f.required &&
        f.missing &&
        !(
          f.key === "apertura" &&
          type.key === "portoncino_blindato" &&
          portoncinoOpeningComplete(values)
        ),
    )
    .map((f) => ({ key: f.key, label: f.label }));
  const photos = type.required_photos.filter(
    (p) => p.required && !photoKeys.has(p.key),
  );
  const checks = [
    ...energyIssues(type, values),
    ...energyGeometryIssues(type, values),
    ...windowSurveyIssues(type, values).filter(
      (issue) => !issue.startsWith("Misure d’ordine non verificate:"),
    ),
    ...(windowSurveyDrawing(type, values)?.warnings ?? []).filter(
      (issue) =>
        /da confermare|da rilevare|da definire|rileva|non riconosciuto|verifica/i.test(
          issue,
        ) &&
        !(
          type.key === "portoncino_blindato" &&
          /Anta \d+: apertura o lato|Spingere o tirare|Cerniere e spingere/.test(
            issue,
          )
        ),
    ),
    ...(type.key === "portoncino_blindato" && !portoncinoOpeningComplete(values)
      ? [
          "Conferma cerniere e spingere/tirare guardando il portoncino dall’esterno.",
        ]
      : []),
  ];
  return { missing, photos, checks: [...new Set(checks)] };
}

export function visibleSurveySections(
  sections: FieldSection[],
  values: Record<string, unknown>,
) {
  return sections.filter((s) => isVisible(s.show_if, values));
}
