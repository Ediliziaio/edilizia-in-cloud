import type {
  ConfigurazioneFacciata,
  FacciataPhotoMeta,
  FacciataSceneAnalysis,
  FacciataSceneFeatures,
  FacciataSceneOpening,
  FacciataZoneDirective,
  FacciataZoneId,
  FacciataZoneTargeting,
} from "./types.ts";
import { ZONE_LABELS } from "./promptFragments.ts";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sì"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function stringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeOrientation(meta?: FacciataPhotoMeta | null): FacciataSceneAnalysis["imageOrientation"] {
  return meta?.orientation ?? "unknown";
}

function normalizePosition(value: unknown): FacciataSceneOpening["position"] {
  const raw = stringOr(value, "unknown").toLowerCase().replace(/\s+/g, "_");
  const allowed: FacciataSceneOpening["position"][] = [
    "far_left",
    "left",
    "center_left",
    "center",
    "center_right",
    "right",
    "far_right",
    "upper_left",
    "upper_center",
    "upper_right",
    "ground_left",
    "ground_center",
    "ground_right",
    "unknown",
  ];
  return allowed.includes(raw as FacciataSceneOpening["position"])
    ? (raw as FacciataSceneOpening["position"])
    : "unknown";
}

function normalizeOpeningKind(value: unknown): FacciataSceneOpening["openingKind"] {
  const raw = stringOr(value, "unknown").toLowerCase().replace(/\s+/g, "_");
  if (["window", "finestra"].includes(raw)) return "window";
  if (["door_window", "portafinestra"].includes(raw)) return "door_window";
  if (["balcony_door", "porta_balcone", "balcone"].includes(raw)) return "balcony_door";
  if (["entrance_door", "portone"].includes(raw)) return "entrance_door";
  if (["garage_door", "garage"].includes(raw)) return "garage_door";
  if (["arched_window", "arco"].includes(raw)) return "arched_window";
  return "unknown";
}

function buildFeatureSet(source: Record<string, unknown>): FacciataSceneFeatures {
  const nestedFeatures = asObject(source.features);
  return {
    corniciFinestre: booleanOr(source.cornici_finestre ?? source.window_cornices ?? nestedFeatures.cornici_finestre ?? nestedFeatures.window_cornices, false),
    marcapiani: booleanOr(source.marcapiani ?? source.string_courses ?? nestedFeatures.marcapiani ?? nestedFeatures.string_courses, false),
    davanzali: booleanOr(source.davanzali ?? source.sills ?? nestedFeatures.davanzali ?? nestedFeatures.sills, true),
    zoccolatura: booleanOr(source.zoccolatura ?? source.base_course ?? nestedFeatures.zoccolatura ?? nestedFeatures.base_course, false),
    gronde: booleanOr(source.gronde ?? source.gutters ?? nestedFeatures.gronde ?? nestedFeatures.gutters, true),
    pluviali: booleanOr(source.pluviali ?? source.downpipes ?? nestedFeatures.pluviali ?? nestedFeatures.downpipes, false),
    balconi: booleanOr(source.balconi ?? source.balconies ?? nestedFeatures.balconi ?? nestedFeatures.balconies, false),
    ringhiere: booleanOr(source.ringhiere ?? source.railings ?? nestedFeatures.ringhiere ?? nestedFeatures.railings, false),
    persiane: booleanOr(source.persiane ?? source.shutters ?? nestedFeatures.persiane ?? nestedFeatures.shutters, false),
    portone: booleanOr(source.portone ?? source.entrance_door ?? nestedFeatures.portone ?? nestedFeatures.entrance_door, false),
    garage: booleanOr(source.garage ?? source.garage_door ?? nestedFeatures.garage ?? nestedFeatures.garage_door, false),
    corpiIlluminanti: booleanOr(source.corpi_illuminanti ?? source.lights ?? nestedFeatures.corpi_illuminanti ?? nestedFeatures.lights, false),
    citofoniCassette: booleanOr(source.citofoni_cassette ?? source.intercoms_mailboxes ?? nestedFeatures.citofoni_cassette ?? nestedFeatures.intercoms_mailboxes, false),
    caviCanaline: booleanOr(source.cavi_canaline ?? source.cables ?? nestedFeatures.cavi_canaline ?? nestedFeatures.cables, false),
    climatizzatori: booleanOr(source.climatizzatori ?? source.air_conditioners ?? nestedFeatures.climatizzatori ?? nestedFeatures.air_conditioners, false),
  };
}

function fallbackOpenings(count: number): FacciataSceneOpening[] {
  const safeCount = Math.max(1, Math.min(count, 8));
  return Array.from({ length: safeCount }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    label: `Apertura ${String.fromCharCode(65 + index)}`,
    order: index,
    position: safeCount === 1 ? "center" : index === 0 ? "left" : index === safeCount - 1 ? "right" : "center",
    floorHint: index < Math.ceil(safeCount / 2) ? "upper floor" : "ground floor",
    openingKind: "window",
    apparentSize: "medium",
    specialShape: null,
    hasCornice: false,
    hasSill: true,
    sillMaterial: "existing sill",
    hasShutter: false,
    shutterType: "not clearly visible",
    hasBalcony: false,
    hasRailing: false,
    revealDepth: "medium reveal depth",
    lightingNotes: "preserve the same daylight orientation",
    shadowNotes: "preserve the same facade shadows",
    preserveNotes: "keep opening geometry, frame and glazing identical",
  }));
}

function normalizeOpening(input: Record<string, unknown>, index: number): FacciataSceneOpening {
  const id = stringOr(input.id, String.fromCharCode(65 + index));
  return {
    id,
    label: stringOr(input.label, `Apertura ${id}`),
    order: numberOr(input.order, index),
    position: normalizePosition(input.position ?? input.posizione),
    floorHint: stringOr(input.floor_hint ?? input.floorHint ?? input.piano, "unknown floor"),
    openingKind: normalizeOpeningKind(input.opening_kind ?? input.openingKind ?? input.tipo_apertura),
    apparentSize: stringOr(input.apparent_size ?? input.apparentSize ?? input.dimensione_apparente, "medium"),
    specialShape: typeof input.special_shape === "string" ? input.special_shape : typeof input.sagoma_speciale === "string" ? input.sagoma_speciale : null,
    hasCornice: booleanOr(input.has_cornice ?? input.hasCornice ?? input.presenza_cornice, false),
    hasSill: booleanOr(input.has_sill ?? input.hasSill ?? input.presenza_davanzale, true),
    sillMaterial: stringOr(input.sill_material ?? input.sillMaterial ?? input.materiale_davanzale, "existing sill"),
    hasShutter: booleanOr(input.has_shutter ?? input.hasShutter ?? input.presenza_persiane, false),
    shutterType: stringOr(input.shutter_type ?? input.shutterType ?? input.tipo_persiana, "not clearly visible"),
    hasBalcony: booleanOr(input.has_balcony ?? input.hasBalcony ?? input.presenza_balcone, false),
    hasRailing: booleanOr(input.has_railing ?? input.hasRailing ?? input.presenza_ringhiera, false),
    revealDepth: stringOr(input.reveal_depth ?? input.revealDepth ?? input.profondita_vano, "medium reveal depth"),
    lightingNotes: stringOr(input.lighting_notes ?? input.lightingNotes ?? input.note_luce, "preserve the same facade lighting"),
    shadowNotes: stringOr(input.shadow_notes ?? input.shadowNotes ?? input.note_ombre, "preserve the same shadow structure"),
    preserveNotes: stringOr(input.preserve_notes ?? input.preserveNotes ?? input.note_preservazione, "keep this opening identical unless explicitly in scope"),
  };
}

export function normalizeFacciataSceneAnalysis(
  rawAnalysis: unknown,
  photoMeta?: FacciataPhotoMeta | null,
): FacciataSceneAnalysis {
  const source = asObject(rawAnalysis);
  const legacy = {
    tipo_edificio: stringOr(source.tipo_edificio ?? source.buildingType, "residenziale"),
    numero_piani: numberOr(source.numero_piani ?? source.floors_count, 2),
    numero_finestre: numberOr(source.numero_finestre ?? source.openings_visible ?? source.visible_openings, 4),
    intonaco_attuale: stringOr(source.intonaco_attuale ?? source.current_plaster_finish, "intonaco civile"),
    colore_attuale_hex: stringOr(source.colore_attuale_hex ?? source.current_facade_color ?? source.primary_color, "#D3D3D3"),
    stato_conservazione: stringOr(source.stato_conservazione ?? source.current_condition, "discreto"),
    elementi_presenti: stringArray(source.elementi_presenti ?? source.detected_elements),
    note: typeof source.note === "string" ? source.note : undefined,
  };

  const openingsSource = Array.isArray(source.openings) ? source.openings : [];
  const openings = openingsSource.length
    ? openingsSource.map((item, index) => normalizeOpening(asObject(item), index))
    : fallbackOpenings(legacy.numero_finestre);

  return {
    version: "2.0",
    buildingType: stringOr(source.building_type ?? source.buildingType ?? source.tipo_edificio, legacy.tipo_edificio),
    buildingStyle: stringOr(source.building_style ?? source.buildingStyle ?? source.architectural_style ?? source.stile_percepito, "residential Italian building"),
    floorsCount: numberOr(source.floors_count ?? source.numero_piani, legacy.numero_piani),
    openingsVisible: numberOr(source.openings_visible ?? source.visible_openings ?? source.numero_finestre, openings.length),
    cameraAngle: stringOr(source.camera_angle ?? source.cameraAngle, "same photographed camera angle"),
    lightingCondition: stringOr(source.lighting_condition ?? source.lightingCondition ?? source.note_luce, "preserve the same daylight and shadows"),
    wallTexture: stringOr(source.wall_texture ?? source.wallTexture ?? source.texture_muro, "same wall texture"),
    currentPlasterFinish: stringOr(source.current_plaster_finish ?? source.current_finish ?? source.intonaco_attuale, legacy.intonaco_attuale),
    currentFacadeColor: stringOr(source.current_facade_color ?? source.primary_color ?? source.colore_attuale_hex, legacy.colore_attuale_hex),
    currentCondition: stringOr(source.current_condition ?? source.stato_conservazione, legacy.stato_conservazione),
    imageOrientation: normalizeOrientation(photoMeta),
    groundContext: stringOr(source.ground_context ?? source.contesto_terra, "preserve street, pavement and ground context exactly"),
    preservedContext: Array.from(new Set([
      ...stringArray(source.preserved_context ?? source.contesto_preservato),
      "sky",
      "road",
      "pavement",
      "vegetation",
      "neighboring buildings",
      "vehicles",
      "people",
    ])),
    preserveRigidly: Array.from(new Set([
      ...stringArray(source.preserve_rigidly ?? source.preserveRigidly),
      "same building geometry",
      "same facade crop",
      "same perspective",
      "same image dimensions",
    ])),
    openings,
    features: buildFeatureSet(source),
    noteAnalisi: stringOr(source.note_analisi ?? source.noteAnalisi ?? source.note, legacy.note ?? "preserve the same building identity"),
    legacy,
  };
}

function addZone(
  directives: FacciataZoneDirective[],
  zoneId: FacciataZoneId,
  system: FacciataZoneDirective["system"],
  action: FacciataZoneDirective["action"],
  summary: string,
) {
  const duplicate = directives.find((item) => item.zoneId === zoneId && item.system === system && item.action === action);
  if (duplicate) return;
  directives.push({
    zoneId,
    label: ZONE_LABELS[zoneId],
    system,
    action,
    summary,
  });
}

const ALL_FACADE_ZONES: FacciataZoneId[] = [
  "tutta",
  "piano_terra",
  "piani_superiori",
  "zoccolatura",
  "fasce_orizzontali",
  "cantonali",
  "marcapiano",
  "cornici_finestre",
  "davanzali",
  "gronde",
  "balconi_ringhiere",
];

export function createFacciataZoneTargeting(
  config: ConfigurazioneFacciata,
  _analysis: FacciataSceneAnalysis,
): FacciataZoneTargeting {
  const affectedZones: FacciataZoneDirective[] = [];

  if (config.intonaco.attivo) {
    addZone(
      affectedZones,
      config.intonaco.zona,
      "intonaco",
      "apply",
      `Apply the new plaster/paint system only to ${ZONE_LABELS[config.intonaco.zona]}.`,
    );
  }

  if (config.rivestimento.attivo) {
    addZone(
      affectedZones,
      config.rivestimento.zona,
      "rivestimento",
      "apply",
      `Apply the selected cladding only to ${ZONE_LABELS[config.rivestimento.zona]}.`,
    );
  }

  if (config.cappotto.attivo) {
    const zone = config.cappotto.zona ?? "tutta";
    addZone(
      affectedZones,
      zone,
      "cappotto",
      "apply",
      `Apply thermal insulation only to ${ZONE_LABELS[zone]}.`,
    );
  }

  if (config.elementi.cornici_finestre.azione !== "mantieni") {
    addZone(
      affectedZones,
      "cornici_finestre",
      "cornici_finestre",
      config.elementi.cornici_finestre.azione === "rimuovi" ? "remove" : "add",
      config.elementi.cornici_finestre.azione === "rimuovi"
        ? "Remove window cornices where currently visible."
        : "Add new window cornices around the existing openings.",
    );
  }

  if (config.elementi.marcapiani.azione !== "mantieni") {
    addZone(
      affectedZones,
      "marcapiano",
      "marcapiani",
      config.elementi.marcapiani.azione === "rimuovi" ? "remove" : "add",
      config.elementi.marcapiani.azione === "rimuovi"
        ? "Remove the existing string courses / marcapiani."
        : "Add new string courses aligned across the facade.",
    );
  }

  if (config.elementi.davanzali.azione === "sostituisci") {
    addZone(
      affectedZones,
      "davanzali",
      "davanzali",
      "replace",
      "Replace existing sills with the selected material and profile.",
    );
  }

  if (config.elementi.zoccolatura.azione !== "mantieni") {
    addZone(
      affectedZones,
      "zoccolatura",
      "zoccolatura",
      config.elementi.zoccolatura.azione === "rimuovi" ? "remove" : "add",
      config.elementi.zoccolatura.azione === "rimuovi"
        ? "Remove the base course / zoccolatura and restore a clean wall transition."
        : "Add a new base course with a crisp upper line.",
    );
  }

  if (config.elementi.gronde.azione === "sostituisci") {
    addZone(
      affectedZones,
      "gronde",
      "gronde",
      "replace",
      "Replace gutters and visible eaves accessories with the selected finish.",
    );
  }

  if (config.elementi.balconi_ringhiere.azione === "vernicia") {
    addZone(
      affectedZones,
      "balconi_ringhiere",
      "balconi_ringhiere",
      "repaint",
      "Repaint balcony railings only, preserving geometry and design.",
    );
  }

  const activeSystems = Array.from(new Set(affectedZones.map((item) => item.system)));
  const inactiveSystems = [
    "intonaco",
    "rivestimento",
    "cappotto",
    "cornici_finestre",
    "marcapiani",
    "davanzali",
    "zoccolatura",
    "gronde",
    "balconi_ringhiere",
  ].filter((system) => !activeSystems.includes(system));

  const affectedZoneIds = new Set(affectedZones.map((item) => item.zoneId));
  const untouchedZones = ALL_FACADE_ZONES
    .filter((zoneId) => !affectedZoneIds.has(zoneId))
    .map((zoneId) => ({
      zoneId,
      label: ZONE_LABELS[zoneId],
      summary: `Keep ${ZONE_LABELS[zoneId]} unchanged unless implicitly affected by a requested adjacent transition.`,
    }));

  return {
    affectedZones,
    untouchedZones,
    activeSystems,
    inactiveSystems,
  };
}
