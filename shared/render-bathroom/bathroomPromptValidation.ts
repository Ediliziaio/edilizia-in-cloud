import type { BathroomPromptValidationResult, BathroomRenderConfig } from "./types.ts";

export function validateBathroomPromptConfig(config: BathroomRenderConfig): BathroomPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.scene_analysis) {
    missingSections.push("scene_analysis");
  }

  if (!config.technical_specification) {
    missingSections.push("technical_specification");
  }

  if (config.replacement_manifest.replacements.length === 0) {
    missingSections.push("replacement_manifest.replacements");
  }

  if (config.integrity_constraints.length === 0) {
    missingSections.push("integrity_constraints");
  }

  const requiresTubRemoval =
    config.scene_analysis.bathtub.present &&
    config.technical_specification.shower.replace &&
    !config.technical_specification.bathtub.replace;
  if (requiresTubRemoval) {
    const hasTubRemovalRule = config.replacement_manifest.removals.some((rule) =>
      rule.code === "remove_existing_bathtub_for_new_shower",
    );
    if (!hasTubRemovalRule) {
      missingBusinessRules.push("bathtub -> shower conversion must explicitly remove the old bathtub");
    }
  }

  const requiresShowerRemoval =
    config.scene_analysis.shower.present &&
    config.technical_specification.bathtub.replace &&
    !config.technical_specification.shower.replace;
  if (requiresShowerRemoval) {
    const hasShowerRemovalRule = config.replacement_manifest.removals.some((rule) =>
      rule.code === "remove_existing_shower_for_new_bathtub",
    );
    if (!hasShowerRemovalRule) {
      missingBusinessRules.push("shower -> bathtub conversion must explicitly remove the old shower");
    }
  }

  if (config.technical_specification.shower.replace) {
    const spec = config.technical_specification.shower;
    if (!spec.showerTypeLabel || !spec.layoutRule) {
      missingBusinessRules.push("selected shower type must be explicit and operational");
    }
    if (spec.type === "walk_in" && !spec.layoutRule.toLowerCase().includes("walk-in")) {
      missingBusinessRules.push("walk-in shower must be described as a real open walk-in, not a generic box");
    }
  }

  if (config.technical_specification.vanity.replace) {
    const spec = config.technical_specification.vanity;
    if (spec.installation === "wall_hung" && !spec.styleLabel.toLowerCase().includes("wall-hung")) {
      missingBusinessRules.push("wall-hung vanity must be explicit");
    }
  }

  if (config.technical_specification.sanitaryWare.replace) {
    const spec = config.technical_specification.sanitaryWare;
    const asksWallHung =
      spec.toiletType.toLowerCase().includes("wall-hung") ||
      (spec.bidetType?.toLowerCase().includes("wall-hung") ?? false);
    if (asksWallHung && !spec.installationRule.toLowerCase().includes("sosp")) {
      missingBusinessRules.push("wall-hung sanitary ware must be explicit in the installation rule");
    }
  }

  if (
    config.technical_specification.floor.replace &&
    !config.technical_specification.wallTiles.replace &&
    config.replacement_manifest.replacements.some((line) => line.toLowerCase().includes("wall tiles with"))
  ) {
    missingBusinessRules.push("floor-only replacement must not describe wall tile replacement");
  }

  if (
    config.technical_specification.wallTiles.replace &&
    !config.technical_specification.floor.replace &&
    config.replacement_manifest.replacements.some((line) => line.toLowerCase().includes("replace floor with"))
  ) {
    missingBusinessRules.push("wall-only replacement must not describe floor replacement");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
