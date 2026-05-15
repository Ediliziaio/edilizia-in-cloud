import type { WindowPromptValidationResult, WindowRenderConfig } from "./types.ts";

export function validateWindowPromptConfig(config: WindowRenderConfig): WindowPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (config.target_selection.selectedOpeningIds.length === 0) {
    missingSections.push("target_selection");
  }

  if (config.replacement_manifest.targetOpenings.length === 0) {
    missingSections.push("replacement_manifest.targetOpenings");
  }

  if (config.integrity_constraints.length === 0) {
    missingSections.push("integrity_constraints");
  }

  if (config.technical_specification.length === 0) {
    missingSections.push("technical_specification");
  }

  const missingHardwareConsistency = config.technical_specification.some(
    (spec) => spec.hingeMode !== "none" && (!spec.hingeConsistencyRule || !spec.hingeStyle || !spec.hingePlacementRule),
  );
  if (missingHardwareConsistency) {
    missingBusinessRules.push("hinge finish/style consistency must be explicit");
  }

  const visibleHingesMissingCount = config.technical_specification.some(
    (spec) => spec.hingeMode === "visible" && (!spec.hingesPerSash || spec.hingeCountVisible <= 0),
  );
  if (visibleHingesMissingCount) {
    missingBusinessRules.push("visible hinge mode must define hinges per sash and total visible hinge count");
  }

  const missingCassonettoEnvelopeRule = config.technical_specification.some(
    (spec) => spec.cassonetto.replace && !spec.cassonetto.dimensionRule,
  );
  if (missingCassonettoEnvelopeRule) {
    missingBusinessRules.push("cassonetto replacement must preserve or define the visible envelope");
  }

  const missingShutterPlacementRule = config.technical_specification.some(
    (spec) => spec.shutter.replace && !spec.shutter.placementRule,
  );
  if (missingShutterPlacementRule) {
    missingBusinessRules.push("shutter replacement must define placement/visibility rules");
  }

  const requiresManualRemoval = config.scene_analysis.openings.some(
    (opening) =>
      config.target_selection.selectedOpeningIds.includes(opening.id) &&
      opening.hasBelt &&
      config.technical_specification.some(
        (spec) => spec.openingId === opening.id && spec.shutter.isMotorized,
      ),
  );

  if (requiresManualRemoval) {
    const missingManualCleanupSpec = config.technical_specification.some(
      (spec) => {
        const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
        return Boolean(opening?.hasBelt) && spec.shutter.isMotorized && !spec.manualControlCleanupRule;
      },
    );
    if (missingManualCleanupSpec) {
      missingBusinessRules.push("motorized shutter must define a zero-trace manual-control cleanup rule");
    }

    const hasRemovalRule = config.replacement_manifest.removals.some(
      (rule) =>
        rule.code === "remove_manual_belt_system" &&
        rule.summary.toLowerCase().includes("belt"),
    );
    if (!hasRemovalRule) {
      missingBusinessRules.push("motorized shutter must remove manual belt and wall winder");
    }

    const missingElectricButton = config.technical_specification.some((spec) => {
      const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
      return Boolean(opening?.hasBelt) && spec.shutter.isMotorized && !spec.shutter.electricButton?.install;
    });
    if (missingElectricButton) {
      missingBusinessRules.push("motorized shutter must add a coherent electric command button after manual belt removal");
    }
  }

  const missingTransomRule = config.technical_specification.some((spec) => {
    const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
    return Boolean(opening?.hasHorizontalTransom) && spec.desiredOpeningType === "portafinestra" && !spec.transomRule;
  });
  if (missingTransomRule) {
    missingBusinessRules.push("detected horizontal transom must have an explicit keep/remove/add rule");
  }

  const hasUntouchedRule =
    config.replacement_manifest.untouchedOpenings.length === 0 ||
    config.integrity_constraints.some((item) => item.toLowerCase().includes("non-target"));

  if (!hasUntouchedRule) {
    missingBusinessRules.push("non-target openings must be explicitly preserved");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
