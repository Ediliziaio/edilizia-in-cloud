export type RoomPhotoOrientation = "landscape" | "portrait" | "square";

export interface RoomPhotoMeta {
  width?: number | null;
  height?: number | null;
  orientation?: RoomPhotoOrientation | null;
}

export interface RoomSceneAnalysis {
  roomType: string;
  perceivedLayout: string;
  cameraPerspective: string;
  lighting: string;
  visibleSurfaces: string[];
  fixedArchitecture: string[];
  movableObjects: string[];
  windowsAndDoors: string;
  kitchenElements: string[];
  floorDescription: string;
  wallDescription: string;
  ceilingDescription: string;
  constraints: string[];
}

export interface RoomIntervention {
  key: string;
  label: string;
  specification: string;
  replacementRules: string[];
  preservationRules: string[];
}

export interface RoomReplacementManifest {
  interventionType: string;
  activeInterventions: RoomIntervention[];
  removals: string[];
  additions: string[];
  strictPreservation: string[];
  geometryRules: string[];
  floorPromptExcerpt?: string;
}

export interface RoomRenderConfig {
  legacy_config: Record<string, unknown>;
  scene_analysis: RoomSceneAnalysis;
  replacement_manifest: RoomReplacementManifest;
  integrity_constraints: string[];
  negative_constraints: string[];
  quality_directives: string[];
  photo_meta?: RoomPhotoMeta | null;
}

export interface RoomPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface RoomPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  normalizedConfig: RoomRenderConfig;
  validation: RoomPromptValidationResult;
}
