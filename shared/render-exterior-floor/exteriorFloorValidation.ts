import type { ExteriorFloorPromptValidationResult, ExteriorFloorRenderConfig } from "./types.ts";

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function validateExteriorFloorPromptConfig(config: ExteriorFloorRenderConfig): ExteriorFloorPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const spec = config.technical_specification;
  const manifestText = [
    ...config.replacement_manifest.additions,
    ...config.replacement_manifest.removals,
    ...config.replacement_manifest.replacements,
    ...config.replacement_manifest.recolors,
    ...config.replacement_manifest.conversions,
  ].join(" ").toLowerCase();

  if (!hasText(config.target_surface_map.targetDescription)) missingSections.push("target surface map");
  if (!hasText(config.buildability_envelope.drainageLogic)) missingSections.push("buildability + drainage envelope");
  if (!config.replacement_manifest.preserveExactly.length) missingSections.push("replacement manifest");
  if (!hasText(spec.materialDescription)) missingSections.push("exterior floor specification");
  if (!hasText(spec.jointDescription)) missingSections.push("joints rules");
  if (!hasText(spec.borderDescription)) missingSections.push("edge / border / coping rules");
  if (!hasText(spec.stepDescription)) missingSections.push("steps / threshold rules");
  if (!config.integrity_constraints.length) missingSections.push("property integrity constraints");

  if (spec.isDeck && !/board|open gap|deck/i.test(`${spec.patternDescription} ${spec.jointDescription} ${manifestText}`)) {
    missingBusinessRules.push("deck requires board-direction and open-gap rules");
  }
  if (config.legacy_config.operazione === "change_coping_only" && !/preserve.*basin|basin geometry|waterline/i.test(manifestText)) {
    missingBusinessRules.push("coping-only requires basin geometry preservation");
  }
  if (config.legacy_config.operazione === "recolor_or_refinish_only" && !/preserve exact pattern|no replacement of pattern|preserve.*geometry/i.test(manifestText)) {
    missingBusinessRules.push("recolor-only requires geometry/pattern preservation");
  }
  if (spec.isVehicular && !/vehicular|driveway|robust/i.test(`${spec.usageDescription} ${manifestText}`)) {
    missingBusinessRules.push("vehicular use requires robust driveway-capable rules");
  }
  if (spec.isPoolside && !/coping|poolside|pool basin|waterline/i.test(`${spec.borderDescription} ${manifestText}`)) {
    missingBusinessRules.push("poolside requires coping/drainage rules");
  }
  if (config.legacy_config.operazione === "replace_existing_surface" && !/old.*grid|old.*grout|old.*surface|previous paving/i.test(manifestText)) {
    missingBusinessRules.push("replacing existing paving requires old joint/pattern removal rules");
  }
  if ((config.legacy_config.gradino !== "nessuno" || config.legacy_config.operazione === "change_steps_only") && !/tread|riser|pedata|alzata|step/i.test(`${spec.stepDescription} ${manifestText}`)) {
    missingBusinessRules.push("targeted steps require tread/riser logic");
  }
  if (spec.isLargeFormat && !/sparse joint|few.*module|large-format|broad uninterrupted/i.test(`${spec.formatDescription} ${manifestText}`)) {
    missingBusinessRules.push("large-format slabs require sparse joint density rules");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
