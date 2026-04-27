import type { InteriorDoorPromptValidationResult, InteriorDoorRenderConfig } from "./types.ts";

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

export function validateInteriorDoorPromptConfig(config: InteriorDoorRenderConfig): InteriorDoorPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const warnings = [...config.compatibility_envelope.warnings];
  const allText = JSON.stringify(config).toLowerCase();
  const legacy = config.legacy_config;
  const manifest = config.replacement_manifest;
  const recolorOnly = legacy.interventi.length === 1 && legacy.interventi[0] === "recolor_or_restyle_only";
  const structuralChange = !recolorOnly;
  const wallSliding = structuralChange && (legacy.door_type === "scorrevole_esterno_muro" || legacy.interventi.includes("convert_to_wall_sliding"));
  const pocketSliding = structuralChange && (legacy.door_type === "scorrevole_interno_muro" || legacy.interventi.includes("convert_to_pocket_sliding"));
  const rasomuro = structuralChange && (legacy.door_type === "rasomuro" || legacy.frame.tipo === "rasomuro" || legacy.interventi.includes("convert_to_flush_door"));
  const fullHeight = structuralChange && (legacy.door_type === "tutta_altezza" || legacy.height === "tutta_altezza");
  const doubleLeaf = structuralChange && (legacy.door_type === "doppia_anta" || legacy.leaf_config.startsWith("doppia"));

  if (!config.scene_analysis.roomType) missingSections.push("scene_analysis.roomType");
  if (!config.target_opening_map.targetDoorway) missingSections.push("target_opening_map");
  if (!config.compatibility_envelope.plausibleOpeningProportions) missingSections.push("compatibility_envelope");
  if (!config.technical_specification.doorTypology) missingSections.push("technical_specification");
  if (!manifest.additions.length && !manifest.removals.length && !manifest.replacements.length && !manifest.recolors.length && !manifest.conversionRules.length) {
    missingSections.push("replacement_manifest");
  }

  if (recolorOnly) {
    if (manifest.replacements.length > 0 || manifest.removals.length > 0 || manifest.additions.some((item) => /rail|glass|sliding|flush/i.test(item))) {
      missingBusinessRules.push("recolor_only must not include geometry/mechanism replacement");
    }
    if (!includesAny(allText, ["finish-only mode", "preserve exact doorway geometry", "do not change from hinged to sliding"])) {
      missingBusinessRules.push("recolor_only must explicitly preserve geometry and mechanism");
    }
  }

  if (wallSliding && !includesAny(allText, ["wall sliding feasibility mandatory", "free wall area", "no collision"])) {
    missingBusinessRules.push("scorrevole_esterno_muro requires free wall area and collision rules");
  }
  if (wallSliding && !["sufficiente", "ampio"].includes(legacy.apertura.spazio_scorrimento_parete)) {
    missingBusinessRules.push("scorrevole_esterno_muro is not buildable without sufficient free wall travel area");
  }
  if (pocketSliding && !includesAny(allText, ["no visible external rail", "pocket sliding", "no old swing traces"])) {
    missingBusinessRules.push("scorrevole_interno_muro requires pocket logic and no external rail");
  }
  if (rasomuro && !includesAny(allText, ["flush-wall", "minimal or no casing", "wall-plane integration"])) {
    missingBusinessRules.push("rasomuro requires minimal casing / flush-wall logic");
  }
  if (fullHeight && !includesAny(allText, ["full-height ceiling relation", "without stretching the room", "ceiling"])) {
    missingBusinessRules.push("tutta altezza requires ceiling relation plausibility");
  }
  if (doubleLeaf && !includesAny(allText, ["double-leaf width plausibility", "central split", "leaf widths"])) {
    missingBusinessRules.push("doppia anta requires width plausibility and coherent split");
  }
  if (doubleLeaf && !["ampia", "molto_ampia"].includes(legacy.apertura.larghezza_apparente)) {
    missingBusinessRules.push("doppia anta is not buildable in a narrow or standard-width doorway");
  }
  if (legacy.interventi.includes("replace_existing_door") && !includesAny(allText, ["remove the old interior door completely", "old swing", "ghost outlines"])) {
    missingBusinessRules.push("replace_existing_door requires old-door removal rules");
  }
  if (
    legacy.interventi.includes("replace_existing_door")
    && legacy.interventi.includes("recolor_or_restyle_only")
    && !includesAny(allText, ["multi-intervention rule", "absorbed into the replacement"])
  ) {
    warnings.push("replace_existing_door + recolor_or_restyle_only are redundant: merged into a single replacement using the selected finish/color.");
  }
  if (!includesAny(allText, ["frame", "casing", "skirting", "threshold"])) {
    missingBusinessRules.push("frame/casing/skirting/threshold rules must be present");
  }
  if (!includesAny(allText, ["hinged", "sliding", "folding", "mechanism"])) {
    missingBusinessRules.push("opening-mechanism rules must be present");
  }
  if (!includesAny(allText, ["do not redesign the room", "same room", "preserve"])) {
    missingBusinessRules.push("property/room integrity constraints must be present");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
    warnings,
  };
}
