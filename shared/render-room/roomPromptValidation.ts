import type { RoomPromptValidationResult, RoomRenderConfig } from "./types.ts";

export function validateRoomPromptConfig(config: RoomRenderConfig): RoomPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.scene_analysis.roomType) missingSections.push("scene_analysis.roomType");
  if (!config.scene_analysis.cameraPerspective) missingSections.push("scene_analysis.cameraPerspective");
  if (config.scene_analysis.functionalAnchors.length === 0) missingSections.push("scene_analysis.functionalAnchors");
  if (!config.replacement_manifest.interventionType) missingSections.push("replacement_manifest.interventionType");
  if (config.replacement_manifest.activeInterventions.length === 0) missingSections.push("replacement_manifest.activeInterventions");
  if (config.replacement_manifest.strictPreservation.length === 0) missingSections.push("replacement_manifest.strictPreservation");
  if (config.negative_constraints.length === 0) missingSections.push("negative_constraints");

  const manifestText = JSON.stringify(config.replacement_manifest).toLowerCase();
  if (!manifestText.includes("same") && !manifestText.includes("preserve")) {
    missingBusinessRules.push("room prompt must explicitly preserve original room identity");
  }

  const floorActive = config.replacement_manifest.activeInterventions.some((item) => item.key === "floor");
  if (floorActive) {
    if (!config.replacement_manifest.floorPromptExcerpt?.toLowerCase().includes("pattern")) {
      missingBusinessRules.push("active floor replacement must include pattern geometry rules");
    }
    if (!config.replacement_manifest.floorPromptExcerpt?.toLowerCase().includes("joint")) {
      missingBusinessRules.push("active floor replacement must include joints/grout rules");
    }
  }

  const kitchenActive = config.replacement_manifest.activeInterventions.some((item) => item.key === "kitchen_restyling");
  if (kitchenActive && !manifestText.includes("cabinet layout")) {
    missingBusinessRules.push("kitchen restyling must preserve cabinet layout and technical positions");
  }

  const lightingActive = config.replacement_manifest.activeInterventions.some((item) => item.key === "lighting");
  if (lightingActive && !manifestText.includes("do not invent a decorative chandelier")) {
    missingBusinessRules.push("lighting changes must not invent unrelated fixture types");
  }

  const furnitureOnlyColor = manifestText.includes("refinish existing furniture color/material appearance only");
  if (furnitureOnlyColor && !manifestText.includes("do not change furniture geometry")) {
    missingBusinessRules.push("furniture color-only mode must preserve geometry and position");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
