import type { FacciataPromptValidationResult, FacciataRenderConfig } from "./types.ts";

export function validateFacciataPromptConfig(config: FacciataRenderConfig): FacciataPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.scene_analysis) missingSections.push("scene_analysis");
  if (config.zone_targeting.affectedZones.length === 0) missingSections.push("zone_targeting.affectedZones");
  if (!config.replacement_manifest) missingSections.push("replacement_manifest");
  if (config.integrity_constraints.length === 0) missingSections.push("integrity_constraints");

  const cappotto = config.technical_specification.insulation;
  if (cappotto.active) {
    if (!cappotto.revealDepthRule || !cappotto.sillAdaptationRule || !cappotto.edgeProfileRule) {
      missingBusinessRules.push("active thermal insulation must define reveal depth, sill adaptation and edge profile rules");
    }
  }

  const removeCornici = config.technical_specification.elements.windowCornices.action === "remove";
  if (
    removeCornici &&
    !config.replacement_manifest.removals.some((rule) => rule.code === "remove_window_cornices" && Boolean(rule.patchRule))
  ) {
    missingBusinessRules.push("removing window cornices must include seamless wall patching rules");
  }

  const paintOnly =
    config.legacy_config.tipo_intervento === "tinteggiatura" &&
    config.technical_specification.plaster.active &&
    !config.technical_specification.cladding.active &&
    !config.technical_specification.insulation.active;

  if (
    paintOnly &&
    config.replacement_manifest.replacements.some((line) =>
      /advance|depth|cladding|new base course/i.test(line),
    )
  ) {
    missingBusinessRules.push("paint-only intervention must not introduce invasive geometric or cladding instructions");
  }

  if (
    config.technical_specification.elements.railings.action === "repaint" &&
    !config.replacement_manifest.repaintActions.some((line) => /preserve the exact railing drawing/i.test(line))
  ) {
    missingBusinessRules.push("railing repaint must explicitly preserve geometry and structure");
  }

  const groundFloorCladding = config.technical_specification.cladding.active && config.technical_specification.cladding.zone === "piano_terra";
  if (
    groundFloorCladding &&
    !config.replacement_manifest.removals.some((rule) => rule.code === "upper_floors_untouched_for_ground_floor_cladding")
  ) {
    missingBusinessRules.push("ground-floor cladding must explicitly preserve upper floors");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
