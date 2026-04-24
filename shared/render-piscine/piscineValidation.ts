import type {
  PiscinaPromptValidationResult,
  PiscinaRenderConfig,
} from "./types.ts";

export function validatePiscinePromptConfig(config: PiscinaRenderConfig): PiscinaPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.target_pool_insertion_map?.footprint) missingSections.push("target pool insertion map");
  if (!config.buildability_envelope?.plausibleSize) missingSections.push("buildability envelope");
  if (!config.replacement_manifest?.conversions?.length) missingSections.push("replacement manifest");
  if (!config.technical_specification?.poolGeometry) missingSections.push("pool geometry specification");
  if (!config.technical_specification?.waterSystemDescription) missingSections.push("water system specification");
  if (!config.technical_specification?.interiorFinishDescription) missingSections.push("interior finish and water look specification");
  if (!config.technical_specification?.copingDescription) missingSections.push("coping and deck rules");
  if (!config.water_realism_rules?.length) missingSections.push("water realism rules");
  if (!config.integrity_constraints?.length) missingSections.push("property integrity constraints");

  const cfg = config.legacy_config;
  const allText = [
    ...config.replacement_manifest.additions,
    ...config.replacement_manifest.replacements,
    ...config.replacement_manifest.recolors,
    ...config.replacement_manifest.removals,
    ...config.replacement_manifest.conversions,
    ...config.water_realism_rules,
    config.technical_specification.waterSystemDescription,
    config.buildability_envelope.groundPlaneRelation,
  ].join(" ").toLowerCase();

  if (cfg.piscina.sistema_bordo === "infinity_edge" && config.buildability_envelope.infinityFeasibility !== "plausible") {
    missingBusinessRules.push("infinity-edge selected but context feasibility is limited; prompt must constrain it to a plausible edge or downgrade visually");
  }
  if (
    cfg.piscina.sistema_bordo === "skimmer" &&
    (
      allText.includes("infinity pool: only one plausible edge") ||
      allText.includes("overflow pool: water level nearly flush") ||
      allText.includes("water level very close to upper edge")
    )
  ) {
    missingBusinessRules.push("skimmer selected but overflow/infinity language leaks into rules");
  }
  if ((cfg.piscina.sistema_bordo === "sfioro" || cfg.piscina.sistema_bordo === "sfioro_nascosto") && !allText.includes("water level")) {
    missingBusinessRules.push("overflow selected but water-level rules are missing");
  }
  if (cfg.operazione === "recolor_waterlook_or_liner_only" && !allText.includes("preserve exact pool shape")) {
    missingBusinessRules.push("waterlook/liner-only must preserve shape, footprint and coping");
  }
  if (cfg.operazione === "replace_existing_pool" && !allText.includes("remove the existing pool")) {
    missingBusinessRules.push("replace existing pool must include old pool removal rules");
  }
  if (cfg.operazione === "remove_existing_pool" && !allText.includes("restore")) {
    missingBusinessRules.push("remove pool must include ground/hardscape restoration rules");
  }
  if ((cfg.comfort.accesso === "spiaggetta" || cfg.comfort.accesso === "beach_entry") && !allText.includes("shallow")) {
    missingBusinessRules.push("beach/baja shelf requires shallow-water rules");
  }
  if (cfg.piscina.tipo === "fuori_terra_premium" && !allText.includes("above-ground")) {
    missingBusinessRules.push("premium above-ground pool requires base/support logic");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
