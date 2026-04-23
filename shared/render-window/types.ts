import type {
  WizardCassMat,
  WizardHw,
  WizardProfilo,
  WizardTapp,
  WizardTipo,
} from "./catalog.ts";

export type WindowOpeningType =
  | "battente_1_anta"
  | "battente_2_ante"
  | "battente_3_ante"
  | "scorrevole"
  | "scorrevole_alzante"
  | "vasistas"
  | "anta_ribalta"
  | "bilico"
  | "fisso"
  | "portafinestra";

export type WindowMaterial =
  | "pvc"
  | "alluminio"
  | "legno"
  | "legno_alluminio"
  | "acciaio_corten"
  | "acciaio_minimale"
  | "unknown";

export type SceneEnvironmentType =
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "staircase"
  | "office"
  | "facade"
  | "balcony"
  | "interior_generic"
  | "exterior_generic"
  | "mixed"
  | "unknown";

export type WindowOpeningPosition =
  | "far_left"
  | "left"
  | "center"
  | "right"
  | "far_right"
  | "full_width"
  | "unknown";

export type WindowViewMode = "interior" | "exterior" | "mixed" | "unknown";
export type WindowImageOrientation = "portrait" | "landscape" | "square" | "unknown";
export type WindowRollerControlType = "manual_belt" | "motorized" | "chain" | "crank" | "none" | "unknown";
export type WindowBeltPlacement =
  | "left_wall"
  | "right_wall"
  | "left_reveal"
  | "right_reveal"
  | "center"
  | "unknown";
export type WindowRollerCurtainState =
  | "fully_raised_hidden"
  | "top_recessed_band"
  | "partially_lowered"
  | "fully_lowered"
  | "not_visible"
  | "unknown";

export interface WindowPhotoMeta {
  width: number;
  height: number;
  orientation: WindowImageOrientation;
}

export interface WindowSceneOpening {
  id: string;
  label: string;
  order: number;
  position: WindowOpeningPosition;
  approximatePlacement: string;
  typeCurrent: WindowOpeningType;
  perceivedElement: "window" | "door_window" | "sliding_panel" | "fixed_light" | "unknown";
  sashCount: number;
  materialPerceived: WindowMaterial;
  colorPerceived: string;
  condition: "buone" | "usurato" | "danneggiato" | "fatiscente" | "unknown";
  hasCassonetto: boolean;
  cassonettoType: string | null;
  hasRollerShutter: boolean;
  hasBelt: boolean;
  hasBeltBox: boolean;
  beltPlacement: WindowBeltPlacement;
  beltPlacementNotes: string;
  rollerControlType: WindowRollerControlType;
  rollerCurtainState: WindowRollerCurtainState;
  rollerCurtainPositionNotes: string;
  hasPersiane: boolean;
  hasScuri: boolean;
  hasGrates: boolean;
  hasSill: boolean;
  hasCurtains: boolean;
  radiatorNearby: boolean;
  cassonettoGeometryNotes: string;
  surroundingElements: string[];
  lightNotes: string;
  reflectionNotes: string;
  shadowNotes: string;
  geometryNotes: string;
  outdoorViewNotes: string;
  preserveNotes: string;
}

export interface WindowSceneAnalysis {
  version: "2.0";
  environmentType: SceneEnvironmentType;
  viewMode: WindowViewMode;
  imageOrientation: WindowImageOrientation;
  estimatedOpeningsVisible: number;
  targetableOpenings: number;
  cameraAngle: string;
  lightingDirection: string;
  lightingQuality: string;
  environmentSummary: string;
  wallMaterial: string;
  wallColor: string;
  floorVisible: boolean;
  curtainsPresent: boolean;
  radiatorPresent: boolean;
  furnitureContext: string[];
  untouchedElements: string[];
  outdoorViewSummary: string;
  openings: WindowSceneOpening[];
  primaryTargetHint: string | null;
  noteAnalisi: string;
  legacy: {
    tipo_apertura: WindowOpeningType;
    materiale_attuale: WindowMaterial;
    colore_attuale: string;
    condizioni: string;
    stile_edificio: string;
    num_ante_attuale: number;
    presenza_cassonetto: boolean;
    presenza_davanzale: boolean;
    presenza_inferriata: boolean;
    larghezza_stimata_cm: number | null;
    altezza_stimata_cm: number | null;
    note_analisi: string;
    cinghia_attuale?: "con_cinghia" | "senza_cinghia" | "unknown";
  };
}

export interface WindowTargetSelection {
  mode: "single" | "multiple" | "all";
  selectedOpeningIds: string[];
  preservedOpeningIds: string[];
  primaryOpeningId: string | null;
  targetLabels: string[];
}

export interface WindowFrameFinish {
  mode: "ral" | "legno";
  name: string;
  ral: string | null;
  hex: string | null;
  finish: string;
  woodEffectId: string | null;
  promptFragment: string | null;
}

export interface WindowTechnicalSpecification {
  openingId: string;
  openingLabel: string;
  desiredTypeId: WizardTipo;
  desiredOpeningType: WindowOpeningType;
  desiredSashCount: number;
  desiredElement: "window" | "door_window" | "sliding_panel";
  material: Exclude<WindowMaterial, "unknown">;
  profileId: WizardProfilo;
  frameStyle: string;
  frameDepthLabel: string;
  frameShape: string;
  slimnessLabel: string;
  finish: WindowFrameFinish;
  handleStyle: string;
  handleColorId: WizardHw;
  handleFinish: string;
  hingeFinish: string;
  hingeStyle: string;
  hingeConsistencyRule: string;
  manualControlCleanupRule: string | null;
  reducedNode: boolean;
  centralHandle: boolean;
  hingeCountVisible: number;
  glassSpec: string;
  cassonetto: {
    replace: boolean;
    materialId: WizardCassMat | null;
    materialLabel: string;
    colorMode: "ral" | "legno" | null;
    colorLabel: string | null;
    dimensionRule: string;
  };
  shutter: {
    mode: WizardTapp;
    replace: boolean;
    colorMode: "ral" | "legno" | null;
    colorLabel: string | null;
    isMotorized: boolean;
    visibilityState: WindowRollerCurtainState | "match_existing";
    placementRule: string;
  };
  compatibilityNotes: string[];
}

export interface WindowRemovalRule {
  code: string;
  openingIds: string[];
  summary: string;
  repairInstruction?: string;
  preserveInstruction?: string;
}

export interface WindowReplacementManifestOpening {
  openingId: string;
  openingLabel: string;
  currentType: WindowOpeningType;
  targetType: WindowOpeningType;
  action: "replace";
  summary: string;
}

export interface WindowUntouchedOpening {
  openingId: string;
  openingLabel: string;
  currentType: WindowOpeningType;
  action: "preserve";
  summary: string;
}

export interface WindowReplacementManifest {
  targetOpenings: WindowReplacementManifestOpening[];
  untouchedOpenings: WindowUntouchedOpening[];
  additions: string[];
  removals: WindowRemovalRule[];
  keepExactly: string[];
  integrityConstraints: string[];
}

export interface WindowRenderConfig {
  schema_version: "window_render_v2";
  notes: string;
  apertura_default: WindowOpeningType;
  photo_meta: WindowPhotoMeta | null;
  scene_analysis: WindowSceneAnalysis;
  target_selection: WindowTargetSelection;
  technical_specification: WindowTechnicalSpecification[];
  replacement_manifest: WindowReplacementManifest;
  removal_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  nuovo_infisso: Record<string, unknown>;
}

export interface WindowPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: WindowPromptValidationResult;
  normalizedConfig: WindowRenderConfig;
}

export interface WindowPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}
