import type { SecurityDoorPromptValidationResult, SecurityDoorRenderConfig } from "./types.ts";

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

export function validateSecurityDoorPromptConfig(config: SecurityDoorRenderConfig): SecurityDoorPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const warnings = [...config.buildability_envelope.warnings];
  const allText = JSON.stringify(config).toLowerCase();
  const legacy = config.legacy_config;
  const manifest = config.replacement_manifest;
  const recolorOnly = legacy.interventi.length === 1 && legacy.interventi[0] === "recolor_or_restyle_only";
  const structuralChange = !recolorOnly;
  const rasomuro = structuralChange && (legacy.door_type === "rasomuro" || legacy.frame.tipo === "rasomuro" || legacy.interventi.includes("convert_to_flush_or_minimal"));
  const addSidelight = structuralChange && (legacy.interventi.includes("add_sidelight") || legacy.vetri.fiancoluce || legacy.leaf_type === "anta_singola_con_fianco");
  const addTransom = structuralChange && (legacy.interventi.includes("add_transom") || legacy.vetri.sopraluce || legacy.leaf_type === "anta_singola_con_sopraluce");
  const doubleLeaf = structuralChange && (legacy.door_type === "doppia_anta" || legacy.leaf_type.startsWith("doppia_anta"));

  if (!config.scene_analysis.environmentType) missingSections.push("scene_analysis.environmentType");
  if (!config.target_opening_map.targetOpening) missingSections.push("target_opening_map");
  if (!config.buildability_envelope.plausibleDoorProportions) missingSections.push("buildability_envelope");
  if (!config.technical_specification.doorTypology) missingSections.push("technical_specification");
  if (!manifest.additions.length && !manifest.removals.length && !manifest.replacements.length && !manifest.recolors.length && !manifest.conversionRules.length) {
    missingSections.push("replacement_manifest");
  }

  if (recolorOnly) {
    if (manifest.replacements.length > 0 || manifest.removals.length > 0 || manifest.additions.some((item) => /sidelight|transom|double/i.test(item))) {
      missingBusinessRules.push("recolor_only must not include geometry or system replacement");
    }
    if (!includesAny(allText, ["preserve exact opening geometry", "finish-only mode", "do not replace the door type"])) {
      missingBusinessRules.push("recolor_only must explicitly preserve geometry");
    }
  }

  if (rasomuro && !includesAny(allText, ["minimal casing", "flush-wall", "no old trim remnants"])) {
    missingBusinessRules.push("rasomuro requires minimal casing and no old trim remnants");
  }
  if (addSidelight && !includesAny(allText, ["sidelight width plausibility", "proportional integrated sidelight", "without warping the doorway"])) {
    missingBusinessRules.push("add_sidelight requires width plausibility and clean integration");
  }
  if (addSidelight && legacy.apertura.larghezza_apparente === "stretta") {
    missingBusinessRules.push("add_sidelight is not buildable on a narrow apparent opening without a dedicated wider target opening");
  }
  if (addTransom && !includesAny(allText, ["transom height plausibility", "proportional integrated transom"])) {
    missingBusinessRules.push("add_transom requires height plausibility");
  }
  if (addTransom && legacy.apertura.altezza_apparente === "bassa") {
    missingBusinessRules.push("add_transom is not buildable on a low apparent opening");
  }
  if (doubleLeaf && !includesAny(allText, ["double-leaf width plausibility", "vertical leaf split", "active/passive"])) {
    missingBusinessRules.push("double_leaf requires width plausibility and coherent leaf split");
  }
  if (doubleLeaf && !["ampia", "molto_ampia"].includes(legacy.apertura.larghezza_apparente)) {
    missingBusinessRules.push("double_leaf requires wide apparent opening");
  }
  if (legacy.interventi.includes("replace_existing_door") && !includesAny(allText, ["remove the old door leaf completely", "no ghost outlines", "old door"])) {
    missingBusinessRules.push("replace_existing_door requires old-door removal rules");
  }
  if (!includesAny(allText, [`visible side is ${legacy.visible_side}`.toLowerCase(), "visible side is interior", "visible side is exterior"])) {
    missingBusinessRules.push("visible side must match selected internal/external finish");
  }
  if (!includesAny(allText, ["frame", "casing", "threshold"])) {
    missingBusinessRules.push("frame/casing/threshold rules must be present");
  }
  if (!includesAny(allText, ["handle", "hardware", "defender", "peephole"])) {
    missingBusinessRules.push("hardware rules must be present");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
    warnings,
  };
}
