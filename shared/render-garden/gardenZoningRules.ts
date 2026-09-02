import type {
  ConfigurazioneGiardino,
  GardenSceneAnalysis,
  GardenTargetZone,
  GardenTargetZonesMap,
  PlantingEnvelope,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function zoneLabel(zone: GardenTargetZone): string {
  return zone.replace(/_/g, " ");
}

export function buildGardenTargetZonesMap(
  config: ConfigurazioneGiardino,
  scene: GardenSceneAnalysis,
): GardenTargetZonesMap {
  const zones: GardenTargetZone[] = config.target_zones.length
    ? config.target_zones
    : ["prato_principale"];
  const hasPool = zones.includes("bordo_piscina") || config.interventi.includes("bordo_piscina_verde");
  const hasPaths = zones.includes("area_camminamento") || config.camminamenti.attivo;

  return {
    targetZones: zones,
    mainLawnZone: zones.includes("prato_principale")
      ? "main visible lawn zone, bounded by existing hardscape, facade, paths and planting edges"
      : "main lawn zone is preserved unless directly touched by selected beds/path transitions",
    perimeterZones: zones.includes("perimetro")
      ? ["perimeter border along fences/walls/garden edges with continuous but breathable planting"]
      : ["perimeter planting remains unchanged unless selected"],
    houseBorderZones: zones.includes("bordo_casa")
      ? ["planting strip along house/facade kept low enough to preserve windows, vents, thresholds and facade readability"]
      : ["house border/facade junction is protected"],
    poolsideZones: hasPool
      ? ["poolside green zone outside coping/deck/water, with maintenance clearance and no plant spill into water"]
      : ["any visible pool, coping and deck are non-target and must remain intact"],
    pathZones: hasPaths
      ? ["new or refreshed circulation route connecting logical access points without random curves"]
      : ["existing paths and circulation routes are preserved"],
    relaxZones: zones.includes("area_relax")
      ? ["relax zone receives only sparse coherent furniture/planting if requested, preserving circulation"]
      : ["relax/patio furniture areas remain unchanged unless requested"],
    untouchedZones: uniq([
      ...scene.untouchableElements,
      "non-target hardscape",
      "doors, windows, thresholds and access routes",
      "non-target pool, pergola, fences and walls",
    ]),
    noPlantNoBlockZones: uniq([
      "door swings and threshold zones",
      "window clearances",
      "pool coping, pool water and deck circulation strip",
      "primary walking routes",
      "pergola post/clearance zones",
      "driveway or vehicle access if visible",
    ]),
    viewCorridorsToPreserve: [
      scene.mainViewCorridors,
      "do not fully close the photographed view toward the house, pool or garden depth unless a screening hedge is explicitly selected",
    ],
    breathingSpaceZones: uniq([
      "central lawn breathing space",
      "visual gaps between plant masses",
      "clear functional routes around patio/pool/pergola",
    ]),
  };
}

export function buildPlantingEnvelope(
  config: ConfigurazioneGiardino,
  scene: GardenSceneAnalysis,
  target: GardenTargetZonesMap,
): PlantingEnvelope {
  const warnings: string[] = [];
  if (config.alberi.attivo && config.alberi.scala === "importante" && /small|piccolo|stretto|narrow|compact/i.test(scene.apparentSize)) {
    warnings.push("Large trees selected for a small-looking garden: reduce canopy scale or use small ornamental trees to avoid impossible placement.");
  }
  if (config.siepi.attivo && config.siepi.tipo === "schermante_alta" && target.houseBorderZones.some((zone) => zone.includes("facade"))) {
    warnings.push("Tall screening hedge near facade must keep windows, doors and facade readable.");
  }

  return {
    plausiblePlantHeights: config.alberi.attivo
      ? `trees must stay proportionate: ${config.alberi.scala ?? "media"} scale, crowns clear of roof/facade conflicts, no oversized mature tree in a small garden`
      : "planting height must remain consistent with beds/hedges only; do not invent trees",
    bedWidthAndDepth: config.aiuole.attivo
      ? "planting beds need believable width/depth, clean edging and maintenance access; no huge beds swallowing a small lawn"
      : "no new planting beds unless selected; preserve existing bed geometry",
    plantingDensity: config.aiuole.attivo
      ? `planting density ${config.aiuole.densita}: mature spacing must be realistic and maintainable`
      : "preserve existing planting density unless another active system changes it",
    facadeClearance: "keep planting below windows where needed, away from doors, vents and facade details; never cover openings accidentally",
    pathAndDoorClearance: "preserve clear walking width to doors, gates, patio, pool and pergola; no shrub/hedge spill into circulation",
    poolPergolaRelation: "respect pool coping, deck strips, pergola posts and shaded relax zones; vegetation must not invade water, coping or structural clearances",
    treeScaleRules: config.alberi.attivo
      ? "new trees require plausible trunk/canopy scale, credible root zone, contact shadow and sun-shadow relationship"
      : "do not add trees",
    hedgeScaleRules: config.siepi.attivo
      ? "hedges must be continuous enough for screening but still read as individual plant texture, not a flat artificial green wall"
      : "do not add hedges",
    maintenanceLogic: config.stile === "low_maintenance"
      ? "low-maintenance intent: robust species, mulch/gravel/tappezzanti, reduced fragile lawn and controlled density"
      : "maintenance intent must look plausible for a residential garden, neither neglected nor impossibly manicured unless selected",
    forbiddenPlanting: [
      "trees planted against facade, roof, pool coping or doors",
      "hedges blocking windows or primary views unless explicitly requested",
      "beds covering access paths or driveway",
      "plants floating over paving/pool/deck",
      "overcrowded nursery-catalog collage planting",
      "random vegetation outside target zones",
    ],
    warnings,
  };
}

export function describeTargetZones(target: GardenTargetZonesMap): string {
  return target.targetZones.map(zoneLabel).join(", ");
}
