import {
  BED_DESCRIPTIONS,
  DEFAULT_GARDEN_INTEGRITY_CONSTRAINTS,
  DEFAULT_GARDEN_QUALITY_DIRECTIVES,
  DENSITY_DESCRIPTIONS,
  FURNITURE_DESCRIPTIONS,
  GARDEN_STYLE_DESCRIPTIONS,
  GROUND_COVER_DESCRIPTIONS,
  HEDGE_DESCRIPTIONS,
  LAWN_DESCRIPTIONS,
  LIGHTING_DESCRIPTIONS,
  PATH_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazioneGiardino,
  GardenReplacementManifest,
  GardenSceneAnalysis,
  GardenStyleSpecification,
  GardenTargetZonesMap,
  PlantingEnvelope,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function buildGardenStyleSpecification(config: ConfigurazioneGiardino): GardenStyleSpecification {
  const formal = ["moderno_minimale", "contemporaneo", "classico", "zen"].includes(config.stile);
  return {
    style: config.stile,
    visualLanguage: GARDEN_STYLE_DESCRIPTIONS[config.stile],
    plantPaletteDirection: config.stile === "mediterraneo"
      ? "olive/lavender/rosemary-like Mediterranean textures, warm mineral tones, drought-tolerant planting"
      : config.stile === "low_maintenance"
        ? "robust evergreen structure, grasses, ground covers, mulch/gravel and reduced delicate flowering"
        : config.stile === "tropicale_controllato"
          ? "large-leaf accent plants used sparingly, lush but controlled and scaled to the property"
          : "coherent residential plant palette matching the selected style and local-looking conditions",
    borderTreatment: formal
      ? "crisp edges, readable geometry, clean border lines and intentional negative space"
      : "natural but still controlled transitions, clean enough for a built residential project",
    density: config.aiuole.attivo ? DENSITY_DESCRIPTIONS[config.aiuole.densita] : "density follows existing garden except selected systems",
    maintenanceIntent: config.stile === "low_maintenance"
      ? "low perceived maintenance, robust plants, controlled lawn area and mulch/mineral surfaces"
      : "well-maintained residential garden, realistic upkeep and no impossible perfection",
  };
}

export function buildGardenReplacementManifest(
  config: ConfigurazioneGiardino,
  scene: GardenSceneAnalysis,
  target: GardenTargetZonesMap,
  envelope: PlantingEnvelope,
): GardenReplacementManifest {
  const additions: string[] = [];
  const removals: string[] = [];
  const replacements: string[] = [];
  const refreshes: string[] = [];
  const plantingRules: string[] = [
    envelope.plausiblePlantHeights,
    envelope.bedWidthAndDepth,
    envelope.pathAndDoorClearance,
  ];
  const conversionRules: string[] = [
    "All garden changes must stay inside the target zones map and respect no-plant/no-block zones.",
    "Vegetation must have real contact with soil/bed/lawn and cast plausible shadows.",
  ];

  if (config.prato.attivo || config.interventi.includes("rifacimento_prato") || config.interventi.includes("restyling_completo")) {
    replacements.push(`Replace/refresh the lawn only in the selected lawn zone with ${LAWN_DESCRIPTIONS[config.prato.tipo]}.`);
    conversionRules.push("Remove degraded old lawn reading only within target grass zones; do not add beds, trees, hedges or furniture unless selected.");
  }

  if (config.aiuole.attivo || config.interventi.includes("aggiunta_aiuole")) {
    additions.push(`Add ${BED_DESCRIPTIONS[config.aiuole.tipo]} with ${DENSITY_DESCRIPTIONS[config.aiuole.densita]}; palette ${config.aiuole.palette ?? "coherent with selected style"}.`);
    plantingRules.push("Planting beds must show clean edging, believable depth, layered shrubs/perennials and no invasion of paths, doors, pool coping or windows.");
  }

  if (config.siepi.attivo || config.interventi.includes("aggiunta_siepi")) {
    additions.push(`Add hedge/screening system: ${HEDGE_DESCRIPTIONS[config.siepi.tipo]}; height ${config.siepi.altezza ?? "coherent with screening need"}.`);
    plantingRules.push("Hedge must screen where requested while preserving view corridors, facade readability, windows and door clearances.");
  }

  if (config.alberi.attivo || config.interventi.includes("aggiunta_alberi")) {
    additions.push(`Add ${config.alberi.quantita ?? 2} ornamental tree(s), ${config.alberi.scala ?? "media"} scale, ${config.alberi.portamento ?? "ornamentale"} habit, positioned only where root/canopy space is plausible.`);
    plantingRules.push("Trees require realistic scale, trunk contact, canopy shadow, clearance from roof, facade, fences, pool and pergola.");
  }

  if (config.camminamenti.attivo || config.interventi.includes("aggiunta_camminamenti")) {
    additions.push(`Add path/circulation system: ${PATH_DESCRIPTIONS[config.camminamenti.tipo]}.`);
    conversionRules.push("Path must connect logical access points with usable width and plausible continuity; no random curves or decorative dead ends.");
  }

  if (config.ground_cover.attivo) {
    additions.push(`Add ground-cover/mineral surface only in selected beds or support zones: ${GROUND_COVER_DESCRIPTIONS[config.ground_cover.tipo]}.`);
  }

  if (config.interventi.includes("bordo_piscina_verde") || target.targetZones.includes("bordo_piscina")) {
    plantingRules.push("Poolside planting must preserve pool basin, waterline, coping and deck strip; no leaves/shrubs invade the water zone.");
  }

  if (config.interventi.includes("bordo_casa") || target.targetZones.includes("bordo_casa")) {
    plantingRules.push("House-border planting must remain low/controlled near windows and leave thresholds, vents and facade details clear.");
  }

  if (config.declutter || config.interventi.includes("declutter")) {
    removals.push("Remove only visible garden clutter, weak scattered objects, dead plant debris or messy non-functional items selected by the user.");
    conversionRules.push("Declutter must preserve usable garden identity, main furniture/paths/functions and must not create an empty sterile space.");
  }

  if (config.arredo.modalita !== "mantieni") {
    additions.push(FURNITURE_DESCRIPTIONS[config.arredo.modalita]);
  } else {
    conversionRules.push(FURNITURE_DESCRIPTIONS.mantieni);
  }

  if (config.illuminazione !== "nessuna") {
    additions.push(`Add garden lighting: ${LIGHTING_DESCRIPTIONS[config.illuminazione]}.`);
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed element only if visible and non-structural: ${item}.`);
  }

  if (config.interventi.includes("restyling_completo")) {
    conversionRules.push("Complete restyling coordinates only the active selected systems among lawn, beds, hedges, trees, paths, ground cover, furniture and lighting without changing the house or non-target hardscape.");
  }

  const preserveExactly = uniq([
    ...DEFAULT_GARDEN_INTEGRITY_CONSTRAINTS,
    ...scene.untouchableElements,
    ...scene.contextToPreserve,
    ...(config.elementi_da_preservare ?? []),
  ]);

  return {
    interventions: config.interventi,
    additions: uniq(additions),
    removals: uniq(removals),
    replacements: uniq(replacements),
    refreshes: uniq(refreshes),
    plantingRules: uniq(plantingRules),
    conversionRules: uniq(conversionRules),
    preserveExactly,
    preserveGeometry: uniq([
      "house/facade geometry",
      "windows, doors, thresholds and access points",
      "pool/pergola/hardscape geometry unless targeted",
      "fences, walls and property boundaries",
      "camera angle, crop and perspective",
    ]),
    preserveContext: uniq(scene.contextToPreserve),
    maintenanceIntent: buildGardenStyleSpecification(config).maintenanceIntent,
  };
}

export function buildGardenRealismRules(config: ConfigurazioneGiardino): string[] {
  return uniq([
    "plants must be scaled to the photographed garden and must not read as pasted cutouts",
    "foliage density, lawn blade texture, soil/mulch/gravel and shadows must respond to the original light",
    "planting must be layered: lawn/ground cover low, shrubs medium, hedges/trees higher only where selected",
    "edges between lawn, beds, gravel, paths, pool, patio and facade must be crisp and buildable",
    config.stile === "moderno_minimale" ? "minimal modern style requires controlled density, strong clean masses and no random plant clutter" : "",
    config.stile === "naturale" ? "naturalistic style can be softer but must remain designed, legible and maintainable" : "",
  ]);
}

export function buildGardenQualityDirectives(config: ConfigurazioneGiardino): string[] {
  return uniq([
    ...DEFAULT_GARDEN_QUALITY_DIRECTIVES,
    `selected style must be visually recognizable as ${config.stile.replace(/_/g, " ")}`,
    "same-garden identity is more important than decorative abundance",
  ]);
}
