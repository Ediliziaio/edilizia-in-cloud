import type {
  ConfigurazionePersiane,
  ExistingShutterType,
  FacadeOpeningKind,
  FacadeOpeningPosition,
  PersianePhotoMeta,
  PersianeSceneAnalysis,
  PersianeSceneOpening,
  PersianeTargetSelection,
} from "./types.ts";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOr(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "si", "sì", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeOpeningPosition(value: unknown): FacadeOpeningPosition {
  const raw = stringOr(value, "unknown").toLowerCase().replace(/\s+/g, "_");
  const allowed: FacadeOpeningPosition[] = [
    "far_left",
    "left",
    "center",
    "right",
    "far_right",
    "upper_left",
    "upper_center",
    "upper_right",
    "lower_left",
    "lower_center",
    "lower_right",
    "full_width",
    "unknown",
  ];
  return allowed.includes(raw as FacadeOpeningPosition) ? (raw as FacadeOpeningPosition) : "unknown";
}

function normalizeOpeningKind(value: unknown): FacadeOpeningKind {
  const raw = stringOr(value, "unknown").toLowerCase().replace(/\s+/g, "_");
  if (["window", "finestra"].includes(raw)) return "window";
  if (["door_window", "portafinestra"].includes(raw)) return "door_window";
  if (["balcony_door", "balcone"].includes(raw)) return "balcony_door";
  if (["arched_window", "arco"].includes(raw)) return "arched_window";
  return "unknown";
}

function normalizeShutterType(value: unknown, present: boolean): ExistingShutterType {
  if (!present) return "nessuna";
  const raw = stringOr(value, "unknown").toLowerCase().replace(/\s+/g, "_");
  if (raw.includes("veneziana_classica")) return "veneziana_classica";
  if (raw.includes("veneziana_esterna")) return "veneziana_esterna";
  if (raw.includes("scuro_pieno")) return "scuro_pieno";
  if (raw.includes("scuro_cornice")) return "scuro_cornice";
  if (raw.includes("gelosia")) return "gelosia";
  if (raw.includes("avvolgibile")) return "avvolgibile_esterno";
  if (raw.includes("a_libro")) return "a_libro";
  if (raw.includes("griglia")) return "griglia_sicurezza";
  if (raw.includes("brise")) return "brise_soleil";
  if (raw.includes("battente") || raw.includes("persiana")) return "battente_generica";
  return "unknown";
}

function inferImageOrientation(meta?: PersianePhotoMeta | null): PersianeSceneAnalysis["imageOrientation"] {
  if (!meta) return "unknown";
  return meta.orientation;
}

function normalizeOpening(input: Record<string, unknown>, index: number): PersianeSceneOpening {
  const hasExistingShutter = booleanOr(
    input.has_existing_shutter ?? input.hasExistingShutter ?? input.presenza_persiana,
    false,
  );
  const id = stringOr(input.id, String.fromCharCode(65 + index));

  return {
    id,
    label: id,
    order: numberOr(input.order, index),
    position: normalizeOpeningPosition(input.position ?? input.posizione),
    approximatePlacement: stringOr(
      input.approximate_placement ?? input.approximatePlacement ?? input.placement,
      "same photographed opening",
    ),
    openingKind: normalizeOpeningKind(input.opening_kind ?? input.openingKind ?? input.tipo_apertura),
    apparentSize: stringOr(
      input.apparent_size ?? input.apparentSize ?? input.dimensione_apparente,
      "not precisely estimated",
    ),
    specialShape: optionalString(input.special_shape ?? input.specialShape ?? input.sagoma_speciale),
    hasExistingShutter,
    existingShutterType: normalizeShutterType(
      input.existing_shutter_type ?? input.existingShutterType ?? input.tipo_persiana_esistente,
      hasExistingShutter,
    ),
    materialPerceived: stringOr(input.material_perceived ?? input.materialPerceived ?? input.materiale_percepito, "unknown"),
    colorPerceived: stringOr(input.color_perceived ?? input.colorPerceived ?? input.colore_percepito, "unknown"),
    openingStatePerceived: stringOr(
      input.opening_state_perceived ?? input.openingStatePerceived ?? input.stato_apertura,
      "unknown",
    ) as PersianeSceneOpening["openingStatePerceived"],
    leafOrientation: stringOr(input.leaf_orientation ?? input.leafOrientation ?? input.orientamento_ante, "unknown"),
    leafCount: numberOr(input.leaf_count ?? input.leafCount ?? input.numero_ante, hasExistingShutter ? 2 : 0),
    hasLouvers: booleanOr(input.has_louvers ?? input.hasLouvers ?? input.presenza_lamelle, false),
    louverState: stringOr(input.louver_state ?? input.louverState ?? input.stato_lamelle, "unknown"),
    hasHinges: booleanOr(input.has_hinges ?? input.hasHinges ?? input.presenza_cardini, hasExistingShutter),
    hasHoldOpenHardware: booleanOr(
      input.has_hold_open_hardware ?? input.hasHoldOpenHardware ?? input.presenza_fermapersiane,
      false,
    ),
    hasTracks: booleanOr(input.has_tracks ?? input.hasTracks ?? input.presenza_binari, false),
    hasSideGuides: booleanOr(input.has_side_guides ?? input.hasSideGuides ?? input.presenza_guide, false),
    hasHeadBox: booleanOr(input.has_head_box ?? input.hasHeadBox ?? input.presenza_cassonetto, false),
    hasSecurityGrille: booleanOr(
      input.has_security_grille ?? input.hasSecurityGrille ?? input.presenza_grata,
      false,
    ),
    revealDepth: stringOr(input.reveal_depth ?? input.revealDepth ?? input.profondita_vano, "unknown"),
    trimDetails: stringArray(input.trim_details ?? input.trimDetails ?? input.cornici_spallette),
    lightingNotes: stringOr(
      input.lighting_notes ?? input.lightingNotes ?? input.note_luce,
      "preserve the same facade lighting",
    ),
    shadowNotes: stringOr(
      input.shadow_notes ?? input.shadowNotes ?? input.note_ombre,
      "preserve shadow logic from the source photo",
    ),
    geometryNotes: stringOr(
      input.geometry_notes ?? input.geometryNotes ?? input.note_geometria,
      "keep the same opening geometry and wall depth",
    ),
    preserveNotes: stringOr(
      input.preserve_notes ?? input.preserveNotes ?? input.note_preservazione,
      "preserve non-target facade details exactly",
    ),
  };
}

function inferPrimaryOpeningId(openings: PersianeSceneOpening[], hint: string | null): string | null {
  if (openings.length === 0) return null;
  if (openings.length === 1) return openings[0].id;
  const normalizedHint = hint?.toLowerCase() ?? "";
  if (normalizedHint.includes("left")) {
    return openings.find((opening) => opening.position === "left" || opening.position === "far_left" || opening.position === "upper_left" || opening.position === "lower_left")?.id ?? openings[0].id;
  }
  if (normalizedHint.includes("right")) {
    return openings.find((opening) => opening.position === "right" || opening.position === "far_right" || opening.position === "upper_right" || opening.position === "lower_right")?.id ?? openings.at(-1)?.id ?? openings[0].id;
  }
  return openings.find((opening) => opening.position === "center" || opening.position === "upper_center" || opening.position === "lower_center")?.id ?? openings[0].id;
}

export function normalizePersianeSceneAnalysis(
  rawAnalysis: unknown,
  photoMeta?: PersianePhotoMeta | null,
): PersianeSceneAnalysis {
  const source = asObject(rawAnalysis);
  const legacy = {
    tipo_facciata: stringOr(source.tipo_facciata ?? source.facadeType, "residenziale"),
    persiane_attuali: stringOr(source.persiane_attuali, "non identificate"),
    materiale_attuale: stringOr(source.materiale_attuale, "sconosciuto"),
    colore_attuale: stringOr(source.colore_attuale, "sconosciuto"),
    numero_finestre: numberOr(source.numero_finestre ?? source.openingsVisible, 1),
    stato_conservazione: stringOr(source.stato_conservazione, "non valutato"),
    note: typeof source.note === "string" ? source.note : undefined,
  };

  const openingsSource = Array.isArray(source.openings) ? source.openings : [];
  const openings = openingsSource.length > 0
    ? openingsSource.map((item, index) => normalizeOpening(asObject(item), index))
    : [
        normalizeOpening(
          {
            id: "A",
            opening_kind: "window",
            has_existing_shutter: legacy.persiane_attuali !== "non identificate" && legacy.persiane_attuali !== "nessuna",
            existing_shutter_type: legacy.persiane_attuali,
            material_perceived: legacy.materiale_attuale,
            color_perceived: legacy.colore_attuale,
            opening_state_perceived: "unknown",
          },
          0,
        ),
      ];

  const primaryTargetHint = optionalString(
    source.primary_target_hint ?? source.primaryTargetHint ?? source.target_hint,
  );
  return {
    version: "2.0",
    facadeType: stringOr(source.facade_type ?? source.facadeType ?? source.tipo_facciata, legacy.tipo_facciata),
    buildingStyle: stringOr(source.building_style ?? source.buildingStyle ?? source.stile_edificio, "residential facade"),
    imageOrientation: inferImageOrientation(photoMeta),
    openingsVisible: numberOr(source.openings_visible ?? source.openingsVisible ?? source.numero_finestre, openings.length),
    targetableOpenings: openings.length,
    cameraAngle: stringOr(source.camera_angle ?? source.cameraAngle, "same photographed camera angle"),
    lightingCondition: stringOr(
      source.lighting_condition ?? source.lightingCondition ?? source.note_luce,
      "preserve same daylight and shadow structure",
    ),
    wallTexture: stringOr(source.wall_texture ?? source.wallTexture ?? source.texture_muro, "same wall texture"),
    wallColor: stringOr(source.wall_color ?? source.wallColor ?? source.colore_muro, "same wall color"),
    untouchedElements: Array.from(new Set([
      ...stringArray(source.untouched_elements ?? source.untouchedElements),
      "window frames",
      "glass",
      "sills",
      "facade proportions",
    ])),
    preserveRigidly: Array.from(new Set([
      ...stringArray(source.preserve_rigidly ?? source.preserveRigidly),
      "same facade geometry",
      "same facade crop",
      "same wall texture",
    ])),
    openings,
    primaryTargetHint,
    noteAnalisi: stringOr(
      source.note_analisi ?? source.noteAnalisi ?? source.note,
      legacy.note ?? "same facade, same wall and same architectural identity",
    ),
    legacy,
  };
}

export function createPersianeTargetSelection(
  config: ConfigurazionePersiane,
  sceneAnalysis: PersianeSceneAnalysis,
): PersianeTargetSelection {
  const openings = sceneAnalysis.openings;
  const primaryOpeningId = inferPrimaryOpeningId(openings, sceneAnalysis.primaryTargetHint);

  if (config.target_mode === "selected_openings" && Array.isArray(config.selected_opening_ids) && config.selected_opening_ids.length > 0) {
    const selected = openings
      .filter((opening) => config.selected_opening_ids?.includes(opening.id))
      .map((opening) => opening.id);
    return {
      mode: selected.length > 1 ? "multiple" : "single",
      selectedOpeningIds: selected,
      preservedOpeningIds: openings.filter((opening) => !selected.includes(opening.id)).map((opening) => opening.id),
      primaryOpeningId: selected[0] ?? primaryOpeningId,
      targetLabels: openings.filter((opening) => selected.includes(opening.id)).map((opening) => opening.label),
    };
  }

  if (config.applica_tutte_finestre || config.target_mode === "all_visible") {
    return {
      mode: "all",
      selectedOpeningIds: openings.map((opening) => opening.id),
      preservedOpeningIds: [],
      primaryOpeningId,
      targetLabels: openings.map((opening) => opening.label),
    };
  }

  const singleId = primaryOpeningId ?? openings[0]?.id ?? null;
  return {
    mode: "single",
    selectedOpeningIds: singleId ? [singleId] : [],
    preservedOpeningIds: openings.filter((opening) => opening.id !== singleId).map((opening) => opening.id),
    primaryOpeningId: singleId,
    targetLabels: openings.filter((opening) => opening.id === singleId).map((opening) => opening.label),
  };
}
