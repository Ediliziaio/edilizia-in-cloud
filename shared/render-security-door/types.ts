export type SecurityDoorType =
  | "appartamento_moderna"
  | "appartamento_classica"
  | "villa_moderna"
  | "villa_classica"
  | "rasomuro"
  | "con_fiancoluce"
  | "con_sopraluce"
  | "doppia_anta";

export type SecurityDoorLeafType =
  | "anta_singola"
  | "anta_singola_con_fianco"
  | "anta_singola_con_sopraluce"
  | "doppia_anta_simmetrica"
  | "doppia_anta_asimmetrica";

export type SecurityDoorFinish =
  | "liscio_opaco"
  | "effetto_legno"
  | "pantografato"
  | "laccato"
  | "effetto_metallico"
  | "microtexture";

export type SecurityDoorFrameType =
  | "standard"
  | "complanare"
  | "rasomuro"
  | "cornice_classica"
  | "minimale";

export type SecurityDoorHardwareType =
  | "maniglia_moderna"
  | "maniglia_classica"
  | "pomolo_esterno_maniglia_interna"
  | "barra_verticale"
  | "defender_visibile"
  | "spioncino_standard"
  | "spioncino_digitale";

export type SecurityDoorSideContext =
  | "lato_interno"
  | "lato_esterno"
  | "pianerottolo"
  | "ingresso_villa"
  | "corridoio_interno";

export type SecurityDoorInterventionType =
  | "replace_existing_door"
  | "recolor_or_restyle_only"
  | "add_sidelight"
  | "add_transom"
  | "change_frame_only"
  | "convert_to_flush_or_minimal"
  | "replace_threshold"
  | "add_security_hardware";

export type SecurityDoorImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface SecurityDoorPhotoMeta {
  width?: number;
  height?: number;
  orientation?: SecurityDoorImageOrientation;
}

export interface SecurityDoorOpeningConfig {
  vano_target: "porta_principale" | "porta_sinistra" | "porta_destra" | "porta_centrale" | "vano_specifico";
  larghezza_apparente: "stretta" | "standard" | "ampia" | "molto_ampia";
  altezza_apparente: "bassa" | "standard" | "alta";
  profondita_spallette: "ridotta" | "media" | "profonda";
  presenza_fiancoluce: boolean;
  presenza_sopraluce: boolean;
  rapporto_con_parete: string;
  rapporto_con_pavimento: string;
  interferenze_note?: string[];
}

export interface ConfigurazionePortaBlindata {
  interventi: SecurityDoorInterventionType[];
  door_type: SecurityDoorType;
  leaf_type: SecurityDoorLeafType;
  side_context: SecurityDoorSideContext;
  visible_side: "interno" | "esterno";
  stile: "moderno" | "classico" | "minimal" | "contemporaneo";
  finitura_lato_visibile: SecurityDoorFinish;
  finitura_interna: SecurityDoorFinish;
  finitura_esterna: SecurityDoorFinish;
  colore_lato_visibile: string;
  colore_interno?: string;
  colore_esterno?: string;
  frame: {
    tipo: SecurityDoorFrameType;
    colore?: string;
    coprifilo?: "assente" | "minimale" | "standard" | "classico";
  };
  hardware: {
    elementi: SecurityDoorHardwareType[];
    finitura: "cromo" | "nero_opaco" | "ottone" | "bronzo" | "acciaio" | "antracite";
    posizione?: "standard" | "centrata" | "verticale_lunga";
  };
  vetri: {
    fiancoluce: boolean;
    sopraluce: boolean;
    finitura_vetro?: "trasparente" | "satinato" | "fumé" | "bronzo";
  };
  soglia: {
    attiva: boolean;
    materiale: "alluminio" | "acciaio" | "pietra" | "marmo" | "legno_coordinato";
    finitura?: string;
  };
  apertura: SecurityDoorOpeningConfig;
  elementi_da_preservare?: string[];
  elementi_da_rimuovere?: string[];
  note_libere?: string;
}

export interface SecurityDoorSceneAnalysis {
  version: "1.0";
  environmentType: string;
  visibleSide: SecurityDoorSideContext;
  entranceContext: string;
  existingDoorPresence: string;
  existingDoorStyle: string;
  existingFrameAndCasing: string;
  surroundingWalls: string;
  floorAndThreshold: string;
  skirtingOrBaseboards: string;
  apparentOpeningWidth: string;
  apparentOpeningHeight: string;
  revealDepth: string;
  adjacentFixtures: string[];
  lightingAndShadows: string;
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: SecurityDoorImageOrientation;
}

export interface SecurityDoorTargetOpeningMap {
  targetOpening: string;
  openingPerimeter: string;
  leafArea: string;
  frameArea: string;
  casingArea: string;
  sidelightArea: string;
  transomArea: string;
  thresholdZone: string;
  hardwareZones: string[];
  preservedAdjacentWallZones: string[];
  preservedFloorZones: string[];
  interventionLimits: string[];
}

export interface SecurityDoorBuildabilityEnvelope {
  plausibleDoorProportions: string;
  frameThicknessLogic: string;
  casingCompatibility: string;
  sidelightWidthPlausibility: string;
  transomHeightPlausibility: string;
  doubleLeafWidthPlausibility: string;
  flushWallCompatibility: string;
  thresholdLogic: string;
  hardwareScaleLogic: string;
  forbiddenPlacements: string[];
  warnings: string[];
}

export interface SecurityDoorTechnicalSpecification {
  doorTypology: string;
  leafConfiguration: string;
  visibleSideFinish: string;
  internalExternalFinishLogic: string;
  frameSpecification: string;
  panelDetailing: string;
  hardwareSpecification: string;
  glassSpecification: string;
  thresholdSpecification: string;
  securityGradeVisualCues: string[];
}

export interface SecurityDoorReplacementManifest {
  interventions: SecurityDoorInterventionType[];
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

export interface SecurityDoorRenderConfig {
  legacy_config: ConfigurazionePortaBlindata;
  photo_meta: SecurityDoorPhotoMeta | null;
  scene_analysis: SecurityDoorSceneAnalysis;
  target_opening_map: SecurityDoorTargetOpeningMap;
  buildability_envelope: SecurityDoorBuildabilityEnvelope;
  technical_specification: SecurityDoorTechnicalSpecification;
  replacement_manifest: SecurityDoorReplacementManifest;
  realism_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface SecurityDoorPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
  warnings: string[];
}

export interface SecurityDoorPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: SecurityDoorPromptValidationResult;
  normalizedConfig: SecurityDoorRenderConfig;
}
