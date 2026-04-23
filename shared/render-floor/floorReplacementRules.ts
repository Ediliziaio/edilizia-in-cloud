import {
  BASEBOARD_DESCRIPTIONS,
  BEVEL_DESCRIPTIONS,
  BORDER_BAND_DESCRIPTIONS,
  DIRECTION_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  GROUT_COLOR_DESCRIPTIONS,
  MATERIAL_DESCRIPTIONS,
  PATTERN_DESCRIPTIONS,
  PERIMETER_JOINT_DESCRIPTIONS,
  SCALE_DESCRIPTIONS,
  THRESHOLD_DESCRIPTIONS,
  TONE_VARIATION_DESCRIPTIONS,
  VISUAL_EFFECT_DESCRIPTIONS,
  WOOD_ESSENCE_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePavimento,
  EffettoVisivoPavimento,
  FloorCoverageMap,
  FloorMaterialSpecification,
  FloorReplacementManifest,
  FloorSceneAnalysis,
  TipoPavimento,
} from "./types.ts";

const SEAMLESS_TYPES = new Set<TipoPavimento>([
  "cemento_resina",
  "resina_continua",
  "microcemento",
  "moquette",
]);

const WOOD_TYPES = new Set<TipoPavimento>([
  "parquet_massello",
  "parquet_prefinito",
  "laminato",
  "vinile_lvt",
]);

const TILE_TYPES = new Set<TipoPavimento>([
  "gres_porcellanato",
  "ceramica",
  "marmo",
  "pietra_naturale",
  "cotto",
  "terrazzo_veneziano",
]);

function inferVisualEffect(type: TipoPavimento, explicit?: EffettoVisivoPavimento): EffettoVisivoPavimento {
  if (explicit) return explicit;
  if (WOOD_TYPES.has(type)) return "legno";
  if (type === "marmo") return "marmo";
  if (type === "pietra_naturale") return "pietra";
  if (type === "cotto") return "cotto";
  if (type === "moquette") return "tessile";
  if (type === "terrazzo_veneziano") return "terrazzo";
  if (type === "cemento_resina" || type === "resina_continua" || type === "microcemento") return "resina";
  if (type === "gres_porcellanato" || type === "ceramica") return "cemento";
  return "neutro";
}

function colorDescription(config: ConfigurazionePavimento): string {
  const parts = [
    config.colore_nome || "selected color",
    config.colore_hex ? `hex ${config.colore_hex}` : "",
    config.colore_ral ? `RAL ${config.colore_ral}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function formatRule(config: ConfigurazionePavimento, type: TipoPavimento, seamless: boolean): string {
  if (seamless) {
    return "seamless continuous surface: no tile size, no plank size, no module repetition";
  }

  if (config.formato_piastrella && TILE_TYPES.has(type)) {
    const format = config.formato_piastrella;
    const isLarge = /120x120|120x240|80x80|60x120/.test(format);
    return `${format} cm modules${isLarge ? "; large-format scale must be visible with sparse joints and plausible perimeter cuts" : ""}`;
  }

  if (config.larghezza_listello_mm && config.lunghezza_listello_mm) {
    return `${config.larghezza_listello_mm}mm x ${config.lunghezza_listello_mm}mm planks, scaled realistically in perspective`;
  }

  if (WOOD_TYPES.has(type)) {
    return "realistic plank dimensions appropriate to the selected wood/LVT/laminate category";
  }

  return "module dimensions must be plausible for the room scale";
}

export function buildFloorMaterialSpecification(config: ConfigurazionePavimento): FloorMaterialSpecification {
  const type = config.tipo;
  const visualEffect = inferVisualEffect(type, config.effetto_visivo);
  const seamless = SEAMLESS_TYPES.has(type);
  const woodLike = WOOD_TYPES.has(type) || visualEffect === "legno";
  const tileLike = TILE_TYPES.has(type) && !seamless;
  const textile = type === "moquette";

  const woodEssence = config.essenza_legno
    ? WOOD_ESSENCE_DESCRIPTIONS[config.essenza_legno]
    : undefined;

  return {
    materialCategory: type,
    visualEffect,
    materialDescription: [
      MATERIAL_DESCRIPTIONS[type],
      VISUAL_EFFECT_DESCRIPTIONS[visualEffect],
    ].join("; "),
    finishDescription: FINISH_DESCRIPTIONS[config.finitura],
    colorDescription: colorDescription(config),
    woodEssenceDescription: woodEssence,
    toneVariationRule: TONE_VARIATION_DESCRIPTIONS[config.variazione_tono ?? (woodLike ? "naturale" : "leggera")],
    formatRule: formatRule(config, type, seamless),
    bevelRule: BEVEL_DESCRIPTIONS[config.bisellatura ?? (woodLike ? "microbisello" : "nessuna")],
    realismRule: [
      woodEssence ? `Wood essence: ${woodEssence}` : "",
      tileLike ? "tile/slab edges must be rectified or material-appropriate, with believable cuts at walls" : "",
      textile ? "textile pile direction and soft light absorption must replace all previous joints" : "",
      seamless ? "old grout, old plank seams and old module ghosts must disappear completely" : "",
      type === "marmo" ? "veins must be slab-scale and non-repeating, with polished depth if finish allows" : "",
      type === "cotto" ? "terracotta must stay warm, handmade and mildly irregular, not perfect ceramic" : "",
    ].filter(Boolean).join("; "),
    isSeamless: seamless,
    isTextile: textile,
    isWoodLike: woodLike,
    isTileLike: tileLike,
  };
}

export function buildFloorReplacementManifest(
  config: ConfigurazionePavimento,
  scene: FloorSceneAnalysis,
  coverage: FloorCoverageMap,
  spec: FloorMaterialSpecification,
): FloorReplacementManifest {
  const thresholdRule = THRESHOLD_DESCRIPTIONS[config.soglie_porte ?? "mantieni"];
  const perimeterRule = PERIMETER_JOINT_DESCRIPTIONS[config.giunto_perimetrale ?? "standard_nascosto"];
  const borderRule = BORDER_BAND_DESCRIPTIONS[config.fasce_bordo ?? "nessuna"];
  const scaleRule = SCALE_DESCRIPTIONS[config.scala_pattern ?? (config.formato_piastrella?.startsWith("120") ? "maxi_lastre" : "standard")];
  const directionRule = DIRECTION_DESCRIPTIONS[config.direzione_posa ?? "segue_prospettiva"];
  const patternRule = PATTERN_DESCRIPTIONS[config.pattern_posa];

  const removals = [
    `Remove the existing floor visually across ${coverage.mainVisibleArea}.`,
    scene.currentFloor.hasVisibleJoints
      ? "Eliminate all visual traces of the old floor grid, old grout, old seams and old module pattern."
      : "Do not let the old floor color or wear marks show through the new floor.",
  ];

  if (spec.isSeamless) {
    removals.push("Because the selected material is continuous, remove every joint, grout line, plank seam and tile outline from the old floor.");
  }

  const jointRules = spec.isSeamless
    ? [
        "Absolutely no grout lines, no tile joints, no plank seams, no module borders and no ghost grid.",
        "Surface must read as one continuous field with only natural material micro-variation.",
      ]
    : [
        `Grout/seam width: ${config.fuga_larghezza_mm ?? 2}mm.`,
        `Grout/seam color: ${GROUT_COLOR_DESCRIPTIONS[config.fuga_colore ?? "tono_su_tono"]}.`,
        "Joints must thin naturally with perspective and remain continuous, straight or angled according to the selected pattern.",
      ];

  const skirtingAction = config.battiscopa?.azione ?? "mantieni";
  const skirtingRules = skirtingAction === "rimuovi"
    ? [
        "Remove the visible baseboard/skirting completely.",
        "Repair the wall-floor junction cleanly with no residual shadow, thickness or paint scar from the old skirting.",
      ]
    : skirtingAction === "sostituisci"
      ? [
          `Replace baseboard with ${BASEBOARD_DESCRIPTIONS[config.battiscopa?.tipo ?? "coordinato_pavimento"]}.`,
          `Height: ${config.battiscopa?.altezza_cm ?? 8}cm.`,
          "Run the new baseboard continuously along all visible wall-floor junctions, with clean mitered corners and door-frame returns.",
        ]
      : [
          "Keep the existing baseboard/skirting exactly unchanged: same color, material, height, chips, shadows and relation to the wall.",
        ];

  return {
    replacements: [
      `Replace 100% of the visible floor with ${spec.materialDescription}.`,
      `Use ${spec.colorDescription}; finish must be ${spec.finishDescription}.`,
      `Format/scale: ${spec.formatRule}.`,
      `Thresholds: ${thresholdRule}.`,
      `Perimeter joint: ${perimeterRule}.`,
      `Border band: ${borderRule}.`,
    ],
    removals,
    additions: [
      `Install the new floor visually under all unchanged objects where visible, without moving anything.`,
      ...coverage.thresholds.map((item) => `Resolve threshold/transition: ${item}.`),
      ...coverage.raisedAreas.map((item) => `Resolve step/raised area floor continuation: ${item}.`),
    ],
    preservation: [
      "Keep all walls, doors, windows, furniture, objects and lighting unchanged.",
      "Keep room geometry and camera perspective unchanged.",
      ...scene.untouchedElements.map((item) => `Preserve ${item}.`),
    ],
    patternRules: [
      `Pattern: ${patternRule}.`,
      `Direction: ${directionRule}.`,
      `Scale: ${scaleRule}.`,
      "Pattern must follow the photographed vanishing points with no warped lines or random repetition.",
      "Perimeter cuts must be plausible near walls, corners, thresholds and fixed furniture.",
    ],
    jointRules,
    skirtingRules,
    objectInteractionRules: [
      ...coverage.furnitureContactZones.map((zone) => `Keep ${zone} exactly in place with correct contact shadow on the new floor.`),
      "No floating furniture, no duplicated legs, no object deformation, no moved rugs.",
      "Recompute only the local floor reflection/contact shadow where objects touch the new surface.",
    ],
  };
}
