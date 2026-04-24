export type TipoInterventoFacciata =
  | "tinteggiatura"
  | "cappotto"
  | "rivestimento"
  | "misto"
  | "rifacimento_totale";

export type FinituraIntonaco =
  | "liscio"
  | "graffiato_fine"
  | "graffiato_medio"
  | "rasato"
  | "bucciato"
  | "strutturato_grosso"
  | "rustico"
  | "veneziana"
  | "bugnato";

export type ZonaApplicazioneIntonaco =
  | "tutta"
  | "piano_terra"
  | "piani_superiori"
  | "zoccolatura"
  | "fasce_orizzontali";

export type TipoRivestimento =
  | "pietra_serena"
  | "travertino"
  | "arenaria_beige"
  | "luserna"
  | "marmo_bianco"
  | "porfido"
  | "splitface_grigio"
  | "pietra_rustica"
  | "cotto_rosso"
  | "clinker_rosso"
  | "clinker_grigio"
  | "clinker_beige"
  | "cotto_mattone"
  | "laterizio_bianco";

export type ZonaApplicazioneRivestimento =
  | "tutta"
  | "piano_terra"
  | "piani_superiori"
  | "zoccolatura"
  | "cantonali"
  | "marcapiano";

export type PosaRivestimento =
  | "corsi_regolari"
  | "corsi_sfalsati"
  | "listelli_orizzontali"
  | "opus_incertum";

export type SistemaCappotto = "eps" | "lana_roccia" | "fibra_legno";
export type ZonaApplicazioneCappotto = "tutta" | "piano_terra" | "piani_superiori";

export interface ConfigIntonaco {
  attivo: boolean;
  colore_hex: string;
  colore_ral?: string;
  colore_nome?: string;
  finitura: FinituraIntonaco;
  zona: ZonaApplicazioneIntonaco;
}

export interface ConfigRivestimento {
  attivo: boolean;
  tipo: TipoRivestimento;
  zona: ZonaApplicazioneRivestimento;
  posa?: PosaRivestimento;
  fuga_colore?: string;
}

export interface ConfigCappotto {
  attivo: boolean;
  spessore_cm: 4 | 6 | 8 | 10 | 12 | 14;
  sistema: SistemaCappotto;
  colore_finitura_hex: string;
  zona?: ZonaApplicazioneCappotto;
}

export interface ConfigCorniciFinestre {
  azione: "mantieni" | "aggiungi" | "rimuovi";
  colore_hex?: string;
}

export interface ConfigMarcapiani {
  azione: "mantieni" | "aggiungi" | "rimuovi";
  colore_hex?: string;
  spessore?: string;
}

export interface ConfigDavanzali {
  azione: "mantieni" | "sostituisci";
  materiale?: "pietra" | "marmo" | "alluminio";
  colore_hex?: string;
}

export interface ConfigZoccolatura {
  azione: "mantieni" | "aggiungi" | "rimuovi";
  tipo?: "intonaco" | "pietra" | "ceramica";
  colore_hex?: string;
  altezza_cm?: number;
}

export interface ConfigGronde {
  azione: "mantieni" | "sostituisci";
  colore_hex?: string;
  materiale?: "rame" | "alluminio" | "pvc";
}

export interface ConfigBalconiRinghiere {
  azione: "mantieni" | "vernicia";
  colore_hex?: string;
}

export interface ConfigElementiArchitettonici {
  cornici_finestre: ConfigCorniciFinestre;
  marcapiani: ConfigMarcapiani;
  davanzali: ConfigDavanzali;
  zoccolatura: ConfigZoccolatura;
  gronde: ConfigGronde;
  balconi_ringhiere: ConfigBalconiRinghiere;
}

export interface ConfigurazioneFacciata {
  tipo_intervento: TipoInterventoFacciata;
  intonaco: ConfigIntonaco;
  rivestimento: ConfigRivestimento;
  cappotto: ConfigCappotto;
  elementi: ConfigElementiArchitettonici;
  note_libere?: string;
}

export type FacciataImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface FacciataPhotoMeta {
  width: number;
  height: number;
  orientation: FacciataImageOrientation;
}

export type FacciataZoneId =
  | "tutta"
  | "piano_terra"
  | "piani_superiori"
  | "zoccolatura"
  | "fasce_orizzontali"
  | "cantonali"
  | "marcapiano"
  | "cornici_finestre"
  | "davanzali"
  | "gronde"
  | "balconi_ringhiere";

export type FacciataOpeningPosition =
  | "far_left"
  | "left"
  | "center_left"
  | "center"
  | "center_right"
  | "right"
  | "far_right"
  | "upper_left"
  | "upper_center"
  | "upper_right"
  | "ground_left"
  | "ground_center"
  | "ground_right"
  | "unknown";

export type FacciataOpeningKind =
  | "window"
  | "door_window"
  | "balcony_door"
  | "entrance_door"
  | "garage_door"
  | "arched_window"
  | "unknown";

export interface FacciataSceneOpening {
  id: string;
  label: string;
  order: number;
  position: FacciataOpeningPosition;
  floorHint: string;
  openingKind: FacciataOpeningKind;
  apparentSize: string;
  specialShape: string | null;
  hasCornice: boolean;
  hasSill: boolean;
  sillMaterial: string;
  hasShutter: boolean;
  shutterType: string;
  hasBalcony: boolean;
  hasRailing: boolean;
  revealDepth: string;
  lightingNotes: string;
  shadowNotes: string;
  preserveNotes: string;
}

export interface FacciataSceneFeatures {
  corniciFinestre: boolean;
  marcapiani: boolean;
  davanzali: boolean;
  zoccolatura: boolean;
  gronde: boolean;
  pluviali: boolean;
  balconi: boolean;
  ringhiere: boolean;
  persiane: boolean;
  portone: boolean;
  garage: boolean;
  corpiIlluminanti: boolean;
  citofoniCassette: boolean;
  caviCanaline: boolean;
  climatizzatori: boolean;
}

export interface AnalisiFacciataLegacy {
  tipo_edificio: string;
  numero_piani: number;
  numero_finestre: number;
  intonaco_attuale: string;
  colore_attuale_hex: string;
  stato_conservazione: string;
  elementi_presenti: string[];
  note?: string;
}

export interface FacciataSceneAnalysis {
  version: "2.0";
  buildingType: string;
  buildingStyle: string;
  floorsCount: number;
  openingsVisible: number;
  cameraAngle: string;
  lightingCondition: string;
  wallTexture: string;
  currentPlasterFinish: string;
  currentFacadeColor: string;
  currentCondition: string;
  imageOrientation: FacciataImageOrientation;
  groundContext: string;
  preservedContext: string[];
  preserveRigidly: string[];
  openings: FacciataSceneOpening[];
  features: FacciataSceneFeatures;
  noteAnalisi: string;
  legacy: AnalisiFacciataLegacy;
}

export type AnalisiFacciata = FacciataSceneAnalysis;

export interface FacciataZoneDirective {
  zoneId: FacciataZoneId;
  label: string;
  system:
    | "intonaco"
    | "rivestimento"
    | "cappotto"
    | "cornici_finestre"
    | "marcapiani"
    | "davanzali"
    | "zoccolatura"
    | "gronde"
    | "balconi_ringhiere";
  action: "apply" | "add" | "remove" | "replace" | "repaint";
  summary: string;
}

export interface FacciataZoneTargeting {
  affectedZones: FacciataZoneDirective[];
  untouchedZones: { zoneId: FacciataZoneId; label: string; summary: string }[];
  activeSystems: string[];
  inactiveSystems: string[];
}

export interface FacciataPlasterSpec {
  active: boolean;
  zone: FacciataZoneId | null;
  colorLabel: string | null;
  colorHex: string | null;
  finishId: FinituraIntonaco | null;
  finishDescription: string | null;
  surfaceBehavior: string | null;
  textureVisibility: string | null;
}

export interface FacciataCladdingSpec {
  active: boolean;
  zone: FacciataZoneId | null;
  materialId: TipoRivestimento | null;
  materialDescription: string | null;
  coursingPattern: string | null;
  jointLogic: string | null;
  thicknessVisibility: string | null;
  transitionEdges: string | null;
}

export interface FacciataInsulationSpec {
  active: boolean;
  zone: FacciataZoneId | null;
  systemId: SistemaCappotto | null;
  systemDescription: string | null;
  thicknessCm: number | null;
  finishColorHex: string | null;
  newFacadePlaneRule: string | null;
  revealDepthRule: string | null;
  sillAdaptationRule: string | null;
  edgeProfileRule: string | null;
  flashingRule: string | null;
}

export interface FacciataElementSpec {
  action: "keep" | "add" | "remove" | "replace" | "repaint";
  colorHex: string | null;
  description: string;
  profileRule: string | null;
}

export interface FacciataTechnicalSpecification {
  plaster: FacciataPlasterSpec;
  cladding: FacciataCladdingSpec;
  insulation: FacciataInsulationSpec;
  elements: {
    windowCornices: FacciataElementSpec;
    stringCourses: FacciataElementSpec;
    sills: FacciataElementSpec;
    baseCourse: FacciataElementSpec;
    gutters: FacciataElementSpec;
    railings: FacciataElementSpec;
  };
}

export interface FacciataManifestLine {
  code: string;
  action: "add" | "remove" | "replace" | "repaint" | "apply" | "preserve";
  zoneId?: FacciataZoneId;
  summary: string;
  technicalNote?: string;
  patchRule?: string;
  preserveRule?: string;
}

export interface FacciataReplacementManifest {
  interventionSummary: string;
  activeSystems: string[];
  inactiveSystems: string[];
  targetedZones: string[];
  untouchedZones: string[];
  replacements: string[];
  removals: FacciataManifestLine[];
  repaintActions: string[];
  keepExactly: string[];
  transitionRules: string[];
  integrityConstraints: string[];
}

export interface FacciataRenderConfig {
  schema_version: "facciata_render_v2";
  notes: string;
  photo_meta: FacciataPhotoMeta | null;
  scene_analysis: FacciataSceneAnalysis;
  zone_targeting: FacciataZoneTargeting;
  technical_specification: FacciataTechnicalSpecification;
  replacement_manifest: FacciataReplacementManifest;
  removal_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  legacy_config: ConfigurazioneFacciata;
}

export interface FacciataPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface FacciataPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: FacciataPromptValidationResult;
  normalizedConfig: FacciataRenderConfig;
}
