import { HEAD_BOX_DESCRIPTIONS, LEAF_COUNT_DESCRIPTIONS, hasHingedLeaves } from "./promptFragments.ts";
import { TIPI_CON_CASSONETTO, anteCompatibili } from "./types.ts";
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

  // Il fermo a muro vale per le ante: per tapparella, veneziana esterna e
  // brise-soleil «aperto 90» è il telo alzato o il sistema fisso.
  const openNinetyWithoutRule = config.technical_specification.some(
    (spec) =>
      spec.openingState === "aperto_90" &&
      hasHingedLeaves(spec.targetType) &&
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

  const woodEffectWithoutIdentity = config.technical_specification.some(
    (spec) =>
      spec.finish?.mode === "legno" &&
      !spec.finish.promptFragment.toLowerCase().includes("exact selected wood-effect identity"),
  );
  if (woodEffectWithoutIdentity) {
    missingBusinessRules.push("wood-effect shutters must explicitly preserve the exact selected wood identity");
  }

  const ralWithoutExactTone = config.technical_specification.some(
    (spec) =>
      spec.finish?.mode === "ral" &&
      !spec.finish.promptFragment.toLowerCase().includes("exact architectural coating"),
  );
  if (ralWithoutExactTone) {
    missingBusinessRules.push("RAL shutters must explicitly preserve the exact selected finish tone");
  }

  // Elementi del 04/10: se scelti e validi per il tipo, devono arrivare al prompt.
  const legacy = config.legacy_config;
  const leafCountLost = config.technical_specification.some(
    (spec) => !spec.recolorOnly && anteCompatibili(spec.targetType, legacy.numero_ante) &&
      spec.leafConfiguration !== LEAF_COUNT_DESCRIPTIONS[legacy.numero_ante],
  );
  if (leafCountLost) missingBusinessRules.push("the selected leaf count must reach the leaf configuration");

  const louverMovementLost = config.technical_specification.some(
    (spec) => !spec.recolorOnly && Boolean(legacy.lamelle?.movimento) && spec.targetType && (spec.targetType === "veneziana_classica" || spec.targetType === "brise_soleil") &&
      Boolean(spec.louverRule) && !/fixed slats|adjustable slats|blades fixed|blades pivoting/.test(spec.louverRule ?? ""),
  );
  if (louverMovementLost) missingBusinessRules.push("the selected slat movement (fixed/adjustable) must reach the louver rule");

  const headBoxLost = config.technical_specification.some(
    (spec) => !spec.recolorOnly && legacy.cassonetto && spec.targetType && TIPI_CON_CASSONETTO.has(spec.targetType) &&
      !spec.hardwareRules.includes(`head box: ${HEAD_BOX_DESCRIPTIONS[legacy.cassonetto]}`),
  );
  if (headBoxLost) missingBusinessRules.push("the selected head box must reach the hardware rules");

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
