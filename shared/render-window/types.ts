// shared/render-window/types.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   + WindowHingeMode (visible | hidden | none)
//   + WindowTransomMode (auto | keep | remove | add)
//   + WindowSceneOpening.hasHorizontalTransom + transomPositionPct + transomPanelBelowType
//   + WindowTechnicalSpecification.hingeMode + hingesPerSash + hingePlacementRule
//   + WindowTechnicalSpecification.transomRule
//   + WindowTechnicalSpecification.compositionChange
//   + WindowTechnicalSpecification.profileVisibleThickness + thermalBreakVisible
//   + WindowTechnicalSpecification.shutter.electricButton

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

/** v8 — Modalità cerniere richiesta dall'utente */
export type WindowHingeMode = "visible" | "hidden" | "none";

/** v8 — Modalità traverso richiesta dall'utente */
export type WindowTransomMode = "auto" | "keep" | "remove" | "add";

/** v8 — Panel sotto traverso (rilevato dalla scena) */
export type WindowTransomPanelBelow = "glass" | "solid_panel" | "louvered" | "unknown";

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

  // ── v8 ─────────────────────────────────────────────────────────────────
  /** Se la portafinestra mostra un montante orizzontale a metà altezza. */
  hasHorizontalTransom?: boolean;
  /** Altezza del traverso in % della finestra (0=basso, 100=top). 50 = mezzo. */
  transomPositionPct?: number | null;
  /** Cosa c'è sotto il traverso (pannello cieco, vetro, etc.). */
  transomPanelBelowType?: WindowTransomPanelBelow;
  /** Altezza stimata in centimetri (per decidere se servono 2 o 3 cerniere). */
  estimatedHeightCm?: number | null;
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
    cinghia_attuale: "con_cinghia" | "senza_cinghia" | "unknown";
  };
}

export interface WindowTargetSelection {
  mode: "all" | "single" | "multiple";
  selectedOpeningIds: string[];
  preservedOpeningIds: string[];
  primaryOpeningId: string | null;
  targetLabels: string[];
}

export interface WindowTechnicalSpecification {
  openingId: string;
  openingLabel: string;
  desiredTypeId: WizardTipo;
  desiredOpeningType: WindowOpeningType;
  desiredSashCount: number;
  desiredElement: "window" | "door_window" | "sliding_panel" | "fixed_light";
  material: Exclude<WindowMaterial, "unknown">;
  profileId: WizardProfilo;
  frameStyle: string;
  frameDepthLabel: string;
  frameShape: string;
  slimnessLabel: string;

  // ── v8 ─────────────────────────────────────────────────────────────────
  /** Spessore visibile del profilo (es. "45-55mm outer, 50mm central mullion"). */
  profileVisibleThickness: string;
  /** Thermal break visibile come stripe scura (true per alluminio premium). */
  thermalBreakVisible: boolean;
  /** Cambio architettura (composizione ante) richiesto dall'utente. */
  compositionChange: null | {
    fromSashCount: number;
    toSashCount: number;
    instruction: string;
  };
  /** Regola traverso per portafinestre. null se non applicabile. */
  transomRule: string | null;
  /** Modalità cerniere richiesta. */
  hingeMode: WindowHingeMode;
  /** Numero cerniere per anta. 0 quando hingeMode != "visible". */
  hingesPerSash: 0 | 2 | 3;

  finish: {
    mode: "ral" | "legno";
    name: string;
    ral: string | null;
    hex: string | null;
    finish: string;
    woodEffectId: string | null;
    promptFragment: string | null;
  };

  handleStyle: string;
  handleColorId: WizardHw;
  handleFinish: string;
  /** v8.2 — Numero totale di maniglie visibili nella composizione.
   *  Regola universale italiana:
   *    F2A/PF2A = 1 (mai 2)
   *    F3A/PF3A = 2 (gruppo 2+1)
   *    F1A/PF1A = 1
   *    fisso = 0
   *    scorrevole = 1 per gruppo mobile */
  handleCountVisible: number;
  /** v8.2 — Regola posizionamento maniglie esplicita per il prompt builder. */
  handlePlacementRule: string;

  hingeFinish: string;
  hingeStyle: string;
  hingeConsistencyRule: string;
  /** v8 — Regola posizionamento cerniere (numero + posizione precise). */
  hingePlacementRule: string;

  manualControlCleanupRule: string | null;
  reducedNode: boolean;
  centralHandle: boolean;
  /** @deprecated v8 — usa hingePlacementRule per la regola visiva.
   *  Lasciato per backward-compat. Calcolato come hingesPerSash * desiredSashCount. */
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
    visibilityState:
      | "match_existing"
      | "fully_raised_hidden"
      | "top_recessed_band"
      | "partially_lowered"
      | "fully_lowered";
    placementRule: string;

    /** v8 — Bottone elettrico tapparella. */
    electricButton?: {
      install: boolean;
      side: "left" | "right" | "same_as_old_belt";
      heightFromFloor: string;
      style: "bianco_standard" | "nero_opaco" | "match_room_switches";
      description: string;
    };
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

export interface WindowReplacementManifest {
  targetOpenings: Array<{
    openingId: string;
    openingLabel: string;
    currentType: WindowOpeningType;
    targetType: WindowOpeningType;
    action: "replace" | "preserve";
    summary: string;
  }>;
  untouchedOpenings: Array<{
    openingId: string;
    openingLabel: string;
    currentType: WindowOpeningType;
    action: "preserve";
    summary: string;
  }>;
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

export interface WindowPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface WindowPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: WindowPromptValidationResult;
  normalizedConfig: WindowRenderConfig;
  /** v8.3.3 — Lista delle foto reference da passare INSIEME alla sorgente.
   *  L'edge function fetcha ciascun URL e lo invia come immagine inline al
   *  modello image-edit (Gemini multi-image / OpenRouter multi-content). */
  referenceImages: Array<{
    kind: string;
    label: string;
    filename: string;
    url: string;
  }>;
}
