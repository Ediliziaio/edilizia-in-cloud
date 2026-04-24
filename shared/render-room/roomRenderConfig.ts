import { buildFloorPrompt } from "../render-floor/floorPromptBuilder.ts";
import type { ConfigurazionePavimento, FloorPhotoMeta, PatternPosa, TipoPavimento } from "../render-floor/types.ts";
import {
  ROOM_INTEGRITY_CONSTRAINTS,
  ROOM_NEGATIVE_CONSTRAINTS,
  ROOM_QUALITY_DIRECTIVES,
  ROOM_TYPE_LABELS,
} from "./promptFragments.ts";
import type {
  RoomIntervention,
  RoomPhotoMeta,
  RoomRenderConfig,
  RoomReplacementManifest,
  RoomSceneAnalysis,
  RoomTargetZonesMap,
} from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function hexName(record: Record<string, unknown>, nameKey: string, hexKey: string, fallback: string): string {
  const name = str(record[nameKey]);
  const hex = str(record[hexKey]);
  if (name && hex) return `${name} (${hex})`;
  return name || hex || fallback;
}

function normalizeRoomType(value: unknown): string {
  const raw = str(value, "soggiorno");
  return ROOM_TYPE_LABELS[raw] ? raw : "altro";
}

function roomFunctionalAnchors(roomType: string): string[] {
  const anchors: Record<string, string[]> = {
    cucina: [
      "cabinet layout and module rhythm",
      "sink, cooktop, oven, fridge and appliance positions",
      "countertop footprint and backsplash geometry",
      "clear work triangle and walking path",
    ],
    soggiorno: [
      "sofa and main seating footprint",
      "TV/media wall or focal wall if visible",
      "coffee table, rug and circulation path",
      "window/door access and radiator positions",
    ],
    camera_da_letto: [
      "bed position, headboard wall and bedside clearances",
      "wardrobe/cabinet footprint",
      "window, door and circulation around bed",
    ],
    sala_da_pranzo: [
      "dining table position and chair clearance",
      "sideboard/display furniture footprint",
      "path around the table and openings",
    ],
    studio: [
      "desk position and working clearance",
      "bookcase/storage footprint",
      "screen, sockets and light direction if visible",
    ],
    ingresso: [
      "door swing area and passage clearance",
      "coat/storage footprint",
      "thresholds and hallway perspective",
    ],
    corridoio: [
      "longitudinal perspective",
      "door sequence and wall alignments",
      "clear walking path",
    ],
    bagno: [
      "sanitary fixture positions",
      "vanity and mirror wall",
      "shower/bathtub footprint if visible",
    ],
  };
  return anchors[roomType] ?? [
    "main furniture footprint",
    "walking/circulation path",
    "visible openings and fixed technical points",
  ];
}

function mapRoomFloorType(value: unknown): TipoPavimento {
  const raw = str(value, "gres_porcellanato");
  const map: Record<string, TipoPavimento> = {
    gres_porcellanato: "gres_porcellanato",
    ceramica: "ceramica",
    parquet_legno: "parquet_prefinito",
    parquet_laminato: "laminato",
    laminato: "laminato",
    cotto: "cotto",
    marmo: "marmo",
    resina: "resina_continua",
    cemento_spatolato: "microcemento",
    mosaico: "ceramica",
    pietra_naturale: "pietra_naturale",
    vinile_lvt: "vinile_lvt",
    moquette: "moquette",
    terrazzo_veneziano: "terrazzo_veneziano",
  };
  return map[raw] ?? "gres_porcellanato";
}

function mapRoomFloorPattern(value: unknown): PatternPosa {
  const raw = str(value, "dritto");
  const map: Record<string, PatternPosa> = {
    dritto: "rettilineo_dritto",
    rettilineo_dritto: "rettilineo_dritto",
    diagonale: "diagonale_45",
    diagonale_45: "diagonale_45",
    spina_pesce: "spina_di_pesce",
    spina_di_pesce: "spina_di_pesce",
    spina_ungherese: "spina_ungherese",
    cassero_regolare: "a_correre",
    cassero_irregolare: "cassero_irregolare",
    opus_romano: "opus_romanum",
    opus_romanum: "opus_romanum",
    sfalsato_33: "sfalsato_33",
    esagonale: "esagonale",
  };
  return map[raw] ?? "rettilineo_dritto";
}

function mapRoomFloorFinish(value: unknown): ConfigurazionePavimento["finitura"] {
  const raw = str(value, "opaco");
  const map: Record<string, ConfigurazionePavimento["finitura"]> = {
    matte: "opaco",
    opaco: "opaco",
    satinato: "satinato",
    lucido: "lucido",
    strutturato: "naturale",
    spazzolato: "spazzolato",
    naturale: "naturale",
    levigato: "levigato",
  };
  return map[raw] ?? "opaco";
}

function normalizeRoomFloorConfig(rawFloor: Record<string, unknown>): ConfigurazionePavimento {
  const type = mapRoomFloorType(rawFloor.tipo);
  const pattern = mapRoomFloorPattern(rawFloor.pattern ?? rawFloor.pattern_posa);
  const isWood = ["parquet_prefinito", "parquet_massello", "laminato", "vinile_lvt"].includes(type);
  const isSeamless = ["resina_continua", "microcemento", "cemento_resina", "moquette"].includes(type);

  return {
    tipo: type,
    finitura: mapRoomFloorFinish(rawFloor.finitura ?? (isSeamless ? "satinato" : "opaco")),
    colore_mode: "free",
    colore_nome: str(rawFloor.colore_nome, type.replace(/_/g, " ")),
    colore_hex: str(rawFloor.colore_hex, "#b0b0b0"),
    effetto_visivo: (str(rawFloor.effetto_visivo, isWood ? "legno" : isSeamless ? "resina" : undefined) || undefined) as ConfigurazionePavimento["effetto_visivo"],
    essenza_legno: (str(rawFloor.essenza_legno) || undefined) as ConfigurazionePavimento["essenza_legno"],
    variazione_tono: (str(rawFloor.variazione_tono, isWood ? "naturale" : "leggera") as ConfigurazionePavimento["variazione_tono"]),
    bisellatura: (str(rawFloor.bisellatura, isWood ? "microbisello" : "nessuna") as ConfigurazionePavimento["bisellatura"]),
    direzione_posa: (str(rawFloor.direzione_posa, "segue_prospettiva") as ConfigurazionePavimento["direzione_posa"]),
    scala_pattern: (str(rawFloor.scala_pattern, str(rawFloor.formato_piastrella).startsWith("120") ? "maxi_lastre" : "standard") as ConfigurazionePavimento["scala_pattern"]),
    soglie_porte: (str(rawFloor.soglie_porte, "mantieni") as ConfigurazionePavimento["soglie_porte"]),
    giunto_perimetrale: (str(rawFloor.giunto_perimetrale, "standard_nascosto") as ConfigurazionePavimento["giunto_perimetrale"]),
    fasce_bordo: (str(rawFloor.fasce_bordo, "nessuna") as ConfigurazionePavimento["fasce_bordo"]),
    pattern_posa: pattern,
    formato_piastrella: str(rawFloor.formato_piastrella, isWood || isSeamless ? "" : "60x60") || undefined,
    larghezza_listello_mm: typeof rawFloor.larghezza_listello_mm === "number" ? rawFloor.larghezza_listello_mm : undefined,
    lunghezza_listello_mm: typeof rawFloor.lunghezza_listello_mm === "number" ? rawFloor.lunghezza_listello_mm : undefined,
    fuga_larghezza_mm: typeof rawFloor.fuga_larghezza_mm === "number" ? rawFloor.fuga_larghezza_mm : isSeamless ? 0 : 2,
    fuga_colore: (str(rawFloor.fuga_colore, "tono_su_tono") as ConfigurazionePavimento["fuga_colore"]),
    battiscopa: {
      azione: (str(rawFloor.battiscopa_azione, "mantieni") as "mantieni" | "sostituisci" | "rimuovi"),
      tipo: (str(rawFloor.battiscopa_tipo) || undefined) as NonNullable<ConfigurazionePavimento["battiscopa"]>["tipo"],
      altezza_cm: typeof rawFloor.battiscopa_altezza_cm === "number"
        ? rawFloor.battiscopa_altezza_cm as 6 | 8 | 10
        : undefined,
    },
    note_libere: str(rawFloor.note),
  };
}

export function normalizeRoomSceneAnalysis(rawAnalysis?: unknown, rawConfig?: unknown): RoomSceneAnalysis {
  const analysis = asRecord(rawAnalysis);
  const cfg = asRecord(rawConfig);
  const roomType = normalizeRoomType(cfg.tipo_stanza ?? analysis.tipo_stanza);
  const floor = asRecord(cfg.pavimento);
  const walls = asRecord(cfg.verniciatura);

  return {
    roomType: ROOM_TYPE_LABELS[roomType] ?? "interior room",
    perceivedLayout: str(analysis.layout, "infer the photographed layout from the image; preserve its wall positions, circulation and furniture footprints"),
    cameraPerspective: str(analysis.prospettiva, "keep the exact photographed camera angle, height, vanishing points and lens feel"),
    lighting: str(analysis.luce, "preserve the existing natural light direction and rebuild only selected artificial lighting effects"),
    visibleSurfaces: Array.isArray(analysis.superfici_visibili)
      ? analysis.superfici_visibili.map(String)
      : ["floor", "walls", "ceiling", "doors/windows where visible"],
    fixedArchitecture: Array.isArray(analysis.architettura_fissa)
      ? analysis.architettura_fissa.map(String)
      : ["walls", "ceiling", "doors", "windows", "openings", "radiators", "switches", "outlets"],
    movableObjects: Array.isArray(analysis.oggetti)
      ? analysis.oggetti.map(String)
      : ["existing furniture and decor unless explicitly targeted"],
    windowsAndDoors: str(analysis.finestre_porte, "all visible windows and doors remain in the same positions and proportions"),
    kitchenElements: roomType === "cucina"
      ? ["cabinet layout", "sink position", "appliance positions", "countertop footprint", "backsplash geometry"]
      : [],
    functionalAnchors: Array.isArray(analysis.ancore_funzione)
      ? analysis.ancore_funzione.map(String)
      : roomFunctionalAnchors(roomType),
    floorDescription: bool(floor.attivo)
      ? "existing floor will be replaced according to the selected floor manifest"
      : "existing floor must remain unchanged",
    wallDescription: bool(walls.attivo)
      ? "selected walls receive new paint/finish only in the selected zones"
      : "existing wall color and texture must remain unchanged unless another wall intervention is active",
    ceilingDescription: bool(asRecord(cfg.soffitto).attivo)
      ? "ceiling intervention is active and must be physically plausible"
      : "ceiling remains unchanged",
    constraints: Array.isArray(analysis.vincoli)
      ? analysis.vincoli.map(String)
      : ["same room identity", "same perspective", "same proportions", "no generic AI restyling"],
  };
}

function buildPaintIntervention(paint: Record<string, unknown>): RoomIntervention {
  const targetKey = str(paint.applica_a, "tutte");
  const target = targetKey.replace(/_/g, " ");
  const color = targetKey === "parete_accento"
    ? hexName(paint, "colore_accento_nome", "colore_accento_hex", "selected accent color")
    : hexName(paint, "colore_nome", "colore_hex", "selected wall color");
  return {
    key: "wall_paint",
    label: "Wall paint / finish",
    specification: `Apply ${color} with ${str(paint.finitura, "satin")} finish to ${target}.`,
    replacementRules: [
      targetKey === "parete_accento"
        ? "Paint one single accent wall plane only; do not repaint the remaining walls, ceiling, floor, furniture, trims, doors or windows."
        : "Paint only the selected wall zones; keep trim, sockets, furniture, windows and doors clean and unpainted.",
      "Preserve existing wall geometry, corners, shadows and imperfections unless painting naturally covers minor color variation.",
      "Color must follow the photographed wall plane and perspective without bleeding over edges or openings.",
    ],
    preservationRules: ["Do not change floor, ceiling, furniture or openings because of wall paint."],
  };
}

function buildFurnitureIntervention(furniture: Record<string, unknown>): RoomIntervention {
  const mode = str(furniture.intensita_cambio, "stile_mantenendo_layout");
  const material = str(furniture.materiale, "selected material").replace(/_/g, " ");
  const color = hexName(furniture, "colore_principale_nome", "colore_principale_hex", "selected main color");
  const preserveAppliances = bool(furniture.mantieni_elettrodomestici, true);
  const spec = mode === "colore_sola"
    ? `Refinish existing furniture color/material appearance only: ${material}, ${color}.`
    : mode === "arredo_completo"
      ? `Replace movable furniture with new ${material} furniture in ${color}, keeping room circulation, scale and architectural shell.`
      : `Update furniture style using ${material}, ${color}, preserving the current layout and object footprints.`;

  return {
    key: "furniture",
    label: "Furniture / decor",
    specification: spec,
    replacementRules: [
      mode === "colore_sola"
        ? "Do not change furniture geometry, size, number of pieces or position; only surface finish changes."
        : mode === "stile_mantenendo_layout"
          ? "Preserve the current furniture footprint, circulation path, functional zones and main object positions while updating only the visual design language."
        : "Any new furniture must respect the photographed room footprint, object scale and circulation path.",
      preserveAppliances
        ? "Keep all appliances and technical devices exactly in place and unchanged."
        : "Appliances may be visually modernized only if explicitly coherent with the selected room transformation.",
      "Maintain realistic contact shadows between furniture and the floor/walls.",
    ],
    preservationRules: ["Do not move fixed architecture, windows, doors, radiators, switches or outlets."],
  };
}

function buildLightingIntervention(light: Record<string, unknown>): RoomIntervention {
  const type = str(light.tipo, "misto");
  const mountingRule = type === "misto"
    ? "Use the existing visible lighting points as anchors; add only subtle integrated support lighting if physically plausible."
    : type === "lampadario_centrale" || type === "lampade_sospensione"
      ? "Use ceiling suspension points that are plausible in the photographed room; keep fixture scale proportional and avoid blocking sightlines."
      : type === "applique_parete"
        ? "Mount wall lights only on plausible wall planes with believable wiring/height and no overlap with art, switches or windows."
        : type === "led_strip_perimetrale"
          ? "Use concealed linear LED only along credible coves, shelves, under-cabinet runs or ceiling edges already compatible with the room."
          : "Use recessed downlights only on plausible ceiling planes with realistic spacing and light cones.";

  return {
    key: "lighting",
    label: "Lighting",
    specification: `Install/adjust ${type.replace(/_/g, " ")} with ${str(light.temperatura, "warm neutral").replace(/_/g, " ")} color temperature and ${str(light.intensita_luce, "normal").replace(/_/g, " ")} intensity.`,
    replacementRules: [
      mountingRule,
      "Lighting fixtures must be physically mounted to plausible ceiling/wall positions.",
      "Light spill, shadows and reflections must remain consistent with the original photo and selected fixture type.",
      "Do not invent a decorative chandelier, pendant cluster or visible fixture type unless that exact lighting type is selected.",
    ],
    preservationRules: ["Do not invent extra windows or change daylight direction."],
  };
}

function buildKitchenIntervention(kitchen: Record<string, unknown>): RoomIntervention {
  return {
    key: "kitchen_restyling",
    label: "Kitchen restyling",
    specification: [
      `Refinish/replace cabinet fronts in ${str(kitchen.materiale_frontali, "selected finish").replace(/_/g, " ")} ${hexName(kitchen, "colore_frontali_nome", "colore_frontali_hex", "selected color")}.`,
      `Countertop: ${str(kitchen.piano_lavoro_materiale, "quartz").replace(/_/g, " ")} ${hexName(kitchen, "colore_piano_lavoro_nome", "colore_piano_lavoro_hex", "selected countertop color")}.`,
      `Handles: ${str(kitchen.maniglie, "handleless").replace(/_/g, " ")}.`,
    ].join(" "),
    replacementRules: [
      "Preserve the photographed kitchen cabinet layout, module rhythm, sink position, appliance positions and backsplash geometry.",
      "Change cabinet fronts, handles and countertop only; do not invent a new kitchen footprint.",
      "Keep base cabinets, wall cabinets, tall units and appliance voids aligned to the original perspective and real kitchen ergonomics.",
      bool(kitchen.cambia_piano_cottura)
        ? "Cooktop may be modernized in the same countertop position with correct scale and reflections."
        : "Keep the existing cooktop/appliance positions unchanged.",
    ],
    preservationRules: ["Keep surrounding walls, windows, floor and room proportions unless those systems are separately active."],
  };
}

function buildSimpleIntervention(key: string, label: string, specification: string, rules: string[]): RoomIntervention {
  return {
    key,
    label,
    specification,
    replacementRules: rules,
    preservationRules: ["Apply only to selected zones and preserve all non-target room elements."],
  };
}

export function buildRoomReplacementManifest(
  rawConfig?: unknown,
  scene?: RoomSceneAnalysis,
  photoMeta?: RoomPhotoMeta | null,
): RoomReplacementManifest {
  const cfg = asRecord(rawConfig);
  const active: RoomIntervention[] = [];
  let floorPromptExcerpt = "";
  const floor = asRecord(cfg.pavimento);

  if (bool(asRecord(cfg.verniciatura).attivo)) active.push(buildPaintIntervention(asRecord(cfg.verniciatura)));

  if (bool(floor.attivo)) {
    const normalizedFloor = normalizeRoomFloorConfig(floor);
    const floorAnalysis = {
      tipo_stanza: scene?.roomType ?? "interior room",
      pavimento_attuale: "existing photographed room floor",
      colore_attuale: "as seen in the uploaded photo",
      dimensione_stimata: "infer from photo",
      stato_conservazione: "as photographed",
      battiscopa_presente: true,
      visible_floor_area: "all visible floor area in the room photo",
      has_visible_joints: true,
      obstacles: scene?.movableObjects ?? ["visible furniture"],
      preserved_elements: [...(scene?.fixedArchitecture ?? []), "all furniture not selected for replacement"],
    };
    const floorPrompt = buildFloorPrompt(normalizedFloor, floorAnalysis, photoMeta as FloorPhotoMeta | null);
    const snapshot = floorPrompt.normalizedConfig;
    floorPromptExcerpt = [
      `Floor material: ${snapshot.technical_specification.materialDescription}`,
      `Format/scale: ${snapshot.technical_specification.formatRule}`,
      `Pattern: ${snapshot.replacement_manifest.patternRules.slice(0, 2).join(" ")}`,
      `Joints: ${snapshot.replacement_manifest.jointRules.slice(0, 2).join(" ")}`,
      `Skirting: ${snapshot.replacement_manifest.skirtingRules.slice(0, 2).join(" ")}`,
    ].join("\n");
    active.push({
      key: "floor",
      label: "Floor replacement",
      specification: `Replace only the visible floor with the selected floor system. ${snapshot.technical_specification.colorDescription}; ${snapshot.technical_specification.finishDescription}.`,
      replacementRules: [
        "Use the full floor coverage/pattern rules below; the floor must follow the room perspective and object contact shadows.",
        "Do not alter walls, furniture, doors, windows or ceiling while replacing the floor.",
        "Never leave patches, ghosts, grout traces or color remnants from the previous floor on the replaced floor area.",
        ...snapshot.replacement_manifest.removals,
      ],
      preservationRules: snapshot.replacement_manifest.preservation,
    });
  }

  if (bool(asRecord(cfg.arredo).attivo)) active.push(buildFurnitureIntervention(asRecord(cfg.arredo)));
  if (bool(asRecord(cfg.illuminazione).attivo)) active.push(buildLightingIntervention(asRecord(cfg.illuminazione)));

  const ceiling = asRecord(cfg.soffitto);
  if (bool(ceiling.attivo)) {
    active.push(buildSimpleIntervention(
      "ceiling",
      "Ceiling",
      `Ceiling: ${str(ceiling.tipo, "piano").replace(/_/g, " ")} with color ${str(ceiling.colore_hex, "existing/selected")}${str(ceiling.colore_travi) ? `, beams ${str(ceiling.colore_travi)}` : ""}.`,
      ["Keep ceiling height and room geometry plausible; no floating fixtures or warped planes."],
    ));
  }

  const wallpaper = asRecord(cfg.carta_da_parati);
  if (bool(wallpaper.attivo)) {
    active.push(buildSimpleIntervention(
      "wallpaper",
      "Wallpaper",
      `Wallpaper ${str(wallpaper.stile_pattern, "selected").replace(/_/g, " ")} on ${str(wallpaper.applica_a, "parete_principale").replace(/_/g, " ")}; base ${str(wallpaper.colore_base, "coherent selected base")}; ${str(wallpaper.descrizione)}`,
      [
        "Pattern scale must follow perspective and wall plane; do not spill onto ceiling, floor, doors, windows, trim, baseboards or furniture.",
        "Keep wallpaper edges crisp at corners, openings and furniture occlusion boundaries.",
      ],
    ));
  }

  const cladding = asRecord(cfg.rivestimento_pareti);
  if (bool(cladding.attivo)) {
    active.push(buildSimpleIntervention(
      "wall_cladding",
      "Wall cladding",
      `Wall cladding ${str(cladding.tipo, "selected").replace(/_/g, " ")} on ${str(cladding.applica_a, "parete_principale").replace(/_/g, " ")} with color ${str(cladding.colore_hex, "selected")}.`,
      [
        "Cladding must have believable thickness, seams and contact edges only on selected wall planes.",
        "Do not cover windows, doors, switches, sockets, trims or furniture; cut cleanly around them.",
      ],
    ));
  }

  const curtains = asRecord(cfg.tende);
  if (bool(curtains.attivo)) {
    const remove = str(curtains.tipo) === "nessuna";
    active.push(buildSimpleIntervention(
      "curtains",
      "Curtains / window treatment",
      remove
        ? "Remove visible curtains and curtain hardware, restoring the wall/window area cleanly."
        : `Install ${str(curtains.tipo, "selected curtains").replace(/_/g, " ")} in ${hexName(curtains, "colore_nome", "colore_hex", "selected color")}.`,
      remove
        ? [
            "Remove curtains, rods, rails and visible brackets only; do not alter the window, frame, glazing, exterior view or wall geometry.",
            "Restore the window reveal/wall area cleanly where curtain hardware was removed.",
          ]
        : ["Curtains must hang with realistic gravity, fabric folds, correct fullness and window scale."],
    ));
  }

  if (normalizeRoomType(cfg.tipo_stanza) === "cucina" && bool(asRecord(cfg.restyling_cucina).attivo)) {
    active.push(buildKitchenIntervention(asRecord(cfg.restyling_cucina)));
  }

  const details = asRecord(cfg.spazi_dettagli);
  if (bool(details.attivo)) {
    active.push(buildSimpleIntervention(
      "space_details",
      "Space planning and details",
      [
        `Layout strategy: ${str(details.layout_strategy, "keep existing circulation").replace(/_/g, " ")}.`,
        str(details.elementi_da_aggiungere) ? `Add: ${str(details.elementi_da_aggiungere)}.` : "",
        str(details.elementi_da_rimuovere) ? `Remove: ${str(details.elementi_da_rimuovere)}.` : "",
        str(details.elementi_da_mantenere) ? `Strictly keep: ${str(details.elementi_da_mantenere)}.` : "",
        str(details.note_tecniche) ? `Technical notes: ${str(details.note_tecniche)}.` : "",
      ].filter(Boolean).join(" "),
      [
        "Any added decor must be realistic, sparse and physically placed on existing surfaces.",
        "Do not fill empty areas with random objects; preserve usable space and circulation.",
        str(details.layout_strategy) === "declutter"
          ? "Declutter means remove only loose visual clutter and redundant small items; never erase functional anchors, main furniture or fixed architecture."
          : "",
        "If the layout strategy is keep-layout, do not move any major furniture; if optimizing space, keep changes local and plausible without changing architecture.",
      ].filter(Boolean),
    ));
  }

  const intensity = str(cfg.intensita, "medio");
  const interventionType = intensity === "radicale"
    ? "complete visual restyling constrained to the same photographed architecture"
    : intensity === "leggero"
      ? "light surgical restyling of explicitly selected systems only"
      : "coordinated restyling of selected systems while preserving layout";

  return {
    interventionType,
    activeInterventions: active,
    removals: active.flatMap((item) => item.replacementRules.filter((rule) => /remove|eliminate|do not leave|riprist|restore/i.test(rule))),
    additions: active.map((item) => item.specification),
    strictPreservation: [
      ...ROOM_INTEGRITY_CONSTRAINTS,
      ...(scene?.functionalAnchors ?? []).map((item) => `preserve functional anchor: ${item}`),
      ...(scene?.fixedArchitecture ?? []).map((item) => `preserve ${item}`),
    ],
    geometryRules: [
      "Preserve photographed wall corners, ceiling height, opening positions and room proportions.",
      "Preserve object scale and contact shadows; recompute only local shadows/reflections needed by selected changes.",
      "No crop, no rotation, no aspect-ratio change.",
    ],
    floorPromptExcerpt,
  };
}

export function buildRoomTargetZonesMap(rawConfig?: unknown, scene?: RoomSceneAnalysis): RoomTargetZonesMap {
  const cfg = asRecord(rawConfig);
  const paint = asRecord(cfg.verniciatura);
  const wallpaper = asRecord(cfg.carta_da_parati);
  const cladding = asRecord(cfg.rivestimento_pareti);
  const floor = asRecord(cfg.pavimento);
  const ceiling = asRecord(cfg.soffitto);
  const curtains = asRecord(cfg.tende);
  const furniture = asRecord(cfg.arredo);
  const kitchen = asRecord(cfg.restyling_cucina);

  const wallTargets = [
    bool(paint.attivo) ? `paint target: ${str(paint.applica_a, "tutte").replace(/_/g, " ")}` : "",
    bool(wallpaper.attivo) ? `wallpaper target: ${str(wallpaper.applica_a, "parete_principale").replace(/_/g, " ")}` : "",
    bool(cladding.attivo) ? `cladding target: ${str(cladding.applica_a, "parete_principale").replace(/_/g, " ")}` : "",
  ].filter(Boolean);

  return {
    mainWall: wallTargets.length ? wallTargets.join("; ") : "main wall unchanged unless directly targeted by an active wall intervention",
    accentWall: bool(paint.attivo) && str(paint.applica_a) === "parete_accento"
      ? "single accent wall only; all other walls untouched"
      : "no accent-wall-only paint unless explicitly selected",
    secondaryWalls: bool(paint.attivo) && str(paint.applica_a) === "tutte"
      ? "all visible wall planes receive paint while trims/openings remain protected"
      : "secondary walls remain unchanged unless selected",
    floor: bool(floor.attivo)
      ? "replace only the visible floor coverage area, including perspective-consistent cuts under/around objects"
      : "floor unchanged",
    ceiling: bool(ceiling.attivo)
      ? "modify only the ceiling plane according to selected ceiling type"
      : "ceiling unchanged",
    windowTreatmentZones: bool(curtains.attivo)
      ? "window treatment zone only: curtains/rails/brackets according to selected install/remove action"
      : "windows, curtains and exterior view unchanged",
    furnitureGroups: bool(furniture.attivo)
      ? `furniture target mode: ${str(furniture.intensita_cambio, "stile_mantenendo_layout").replace(/_/g, " ")}`
      : "furniture unchanged",
    kitchenBlock: normalizeRoomType(cfg.tipo_stanza) === "cucina" && bool(kitchen.attivo)
      ? "kitchen block active: preserve cabinet layout, sink/hob/hood/appliance technical positions and update selected fronts/top/handles only"
      : "kitchen block unchanged unless selected",
    strictPreservationAreas: [
      ...(scene?.fixedArchitecture ?? ["walls", "ceiling", "doors", "windows"]),
      ...(scene?.functionalAnchors ?? ["main furniture footprint", "circulation path"]),
      "non-target decor",
      "switches and outlets",
      "radiators / HVAC units",
      "image dimensions and crop",
    ],
  };
}

export function buildRoomRenderConfig(
  rawConfig?: unknown,
  rawAnalysis?: unknown,
  photoMeta?: RoomPhotoMeta | null,
): RoomRenderConfig {
  const scene = normalizeRoomSceneAnalysis(rawAnalysis, rawConfig);
  const manifest = buildRoomReplacementManifest(rawConfig, scene, photoMeta ?? null);
  const targetZones = buildRoomTargetZonesMap(rawConfig, scene);

  return {
    legacy_config: asRecord(rawConfig),
    scene_analysis: scene,
    target_zones_map: targetZones,
    replacement_manifest: manifest,
    integrity_constraints: ROOM_INTEGRITY_CONSTRAINTS,
    negative_constraints: ROOM_NEGATIVE_CONSTRAINTS,
    quality_directives: ROOM_QUALITY_DIRECTIVES,
    photo_meta: photoMeta ?? null,
  };
}
