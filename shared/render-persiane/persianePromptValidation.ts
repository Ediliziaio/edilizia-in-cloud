import type { PersianePromptValidationResult, PersianeRenderConfig } from "./types.ts";

export function validatePersianePromptConfig(config: PersianeRenderConfig): PersianePromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.scene_analysis) missingSections.push("scene_analysis");
  if (config.target_selection.selectedOpeningIds.length === 0) missingSections.push("target_selection");
  if (config.technical_specification.length === 0) missingSections.push("technical_specification");
  if (config.replacement_manifest.targetOpenings.length === 0) missingSections.push("replacement_manifest.targetOpenings");
  if (config.integrity_constraints.length === 0) missingSections.push("integrity_constraints");

  const missingUntouchedProtection =
    config.target_selection.preservedOpeningIds.length > 0 &&
    config.replacement_manifest.untouchedOpenings.length === 0;
  if (missingUntouchedProtection) {
    missingBusinessRules.push("untouched openings must be explicitly preserved");
  }

  const invalidLouverRules = config.technical_specification.some((spec) => spec.supportsLouvers && !spec.louverRule);
  if (invalidLouverRules) {
    missingBusinessRules.push("louvered shutter types must define slat/louver behavior");
  }

  const invalidNonLouverRules = config.technical_specification.some((spec) => !spec.supportsLouvers && Boolean(spec.louverRule));
  if (invalidNonLouverRules) {
    missingBusinessRules.push("non-louvered shutter types must not carry louver instructions");
  }

  const openNinetyWithoutRule = config.technical_specification.some(
    (spec) =>
      spec.openingState === "aperto_90" &&
      !spec.hardwareRules.some((rule) => rule.toLowerCase().includes("90 degrees") || rule.toLowerCase().includes("wall plane")),
  );
  if (openNinetyWithoutRule) {
    missingBusinessRules.push("90 degree opening state must enforce wall-plane / hold-open behavior");
  }

  const recolorWithGeometryChange = config.technical_specification.some(
    (spec) =>
      spec.recolorOnly &&
      (!spec.keepGeometryExactly || config.replacement_manifest.removals.some((rule) => rule.openingIds.includes(spec.openingId) && rule.code !== `recolor_only_${spec.openingId}`)),
  );
  if (recolorWithGeometryChange) {
    missingBusinessRules.push("recolor operation must not introduce geometric replacement rules");
  }

  const removalWithoutRules = config.legacy_config.operazione === "rimuovi" && config.replacement_manifest.removals.length === 0;
  if (removalWithoutRules) {
    missingBusinessRules.push("remove operation must define shutter and hardware removal rules");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
