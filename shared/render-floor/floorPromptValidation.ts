import type { FloorPromptValidationResult, FloorRenderConfig } from "./types.ts";

export function validateFloorPromptConfig(config: FloorRenderConfig): FloorPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.coverage_map.mainVisibleArea) missingSections.push("coverage_map.mainVisibleArea");
  if (config.replacement_manifest.replacements.length === 0) missingSections.push("replacement_manifest.replacements");
  if (config.replacement_manifest.patternRules.length === 0) missingSections.push("replacement_manifest.patternRules");
  if (config.replacement_manifest.jointRules.length === 0) missingSections.push("replacement_manifest.jointRules");
  if (config.replacement_manifest.skirtingRules.length === 0) missingSections.push("replacement_manifest.skirtingRules");
  if (!config.technical_specification.materialDescription) missingSections.push("technical_specification.materialDescription");
  if (config.integrity_constraints.length === 0) missingSections.push("integrity_constraints");

  if (config.technical_specification.isSeamless) {
    const jointText = config.replacement_manifest.jointRules.join(" ").toLowerCase();
    if (!jointText.includes("no grout") || !jointText.includes("no tile") || !jointText.includes("ghost")) {
      missingBusinessRules.push("continuous floors must explicitly remove grout, tile joints and ghost grid");
    }
  }

  if (config.legacy_config.battiscopa?.azione === "mantieni") {
    const text = config.replacement_manifest.skirtingRules.join(" ").toLowerCase();
    if (!text.includes("keep") || text.includes("replace baseboard")) {
      missingBusinessRules.push("kept skirting must not be replaced or recolored");
    }
  }

  if (config.legacy_config.battiscopa?.azione === "rimuovi") {
    const text = config.replacement_manifest.skirtingRules.join(" ").toLowerCase();
    if (!text.includes("remove") || !text.includes("repair")) {
      missingBusinessRules.push("removed skirting must include clean junction repair");
    }
  }

  if (config.legacy_config.pattern_posa === "spina_di_pesce") {
    const text = config.replacement_manifest.patternRules.join(" ").toLowerCase();
    if (!text.includes("herringbone") || !text.includes("90 degrees")) {
      missingBusinessRules.push("classic herringbone must be explicit and not confused with chevron");
    }
  }

  if (config.legacy_config.pattern_posa === "spina_ungherese") {
    const text = config.replacement_manifest.patternRules.join(" ").toLowerCase();
    if (!text.includes("hungarian") || !text.includes("chevron") || !text.includes("cut")) {
      missingBusinessRules.push("Hungarian point must describe angled cut ends");
    }
  }

  if (config.legacy_config.formato_piastrella?.startsWith("120")) {
    const text = [
      config.technical_specification.formatRule,
      config.replacement_manifest.patternRules.join(" "),
    ].join(" ").toLowerCase();
    if (!text.includes("large-format") && !text.includes("maxi")) {
      missingBusinessRules.push("large tile formats must preserve large slab scale");
    }
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
