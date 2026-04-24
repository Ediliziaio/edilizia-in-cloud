import type { GardenPromptValidationResult, GardenRenderConfig } from "./types.ts";

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

export function validateGardenPromptConfig(config: GardenRenderConfig): GardenPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const warnings = [...config.planting_envelope.warnings];
  const allText = JSON.stringify(config).toLowerCase();
  const manifestAdditions = JSON.stringify(config.replacement_manifest.additions).toLowerCase();
  const legacy = config.legacy_config;

  if (!config.scene_analysis.outdoorSpaceType) missingSections.push("scene_analysis.outdoorSpaceType");
  if (!config.target_zones_map.targetZones.length) missingSections.push("target_zones_map");
  if (!config.planting_envelope.plausiblePlantHeights) missingSections.push("planting_envelope");
  if (!config.style_specification.visualLanguage) missingSections.push("style_specification");
  if (!config.replacement_manifest.additions.length &&
      !config.replacement_manifest.replacements.length &&
      !config.replacement_manifest.removals.length &&
      !config.replacement_manifest.conversionRules.length) {
    missingSections.push("replacement_manifest");
  }

  const onlyLawn = legacy.interventi.length === 1 && legacy.interventi[0] === "rifacimento_prato";
  if (onlyLawn) {
    if (legacy.aiuole.attivo || legacy.siepi.attivo || legacy.alberi.attivo || legacy.camminamenti.attivo) {
      missingBusinessRules.push("solo prato must not activate beds, hedges, trees or paths");
    }
    if (includesAny(manifestAdditions, ["add hedge", "add path/circulation", "ornamental tree"])) {
      missingBusinessRules.push("solo prato prompt must not add extra garden systems");
    }
  }

  if ((legacy.siepi.attivo || legacy.interventi.includes("aggiunta_siepi")) && !includesAny(allText, ["hedge", "screening", "clearance"])) {
    missingBusinessRules.push("hedge addition must include scale and clearance rules");
  }
  if ((legacy.alberi.attivo || legacy.interventi.includes("aggiunta_alberi")) && !includesAny(allText, ["tree", "canopy", "shadow", "scale"])) {
    missingBusinessRules.push("tree addition must include scale and shadow logic");
  }
  if ((legacy.camminamenti.attivo || legacy.interventi.includes("aggiunta_camminamenti")) && !includesAny(allText, ["path", "circulation", "connect"])) {
    missingBusinessRules.push("new path must include circulation logic");
  }
  if ((legacy.declutter || legacy.interventi.includes("declutter")) && !includesAny(allText, ["remove only", "preserve usable", "not create an empty sterile"])) {
    missingBusinessRules.push("declutter must preserve usable garden identity");
  }
  if ((legacy.interventi.includes("bordo_piscina_verde") || legacy.target_zones.includes("bordo_piscina")) && !includesAny(allText, ["pool basin", "coping", "waterline", "water zone"])) {
    missingBusinessRules.push("poolside garden must preserve pool/coping/water zones");
  }
  if (!includesAny(allText, ["no-plant", "no plant", "forbiddenplanting", "forbidden planting"])) {
    missingBusinessRules.push("forbidden planting / no-block zones must be present");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
    warnings,
  };
}
