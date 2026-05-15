// shared/render-window/windowPromptValidation.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   + Check: centralHandle è valido SOLO su composizioni a 2 ante
//   + Check: cerniere a scomparsa solo su profili compatibili (warning, non block)
//   + Check: transom rule presente se target è portafinestra E user ha scelto "rimuovi"
//   + Check: electric button installato se motorized + cinghia visibile

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

  // ── v7 rules ────────────────────────────────────────────────────────────
  const missingHardwareConsistency = config.technical_specification.some(
    (spec) => spec.hingeMode === "visible" && (!spec.hingeConsistencyRule || !spec.hingeStyle),
  );
  if (missingHardwareConsistency) {
    missingBusinessRules.push("hinge finish/style consistency must be explicit for visible-hinges mode");
  }

  const missingHingePlacementRule = config.technical_specification.some(
    (spec) => spec.hingeMode === "visible" && !spec.hingePlacementRule,
  );
  if (missingHingePlacementRule) {
    missingBusinessRules.push("hinge placement rule must be explicit (per-sash count + position)");
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

  // ── v7 rules: motorized + manual cleanup ────────────────────────────────
  const requiresManualRemoval = config.scene_analysis.openings.some(
    (opening) =>
      config.target_selection.selectedOpeningIds.includes(opening.id) &&
      opening.hasBelt &&
      config.technical_specification.some(
        (spec) => spec.openingId === opening.id && spec.shutter.isMotorized,
      ),
  );

  if (requiresManualRemoval) {
    const missingManualCleanupSpec = config.technical_specification.some((spec) => {
      const opening = config.scene_analysis.openings.find((o) => o.id === spec.openingId);
      return Boolean(opening?.hasBelt) && spec.shutter.isMotorized && !spec.manualControlCleanupRule;
    });
    if (missingManualCleanupSpec) {
      missingBusinessRules.push("motorized shutter must define a zero-trace manual-control cleanup rule");
    }

    const hasRemovalRule = config.replacement_manifest.removals.some(
      (rule) => rule.code === "remove_manual_belt_system" && rule.summary.toLowerCase().includes("belt"),
    );
    if (!hasRemovalRule) {
      missingBusinessRules.push("motorized shutter must remove manual belt and wall winder");
    }

    // ── v8 rule: deve esserci anche l'installazione del bottone elettrico ──
    const missingElectricButton = config.technical_specification.some((spec) => {
      const opening = config.scene_analysis.openings.find((o) => o.id === spec.openingId);
      return (
        Boolean(opening?.hasBelt) &&
        spec.shutter.isMotorized &&
        !spec.shutter.electricButton?.install
      );
    });
    if (missingElectricButton) {
      missingBusinessRules.push(
        "motorized shutter must install an electric switch plate at the location of the removed manual winder",
      );
    }

    const hasElectricButtonRule = config.replacement_manifest.removals.some(
      (rule) => rule.code === "install_electric_shutter_switch",
    );
    if (!hasElectricButtonRule) {
      missingBusinessRules.push("manifest must include install_electric_shutter_switch rule for motorized shutters");
    }
  }

  // ── v8 rule: central handle solo su composizioni a 2 ante ───────────────
  const invalidCentralHandle = config.technical_specification.some(
    (spec) => spec.centralHandle && spec.desiredSashCount !== 2,
  );
  if (invalidCentralHandle) {
    missingBusinessRules.push(
      "centralHandle is supported ONLY on 2-sash compositions (F2A, PF2A). Disable it or select a 2-sash typology.",
    );
  }

  // ── v8 rule: non-target preservation explicit ───────────────────────────
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
