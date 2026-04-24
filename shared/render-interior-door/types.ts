export type InteriorDoorType =
  | "battente_liscia"
  | "battente_classica"
  | "scorrevole_interno_muro"
  | "scorrevole_esterno_muro"
  | "a_libro"
  | "rasomuro"
  | "tutta_altezza"
  | "vetrata"
  | "doppia_anta";

export type InteriorDoorLeafConfig =
  | "singola"
  | "doppia_simmetrica"
  | "doppia_asimmetrica"
  | "libro_doppia"
  | "scorrevole_singola"
  | "scorrevole_doppia";

export type InteriorDoorFinish =
  | "laccato_bianco"
  | "laccato_colorato"
  | "effetto_legno_chiaro"
  | "effetto_legno_scuro"
  | "laminato"
  | "materico"
  | "vetro_trasparente"
  | "vetro_satinato"
  | "vetro_fume";

export type InteriorDoorFrameType =
  | "standard"
  | "minimale"
  | "rasomuro"
  | "complanare"
  | "coprifilo_classico";

export type InteriorDoorHardwareType =
  | "maniglia_moderna"
  | "maniglia_classica"
  | "pomolo"
  | "serratura_privacy"
  | "binario_visibile"
  | "cerniere_scomparse"
  | "cerniere_visibili";

export type InteriorDoorContext =
  | "soggiorno"
  | "corridoio"
  | "camera"
  | "bagno"
  | "cucina"
  | "disimpegno"
  | "open_space";

export type InteriorDoorInterventionType =
  | "replace_existing_door"
  | "recolor_or_restyle_only"
  | "convert_to_pocket_sliding"
  | "convert_to_wall_sliding"
  | "convert_to_flush_door"
  | "add_glazing"
  | "change_frame_only"
  | "change_hardware_only";

export type InteriorDoorImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface InteriorDoorPhotoMeta {
  width?: number;
  height?: number;
  orientation?: InteriorDoorImageOrientation;
}

export interface InteriorDoorOpeningConfig {
  vano_target: "porta_principale" | "porta_sinistra" | "porta_destra" | "porta_centrale" | "passaggio_specifico";
  larghezza_apparente: "stretta" | "standard" | "ampia" | "molto_ampia";
  altezza_apparente: "standard" | "alta" | "tutta_altezza";
  rapporto_con_parete: string;
  rapporto_con_zoccolino: string;
  rapporto_con_soffitto: string;
  spazio_scorrimento_parete: "assente" | "ridotto" | "sufficiente" | "ampio";
  interferenze_note?: string[];
}

export interface ConfigurazionePortaInterna {
  interventi: InteriorDoorInterventionType[];
  door_type: InteriorDoorType;
  leaf_config: InteriorDoorLeafConfig;
  context: InteriorDoorContext;
  stile: "moderno" | "classico" | "minimal" | "contemporaneo" | "neutro";
  finish: InteriorDoorFinish;
  colore: string;
  frame: {
    tipo: InteriorDoorFrameType;
    colore?: string;
    coprifilo?: "assente" | "minimale" | "standard" | "classico";
  };
  glass: {
    enabled: boolean;
    type?: "trasparente" | "satinato" | "fume" | "inglesine" | "parziale";
    privacy_level?: "basso" | "medio" | "alto";
  };
  hardware: {
    elementi: InteriorDoorHardwareType[];
    finitura: "cromo" | "nero_opaco" | "ottone" | "bronzo" | "acciaio" | "bianco";
  };
  height: "standard" | "tutta_altezza";
  opening_direction?: "verso_sinistra" | "verso_destra" | "non_visibile" | "scorrevole_sx" | "scorrevole_dx";
  apertura: InteriorDoorOpeningConfig;
  elementi_da_preservare?: string[];
  elementi_da_rimuovere?: string[];
  note_libere?: string;
}

export interface InteriorDoorSceneAnalysis {
  version: "1.0";
  roomType: InteriorDoorContext;
  doorwayPosition: string;
  existingDoorPresence: string;
  existingDoorType: string;
  wallMaterialAndColor: string;
  floorMaterial: string;
  skirtingBaseboard: string;
  ceilingRelation: string;
  nearbyFurniture: string[];
  nearbyFixtures: string[];
  lightingAndShadows: string;
  apparentOpeningWidth: string;
  apparentOpeningHeight: string;
  wallSlidingAvailableArea: string;
  adjacentRoomVisibility: string;
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: InteriorDoorImageOrientation;
}

export interface InteriorDoorTargetOpeningMap {
  targetDoorway: string;
  openingLimits: string[];
  leafArea: string;
  frameCasingArea: string;
  thresholdPassageArea: string;
  wallSlidingArea: string;
  hardwareArea: string[];
  adjacentWallPreserveZones: string[];
  adjacentFloorPreserveZones: string[];
  nonModifiableElements: string[];
}

export interface InteriorDoorCompatibilityEnvelope {
  plausibleOpeningProportions: string;
  swingCompatibility: string;
  pocketSlidingCompatibility: string;
  wallSlidingFeasibility: string;
  doubleLeafWidthPlausibility: string;
  fullHeightCeilingRelation: string;
  glassContextCompatibility: string;
  flushWallCompatibility: string;
  hardwareScaleLogic: string;
  forbiddenConditions: string[];
  warnings: string[];
}

export interface InteriorDoorTechnicalSpecification {
  doorTypology: string;
  leafConfiguration: string;
  finishSpecification: string;
  frameSpecification: string;
  glassSpecification: string;
  hardwareSpecification: string;
  heightSpecification: string;
  mechanismSpecification: string;
  premiumRealismCues: string[];
}

export interface InteriorDoorReplacementManifest {
  interventions: InteriorDoorInterventionType[];
  additions: string[];
  removals: string[];
  replacements: string[];
  recolors: string[];
  preserveExactly: string[];
  preserveGeometry: string[];
  preserveContext: string[];
  conversionRules: string[];
  compatibilityAdjustments: string[];
}

export interface InteriorDoorRenderConfig {
  legacy_config: ConfigurazionePortaInterna;
  photo_meta: InteriorDoorPhotoMeta | null;
  scene_analysis: InteriorDoorSceneAnalysis;
  target_opening_map: InteriorDoorTargetOpeningMap;
  compatibility_envelope: InteriorDoorCompatibilityEnvelope;
  technical_specification: InteriorDoorTechnicalSpecification;
  replacement_manifest: InteriorDoorReplacementManifest;
  realism_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface InteriorDoorPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
  warnings: string[];
}

export interface InteriorDoorPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: InteriorDoorPromptValidationResult;
  normalizedConfig: InteriorDoorRenderConfig;
}
