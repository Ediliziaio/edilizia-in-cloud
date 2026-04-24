import type { PergolaPromptValidationResult, PergolaRenderConfig } from "./types.ts";

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

export function validatePergolePromptConfig(config: PergolaRenderConfig): PergolaPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const allText = JSON.stringify(config).toLowerCase();
  const technical = config.technical_specification;

  if (!config.scene_analysis.outdoorAreaType) missingSections.push("scene_analysis.outdoorAreaType");
  if (!config.target_installation_map.targetDescription) missingSections.push("target_installation_map");
  if (!config.installability_envelope.postPositions.length) missingSections.push("installability_envelope.postPositions");
  if (!config.replacement_manifest.additions.length &&
      !config.replacement_manifest.replacements.length &&
      !config.replacement_manifest.recolors.length &&
      !config.replacement_manifest.removals.length) {
    missingSections.push("replacement_manifest");
  }
  if (!technical.structureLanguage) missingSections.push("technical_specification.structure");
  if (!technical.coverDescription) missingSections.push("technical_specification.cover");

  if (technical.wallMounted && !includesAny(allText, ["facade", "wall-mounted", "rear beam", "ledger"])) {
    missingBusinessRules.push("wall-mounted pergola must describe facade attachment");
  }
  if (!technical.wallMounted && !includesAny(allText, ["freestanding", "independent", "no wall attachment"])) {
    missingBusinessRules.push("freestanding pergola must describe independent posts/anchoring");
  }
  if (technical.coverType === "lamelle_orientabili" && !includesAny(allText, ["louver", "lamelle", "orientable"])) {
    missingBusinessRules.push("bioclimatic cover must contain louver/open-state rules");
  }
  if (technical.coverType === "telo_retraibile" && !includesAny(allText, ["fabric", "textile", "telo", "retractable"])) {
    missingBusinessRules.push("retractable fabric cover must contain fabric state rules");
  }
  if (technical.coverType === "vetro" && !includesAny(allText, ["glass", "transparent", "reflection"])) {
    missingBusinessRules.push("glass cover must contain transparency/reflection rules");
  }
  if (config.legacy_config.operazione === "recolor_only" && !includesAny(allText, ["preserve exact footprint", "recolor-only"])) {
    missingBusinessRules.push("recolor only must not alter geometry or footprint");
  }
  if (
    config.legacy_config.operazione === "recolor_only" &&
    (
      config.replacement_manifest.additions.length > 0 ||
      config.replacement_manifest.replacements.length > 0 ||
      config.replacement_manifest.removals.length > 0
    )
  ) {
    missingBusinessRules.push("recolor only must not add, replace or remove pergola systems");
  }
  if (
    config.legacy_config.operazione === "change_cover_only" &&
    config.replacement_manifest.additions.some((item) => /side closure|lighting|furniture/i.test(item))
  ) {
    missingBusinessRules.push("cover-only must not add side closures, lighting or furniture");
  }
  if (
    config.legacy_config.operazione === "change_open_state" &&
    config.replacement_manifest.additions.length > 0
  ) {
    missingBusinessRules.push("open-state change must not add new pergola systems");
  }
  if (config.legacy_config.operazione.includes("replace_existing") && !includesAny(allText, ["remove", "patch", "restore"])) {
    missingBusinessRules.push("replacement of existing structure must include removal and restoration rules");
  }
  if (!includesAny(allText, ["drainage", "water", "gutter"])) {
    missingBusinessRules.push("drainage/water management rules must be present");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
