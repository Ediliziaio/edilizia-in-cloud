import type {
  AnalisiBagno,
  BathroomCondition,
  BathroomCurrentBathtub,
  BathroomCurrentSanitaryWare,
  BathroomCurrentShower,
  BathroomCurrentVanity,
  BathroomLayoutType,
  BathroomLightingAnalysis,
  BathroomPhotoMeta,
  BathroomRoomType,
  BathroomSceneAnalysis,
  BathroomSurfaceAnalysis,
  BathroomZonePosition,
} from "./types.ts";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function stringArray(value: unknown, limit = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeRoomType(value: unknown): BathroomRoomType {
  const raw = stringOr(value, "unknown").toLowerCase();
  if (["bagno", "bathroom"].includes(raw)) return "bathroom";
  if (["ensuite", "en_suite"].includes(raw)) return "ensuite";
  if (["powder_room", "wc"].includes(raw)) return "powder_room";
  if (["wet_room", "stanza_umida"].includes(raw)) return "wet_room";
  if (["laundry_bath", "lavanderia_bagno"].includes(raw)) return "laundry_bath";
  return "unknown";
}

function normalizeLayoutType(value: unknown, hasShower: boolean, hasTub: boolean): BathroomLayoutType {
  const raw = stringOr(value, "").toLowerCase().replace(/\s+/g, "_");
  const allowed: BathroomLayoutType[] = [
    "linear_single_wall",
    "opposed_walls",
    "corner_shower",
    "bathtub_alcove",
    "compact_rectangular",
    "split_zones",
    "unknown",
  ];
  if (allowed.includes(raw as BathroomLayoutType)) return raw as BathroomLayoutType;
  if (hasTub) return "bathtub_alcove";
  if (hasShower) return "corner_shower";
  return "compact_rectangular";
}

function normalizeZonePosition(value: unknown): BathroomZonePosition {
  const raw = stringOr(value, "").toLowerCase().replace(/\s+/g, "_");
  const allowed: BathroomZonePosition[] = [
    "left_wall",
    "right_wall",
    "back_wall",
    "center",
    "corner_left",
    "corner_right",
    "under_window",
    "unknown",
  ];
  return allowed.includes(raw as BathroomZonePosition) ? (raw as BathroomZonePosition) : "unknown";
}

function normalizeCondition(value: unknown): BathroomCondition {
  const raw = stringOr(value, "discreto").toLowerCase().replace(/\s+/g, "_");
  if (raw === "buono") return "buono";
  if (raw === "da_ristrutturare") return "da_ristrutturare";
  return "discreto";
}

function inferCameraPerspective(meta?: BathroomPhotoMeta | null): string {
  if (!meta) return "unknown";
  if (meta.orientation === "portrait") return "frontal portrait framing of the bathroom";
  if (meta.orientation === "landscape") return "wide horizontal framing of the bathroom";
  return "square centered framing";
}

function inferSurfaceAnalysis(
  raw: Record<string, unknown>,
  fallbackDescription: string,
  fallbackEffect: string,
): BathroomSurfaceAnalysis {
  return {
    description: stringOr(raw.description ?? raw.descrizione, fallbackDescription),
    effect: stringOr(raw.effect ?? raw.effetto, fallbackEffect),
    format: stringOr(raw.format ?? raw.formato, "unknown"),
    layingPattern: stringOr(raw.laying_pattern ?? raw.posa, "unknown"),
    groutColor: stringOr(raw.grout_color ?? raw.fuga_colore, "unknown"),
    coverage: optionalString(raw.coverage ?? raw.copertura),
  };
}

function normalizeCurrentShower(source: Record<string, unknown>): BathroomCurrentShower {
  const present = booleanOr(source.present ?? source.presenza_doccia, false);
  const typeRaw = stringOr(source.type ?? source.tipo_doccia, present ? "unknown" : "none").toLowerCase();
  const mappedType =
    typeRaw.includes("walk") ? "walk_in" :
    typeRaw.includes("nicchia") ? "nicchia_box" :
    typeRaw.includes("front") ? "frontale_box" :
    typeRaw.includes("semi") ? "semicircolare" :
    typeRaw.includes("angol") || typeRaw.includes("corner") ? "angolare" :
    present ? "unknown" : "none";

  return {
    present,
    type: mappedType,
    position: normalizeZonePosition(source.position ?? source.posizione),
    enclosureType: stringOr(source.enclosure_type ?? source.box_type, present ? "existing shower enclosure" : "none"),
    glassType: stringOr(source.glass_type ?? source.vetro, present ? "not identified" : "none"),
    trayType: stringOr(source.tray_type ?? source.piatto, present ? "not identified" : "none"),
    frameFinish: stringOr(source.frame_finish ?? source.profilo, present ? "not identified" : "none"),
    notes: stringOr(source.notes ?? source.note_doccia, present ? "existing shower zone visible in the source bathroom" : "no current shower detected"),
  };
}

function normalizeCurrentBathtub(source: Record<string, unknown>): BathroomCurrentBathtub {
  const present = booleanOr(source.present ?? source.presenza_vasca, false);
  const typeRaw = stringOr(source.type ?? source.tipo_vasca, present ? "unknown" : "none").toLowerCase();
  const mappedType =
    typeRaw.includes("freestanding") && typeRaw.includes("ov") ? "freestanding_ovale" :
    typeRaw.includes("freestanding") ? "freestanding_rettangolare" :
    typeRaw.includes("back") ? "back_to_wall" :
    typeRaw.includes("incass") || typeRaw.includes("built") ? "incassata" :
    typeRaw.includes("angol") ? "angolare" :
    present ? "unknown" : "none";

  return {
    present,
    type: mappedType,
    position: normalizeZonePosition(source.position ?? source.posizione),
    faucetType: stringOr(source.faucet_type ?? source.rubinetteria_vasca, present ? "not identified" : "none"),
    screenPresent: booleanOr(source.screen_present ?? source.schermo_vasca, false),
    notes: stringOr(source.notes ?? source.note_vasca, present ? "existing bathtub visible in the source bathroom" : "no bathtub detected"),
  };
}

function normalizeCurrentVanity(source: Record<string, unknown>): BathroomCurrentVanity {
  const present = booleanOr(source.present ?? source.presenza_mobile, false);
  const typeRaw = stringOr(source.type ?? source.tipo_mobile, present ? "unknown" : "none").toLowerCase();
  const type =
    typeRaw.includes("sospeso") || typeRaw.includes("wall") ? "wall_hung" :
    typeRaw.includes("terra") || typeRaw.includes("floor") ? "floor_standing" :
    typeRaw.includes("console") ? "console" :
    present ? "unknown" : "none";
  const basinCountRaw = source.basin_count ?? source.numero_lavabi;
  const basinCount = basinCountRaw === 2 ? 2 : present ? 1 : 0;

  return {
    present,
    type,
    position: normalizeZonePosition(source.position ?? source.posizione),
    basinType: stringOr(source.basin_type ?? source.lavabo, present ? "not identified" : "none"),
    basinCount,
    mirrorPresent: booleanOr(source.mirror_present ?? source.presenza_specchio, present),
    mirrorType: stringOr(source.mirror_type ?? source.tipo_specchio, present ? "not identified" : "none"),
    notes: stringOr(source.notes ?? source.note_mobile, present ? "existing vanity zone visible in the source bathroom" : "no vanity detected"),
  };
}

function normalizeSanitaryWare(source: Record<string, unknown>): BathroomCurrentSanitaryWare {
  const wcPresent = booleanOr(source.wc_present ?? source.presenza_wc ?? source.presenza_sanitari, false);
  const bidetPresent = booleanOr(source.bidet_present ?? source.presenza_bidet ?? wcPresent, false);
  const wcTypeRaw = stringOr(source.wc_type ?? source.tipo_wc ?? source.sanitari_tipo, wcPresent ? "unknown" : "none").toLowerCase();
  const bidetTypeRaw = stringOr(source.bidet_type ?? source.tipo_bidet, bidetPresent ? "unknown" : "none").toLowerCase();

  const mapType = (raw: string, present: boolean) =>
    raw.includes("sospeso") || raw.includes("wall")
      ? "wall_hung"
      : raw.includes("filo") || raw.includes("back")
        ? "back_to_wall"
        : raw.includes("terra") || raw.includes("floor")
          ? "floor_standing"
          : present
            ? "unknown"
            : "none";

  return {
    wcPresent,
    wcType: mapType(wcTypeRaw, wcPresent),
    bidetPresent,
    bidetType: mapType(bidetTypeRaw, bidetPresent),
    position: normalizeZonePosition(source.position ?? source.posizione),
    notes: stringOr(source.notes ?? source.note_sanitari, wcPresent || bidetPresent ? "existing sanitary ware visible in the source bathroom" : "sanitary ware not clearly visible"),
  };
}

function normalizeLighting(source: Record<string, unknown>, legacy: Record<string, unknown>): BathroomLightingAnalysis {
  const typeRaw = stringOr(source.type ?? legacy.illuminazione_attuale, "unknown").toLowerCase();
  const type =
    typeRaw.includes("natural") || typeRaw.includes("naturale") ? "natural" :
    typeRaw.includes("spot") ? "ceiling_spots" :
    typeRaw.includes("pend") ? "pendant" :
    typeRaw.includes("mirror") || typeRaw.includes("retro") ? "mirror_backlit" :
    typeRaw.includes("wall") || typeRaw.includes("applique") ? "wall_sconces" :
    typeRaw.includes("mixed") || typeRaw.includes("mista") ? "mixed" :
    "unknown";

  return {
    type,
    direction: stringOr(source.direction ?? source.direzione_luce, "same existing lighting direction"),
    temperature: stringOr(source.temperature ?? source.temperatura_luce, "neutral white"),
    notes: stringOr(source.notes ?? source.note_luce ?? legacy.illuminazione_attuale, "preserve the photographed light balance"),
  };
}

export function normalizeBathroomSceneAnalysis(
  rawAnalysis: unknown,
  photoMeta?: BathroomPhotoMeta | null,
): BathroomSceneAnalysis {
  const source = asObject(rawAnalysis);
  const legacySource = asObject(source.legacy);

  const legacy = {
    tipo_stanza: stringOr(source.tipo_stanza ?? legacySource.tipo_stanza, "bagno"),
    dimensione_stimata: stringOr(source.dimensione_stimata ?? legacySource.dimensione_stimata, "dimensione non identificata"),
    altezza_stimata: stringOr(source.altezza_stimata ?? legacySource.altezza_stimata, "altezza non identificata"),
    piastrelle_parete_attuali: stringOr(source.piastrelle_parete_attuali ?? legacySource.piastrelle_parete_attuali, "non identificabili"),
    pavimento_attuale: stringOr(source.pavimento_attuale ?? legacySource.pavimento_attuale, "non identificabile"),
    colori_dominanti: stringArray(source.colori_dominanti ?? legacySource.colori_dominanti),
    presenza_doccia: booleanOr(source.presenza_doccia ?? legacySource.presenza_doccia, false),
    tipo_doccia: optionalString(source.tipo_doccia ?? legacySource.tipo_doccia),
    presenza_vasca: booleanOr(source.presenza_vasca ?? legacySource.presenza_vasca, false),
    presenza_mobile: booleanOr(source.presenza_mobile ?? legacySource.presenza_mobile, false),
    tipo_mobile: optionalString(source.tipo_mobile ?? legacySource.tipo_mobile),
    sanitari_tipo: optionalString(source.sanitari_tipo ?? legacySource.sanitari_tipo),
    rubinetteria_attuale: optionalString(source.rubinetteria_attuale ?? legacySource.rubinetteria_attuale),
    illuminazione_attuale: optionalString(source.illuminazione_attuale ?? legacySource.illuminazione_attuale),
    stato_conservazione: normalizeCondition(source.stato_conservazione ?? legacySource.stato_conservazione),
    note: optionalString(source.note ?? legacySource.note),
  };

  const shower = normalizeCurrentShower(asObject(source.shower));
  if (!shower.present && legacy.presenza_doccia) {
    shower.present = true;
    shower.type = normalizeCurrentShower({ presenza_doccia: true, tipo_doccia: legacy.tipo_doccia }).type;
  }

  const bathtub = normalizeCurrentBathtub(asObject(source.bathtub));
  if (!bathtub.present && legacy.presenza_vasca) {
    bathtub.present = true;
    bathtub.type = normalizeCurrentBathtub({ presenza_vasca: true }).type;
  }

  const vanity = normalizeCurrentVanity(asObject(source.vanity));
  if (!vanity.present && legacy.presenza_mobile) {
    vanity.present = true;
    vanity.type = normalizeCurrentVanity({ presenza_mobile: true, tipo_mobile: legacy.tipo_mobile }).type;
  }

  const sanitaryWare = normalizeSanitaryWare(asObject(source.sanitary_ware));
  const lighting = normalizeLighting(asObject(source.lighting), legacy);

  const wallTiles = inferSurfaceAnalysis(
    asObject(source.wall_tiles),
    legacy.piastrelle_parete_attuali,
    legacy.piastrelle_parete_attuali,
  );
  const floor = inferSurfaceAnalysis(
    asObject(source.floor),
    legacy.pavimento_attuale,
    legacy.pavimento_attuale,
  );

  const preserveRigidly = Array.from(new Set([
    ...stringArray(source.preserve_rigidly),
    ...stringArray(source.preserveAnchors),
    wallTiles.description !== "non identificabili" ? "existing non-target wall surfaces and grout rhythm" : "",
    floor.description !== "non identificabile" ? "existing non-target floor geometry and perspective" : "",
    booleanOr(source.window_present, false) ? "window and its light contribution" : "",
    booleanOr(source.towel_warmer_present, false) ? "towel warmer / radiator if not selected for change" : "",
    "room geometry and camera perspective",
  ].filter(Boolean)));

  const demolitionSensitiveAreas = Array.from(new Set([
    ...stringArray(source.demolition_sensitive_areas),
    shower.present ? "current shower contact lines with walls and floor" : "",
    bathtub.present ? "current bathtub perimeter, wall returns and adjacent tile cuts" : "",
    vanity.present ? "vanity splashback, plumbing wall and mirror zone" : "",
    sanitaryWare.wcPresent || sanitaryWare.bidetPresent ? "sanitary fixings and floor/wall junctions" : "",
  ].filter(Boolean)));

  return {
    version: "2.0",
    roomType: normalizeRoomType(source.room_type ?? legacy.tipo_stanza),
    estimatedSize: stringOr(source.estimated_size ?? legacy.dimensione_stimata, legacy.dimensione_stimata),
    estimatedCeilingHeight: stringOr(source.estimated_ceiling_height ?? legacy.altezza_stimata, legacy.altezza_stimata),
    layoutType: normalizeLayoutType(source.layout_type, shower.present, bathtub.present),
    cameraPerspective: stringOr(source.camera_perspective, inferCameraPerspective(photoMeta)),
    cameraAngle: stringOr(source.camera_angle, "same photographed bathroom angle"),
    dominantColors: legacy.colori_dominanti,
    overallCondition: legacy.stato_conservazione,
    wallTiles,
    floor,
    shower,
    bathtub,
    vanity,
    sanitaryWare,
    lighting,
    mirrorPresent: booleanOr(source.mirror_present, vanity.mirrorPresent),
    towelWarmerPresent: booleanOr(source.towel_warmer_present, false),
    towelWarmerType: stringOr(source.towel_warmer_type, "not identified"),
    windowPresent: booleanOr(source.window_present, false),
    windowPosition: normalizeZonePosition(source.window_position),
    nichePresent: booleanOr(source.niche_present, false),
    partitionPresent: booleanOr(source.partition_present ?? source.divider_present, false),
    preserveRigidly,
    demolitionSensitiveAreas,
    noteAnalisi: stringOr(source.note_analisi ?? legacy.note, legacy.note || "preserve the same bathroom identity"),
    legacy,
  };
}

export function createLegacyBathroomAnalysis(analysis: BathroomSceneAnalysis): AnalisiBagno {
  return analysis;
}
