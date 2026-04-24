import {
  ACCESS_DESCRIPTIONS,
  ACCESSORY_DESCRIPTIONS,
  AREA_DESCRIPTIONS,
  COPING_DESCRIPTIONS,
  DEFAULT_INTEGRITY_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  DEFAULT_WATER_REALISM_RULES,
  INTERIOR_FINISH_DESCRIPTIONS,
  POOL_TYPE_DESCRIPTIONS,
  WATER_LOOK_DESCRIPTIONS,
  WATER_SYSTEM_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePiscine,
  PiscinaBuildabilityEnvelope,
  PiscinaReplacementManifest,
  PiscinaSceneAnalysis,
  PiscinaTargetAreaMap,
  PiscinaTechnicalSpecification,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function lightingDescription(config: ConfigurazionePiscine): string {
  switch (config.comfort.illuminazione) {
    case "subacquea_soft":
      return "subtle underwater lights integrated into pool walls, realistic soft glow, no fantasy lighting";
    case "perimetrale_calda":
      return "warm perimeter lighting around coping/deck, sparse and architectural";
    case "subacquea_e_perimetrale":
      return "coordinated subtle underwater and warm perimeter lights, realistic and not theatrical";
    default:
      return "no added pool lighting";
  }
}

function allowsWholePoolFeatureChanges(config: ConfigurazionePiscine): boolean {
  return config.operazione === "add_new_pool" || config.operazione === "replace_existing_pool";
}

function isStrictSurfaceOnlyOperation(config: ConfigurazionePiscine): boolean {
  return config.operazione === "recolor_waterlook_or_liner_only" || config.operazione === "change_coping_only";
}

export function buildPiscinaTechnicalSpecification(config: ConfigurazionePiscine): PiscinaTechnicalSpecification {
  const accessoryDescriptions = (config.comfort.accessori ?? []).map((item) => ACCESSORY_DESCRIPTIONS[item]);
  const installationType = ["semi_incassata", "fuori_terra_premium", "minipiscina", "terrazzo_compatta"].includes(config.piscina.tipo)
    ? "raised / semi-inground / compact system with visible premium base and edge integration"
    : "in-ground pool inserted into the terrain with believable excavation and coping";

  return {
    poolTypology: config.piscina.tipo,
    poolGeometry: `${POOL_TYPE_DESCRIPTIONS[config.piscina.tipo]}; shape ${config.piscina.forma.replace(/_/g, " ")}; apparent size ${config.piscina.dimensione_apparente.replace(/_/g, " ")}`,
    installationType,
    waterSystem: config.piscina.sistema_bordo,
    waterSystemDescription: WATER_SYSTEM_DESCRIPTIONS[config.piscina.sistema_bordo],
    interiorFinish: config.finiture.rivestimento_interno,
    interiorFinishDescription: INTERIOR_FINISH_DESCRIPTIONS[config.finiture.rivestimento_interno],
    waterLookDescription: `${WATER_LOOK_DESCRIPTIONS[config.piscina.colore_acqua]}; must be consistent with ${INTERIOR_FINISH_DESCRIPTIONS[config.finiture.rivestimento_interno]}`,
    accessDescription: ACCESS_DESCRIPTIONS[config.comfort.accesso],
    copingDescription: COPING_DESCRIPTIONS[config.finiture.coping],
    deckDescription: AREA_DESCRIPTIONS[config.finiture.area_perimetrale],
    lightingDescription: lightingDescription(config),
    accessoryDescriptions,
  };
}

export function buildPiscinaReplacementManifest(
  config: ConfigurazionePiscine,
  scene: PiscinaSceneAnalysis,
  target: PiscinaTargetAreaMap,
  envelope: PiscinaBuildabilityEnvelope,
  technical: PiscinaTechnicalSpecification,
): PiscinaReplacementManifest {
  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "All pool work must respect the target pool insertion map and buildability envelope.",
    envelope.groundPlaneRelation,
    "Pool edges, coping, water level and surrounding deck/lawn transitions must be clean, buildable and perspective-correct.",
  ];

  const poolSummary = `${technical.poolGeometry}; ${technical.installationType}; ${technical.waterSystemDescription}; ${technical.interiorFinishDescription}; coping ${technical.copingDescription}; surrounding ${technical.deckDescription}`;

  switch (config.operazione) {
    case "add_new_pool":
      additions.push(`Insert a new pool in ${target.targetDescription}: ${poolSummary}.`);
      conversions.push("Integrate the basin into the existing ground/patio/deck; do not leave a pasted-on blue rectangle.");
      break;
    case "replace_existing_pool":
      removals.push("Remove the existing pool basin/water plane, old coping, incompatible deck edges, skimmers, ladders and visible outdated pool details completely.");
      removals.push("Rebuild the surrounding ground/deck/paving cleanly before inserting the new pool geometry.");
      replacements.push(`Replace the old pool with only the newly selected pool system: ${poolSummary}.`);
      conversions.push("No hybrid state: no old pool perimeter, old coping, old waterline or old deck scars may remain.");
      break;
    case "remove_existing_pool":
      removals.push("Remove the existing pool completely: water, basin, coping, ladder, skimmer/overflow details, pool lights and incompatible deck edges.");
      replacements.push("Restore the target area as coherent lawn, patio, deck or hardscape matching the photographed context.");
      conversions.push("No residual basin ghost, blue water patch, coping outline or excavation scar may remain.");
      break;
    case "recolor_waterlook_or_liner_only":
      recolors.push(`Change only the perceived interior finish/water look to ${technical.interiorFinishDescription} and ${technical.waterLookDescription}.`);
      conversions.push("Waterlook/liner-only: preserve exact pool shape, footprint, coping, surrounding deck and visible pool geometry.");
      conversions.push("Strict scope: do not add or modify steps, beach shelf, lighting, furniture, water features, coping, deck or pool footprint.");
      break;
    case "change_coping_only":
      replacements.push(`Preserve basin geometry and water; replace only coping/immediate pool edge with ${technical.copingDescription}.`);
      conversions.push("Coping-only: no footprint change, no water-system change, no basin shape change.");
      conversions.push("Strict scope: do not add or modify access steps, beach shelf, ladders, water color, liner, pool lighting, furniture or surrounding deck beyond the immediate coping junction.");
      break;
    case "add_access_system":
      additions.push(`Add selected pool access feature: ${technical.accessDescription}.`);
      conversions.push("Access system must be integrated into the basin shape, visible through water when underwater, and not randomly placed.");
      break;
    case "add_pool_features":
      additions.push(...technical.accessoryDescriptions);
      conversions.push("Pool features must appear only if selected, attached to real pool edges/walls/deck and scaled plausibly.");
      break;
  }

  if ((allowsWholePoolFeatureChanges(config) || config.operazione === "add_access_system") && config.comfort.accesso !== "nessuno") {
    additions.push(`Access detail: ${technical.accessDescription}.`);
  }
  if ((allowsWholePoolFeatureChanges(config) || config.operazione === "add_pool_features") && config.comfort.illuminazione !== "nessuna") {
    additions.push(`Lighting detail: ${technical.lightingDescription}.`);
  }
  if (allowsWholePoolFeatureChanges(config) && config.comfort.arredo === "aggiungi_minimo") {
    additions.push("Add only sparse coherent poolside furniture / sun loungers if there is enough visible space; avoid resort staging.");
  } else if (allowsWholePoolFeatureChanges(config) && config.comfort.arredo === "rimuovi_superfluo") {
    removals.push("Declutter only small non-essential outdoor objects; do not remove fixed landscape or main furniture unless explicitly listed.");
  } else {
    conversions.push(isStrictSurfaceOnlyOperation(config)
      ? "Preserve existing outdoor furniture, access features and lighting exactly; do not reinterpret non-target poolside elements."
      : "Preserve existing outdoor furniture in place; adapt only water/deck reflections and shadows around it.");
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed incompatible element: ${item}.`);
  }

  const preserveExactly = uniq([
    ...DEFAULT_INTEGRITY_CONSTRAINTS,
    ...scene.untouchableElements,
    ...scene.contextToPreserve,
    ...(config.elementi_da_preservare ?? []),
  ]);

  return {
    operation: config.operazione,
    additions: uniq(additions),
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    removals: uniq(removals),
    conversions: uniq(conversions),
    preserveExactly,
  };
}

export function buildPiscinaWaterRealismRules(config: ConfigurazionePiscine): string[] {
  const systemRule = config.piscina.sistema_bordo === "skimmer"
    ? "skimmer pool: waterline must sit slightly below coping; do not render an overflow/infinity edge"
    : config.piscina.sistema_bordo === "infinity_edge"
      ? "infinity pool: only one plausible edge may visually spill toward the view/lower side; do not use if context is flat and enclosed"
      : "overflow pool: water level nearly flush with edge, continuous premium perimeter, no skimmer ambiguity";

  const accessRule = isStrictSurfaceOnlyOperation(config) || config.operazione === "remove_existing_pool"
    ? "preserve existing access geometry exactly; do not add or modify steps, ladders, beach shelf or lounge shelf in this operation scope"
    : config.comfort.accesso === "spiaggetta" || config.comfort.accesso === "beach_entry"
      ? "shallow zone must be clearly readable with thinner transparent water and a smooth depth transition"
      : config.comfort.accesso.includes("grad")
        ? "steps must be visible, proportional, aligned to pool geometry and readable through the water"
        : "do not invent access features beyond selected configuration";

  return uniq([
    ...DEFAULT_WATER_REALISM_RULES,
    systemRule,
    accessRule,
    `water look must follow interior finish: ${INTERIOR_FINISH_DESCRIPTIONS[config.finiture.rivestimento_interno]}`,
  ]);
}

export function buildPiscinaQualityDirectives(config: ConfigurazionePiscine): string[] {
  const aboveGroundRule = ["fuori_terra_premium", "semi_incassata", "terrazzo_compatta"].includes(config.piscina.tipo)
    ? "above-ground / semi-inground pool must show premium base, cladding and deck integration, never cheap or inflatable"
    : "in-ground pool must read as excavated and integrated into terrain with believable coping and deck/lawn junction";

  return uniq([
    ...DEFAULT_QUALITY_DIRECTIVES,
    aboveGroundRule,
    "pool geometry, coping thickness, waterline and deck transitions must be crisp and buildable",
  ]);
}
