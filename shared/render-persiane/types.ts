export type TipoOperazione = "sostituisci" | "cambia_colore" | "aggiungi" | "rimuovi";

export type TipoPersiana =
  | "veneziana_classica"
  | "veneziana_esterna"
  | "scuro_pieno"
  | "scuro_cornice"
  | "gelosia"
  | "avvolgibile_esterno"
  | "a_libro"
  | "griglia_sicurezza"
  | "brise_soleil";

export type MaterialePersiana =
  | "legno_naturale"
  | "legno_composito"
  | "alluminio"
  | "pvc"
  | "acciaio"
  | "fibra_vetro";

export type StatoApertura =
  | "chiuso"
  | "socchiuso"
  | "aperto_45"
  | "aperto_90"
  | "anta_singola_aperta";

export type AperturaLamelle = "chiuse" | "parzialmente_aperte" | "completamente_aperte";

export type PersianaFerramentaFinitura =
  | "verniciata_tinta"
  | "nero_opaco"
  | "acciaio_satinato"
  | "ferro_micaceo"
  | "bronzo_scuro";

export type PersianaInstallazione =
  | "cardini_tradizionali"
  | "su_telaio"
  | "guide_laterali"
  | "brackets_architettonici";

export const TIPI_CON_LAMELLE = new Set<TipoPersiana>([
  "veneziana_classica",
  "veneziana_esterna",
  "gelosia",
  "brise_soleil",
]);

export interface ConfigurazionePersiane {
  operazione: TipoOperazione;
  tipo: TipoPersiana;
  materiale: MaterialePersiana;
  colore_mode: "ral" | "legno";
  colore_ral?: string;
  colore_nome?: string;
  colore_hex?: string;
  effetto_legno?: string;
  stato_apertura: StatoApertura;
  lamelle?: {
    larghezza_mm: 40 | 50 | 60 | 80;
    apertura: AperturaLamelle;
  };
  colore_profilo_diverso?: boolean;
  colore_profilo_hex?: string;
  applica_tutte_finestre: boolean;
  target_mode?: "all_visible" | "main_opening" | "selected_openings";
  selected_opening_ids?: string[];
  ferramenta_finitura?: PersianaFerramentaFinitura;
  installazione?: PersianaInstallazione;
  fermapersiana_visibile?: boolean;
  mantieni_accessori_non_target?: boolean;
  note_libere?: string;
}

export type PersianeImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface PersianePhotoMeta {
  width: number;
  height: number;
  orientation: PersianeImageOrientation;
}

export type FacadeOpeningPosition =
  | "far_left"
  | "left"
  | "center"
  | "right"
  | "far_right"
  | "upper_left"
  | "upper_center"
  | "upper_right"
  | "lower_left"
  | "lower_center"
  | "lower_right"
  | "full_width"
  | "unknown";

export type FacadeOpeningKind = "window" | "door_window" | "balcony_door" | "arched_window" | "unknown";

export type ExistingShutterType =
  | TipoPersiana
  | "battente_generica"
  | "nessuna"
  | "unknown";

export interface PersianeSceneOpening {
  id: string;
  label: string;
  order: number;
  position: FacadeOpeningPosition;
  approximatePlacement: string;
  openingKind: FacadeOpeningKind;
  apparentSize: string;
  specialShape: string | null;
  hasExistingShutter: boolean;
  existingShutterType: ExistingShutterType;
  materialPerceived: string;
  colorPerceived: string;
  openingStatePerceived: StatoApertura | "not_visible" | "unknown";
  leafOrientation: string;
  leafCount: number;
  hasLouvers: boolean;
  louverState: string;
  hasHinges: boolean;
  hasHoldOpenHardware: boolean;
  hasTracks: boolean;
  hasSideGuides: boolean;
  hasHeadBox: boolean;
  hasSecurityGrille: boolean;
  revealDepth: string;
  trimDetails: string[];
  lightingNotes: string;
  shadowNotes: string;
  geometryNotes: string;
  preserveNotes: string;
}

export interface PersianeSceneAnalysis {
  version: "2.0";
  facadeType: string;
  buildingStyle: string;
  imageOrientation: PersianeImageOrientation;
  openingsVisible: number;
  targetableOpenings: number;
  cameraAngle: string;
  lightingCondition: string;
  wallTexture: string;
  wallColor: string;
  untouchedElements: string[];
  preserveRigidly: string[];
  openings: PersianeSceneOpening[];
  primaryTargetHint: string | null;
  noteAnalisi: string;
  legacy: {
    tipo_facciata: string;
    persiane_attuali: string;
    materiale_attuale: string;
    colore_attuale: string;
    numero_finestre: number;
    stato_conservazione: string;
    note?: string;
  };
}

export type AnalisiPersiane = PersianeSceneAnalysis;

export interface PersianeTargetSelection {
  mode: "single" | "multiple" | "all";
  selectedOpeningIds: string[];
  preservedOpeningIds: string[];
  primaryOpeningId: string | null;
  targetLabels: string[];
}

export interface PersianaFinishSpec {
  mode: "ral" | "legno";
  label: string;
  ral: string | null;
  hex: string | null;
  woodEffectId: string | null;
  promptFragment: string;
}

export interface PersianaTechnicalSpecification {
  openingId: string;
  openingLabel: string;
  operation: TipoOperazione;
  targetType: TipoPersiana | null;
  currentType: ExistingShutterType;
  material: MaterialePersiana | null;
  finish: PersianaFinishSpec | null;
  profileContrastColor: string | null;
  openingState: StatoApertura | null;
  supportsLouvers: boolean;
  louverRule: string | null;
  leafConfiguration: string;
  installationStyle: string;
  typeDescription: string;
  materialDescription: string | null;
  hardwareFinish: string;
  hardwareRules: string[];
  recolorOnly: boolean;
  keepGeometryExactly: boolean;
}

export interface PersianaRemovalRule {
  code: string;
  openingIds: string[];
  summary: string;
  repairInstruction?: string;
  preserveInstruction?: string;
}

export interface PersianaReplacementManifestTarget {
  openingId: string;
  openingLabel: string;
  currentType: ExistingShutterType;
  targetType: TipoPersiana | "remove" | "recolor_only";
  action: "replace" | "recolor" | "add" | "remove";
  summary: string;
}

export interface PersianaUntouchedOpening {
  openingId: string;
  openingLabel: string;
  currentType: ExistingShutterType;
  action: "preserve";
  summary: string;
}

export interface PersianaReplacementManifest {
  operationSummary: string;
  targetOpenings: PersianaReplacementManifestTarget[];
  untouchedOpenings: PersianaUntouchedOpening[];
  additions: string[];
  removals: PersianaRemovalRule[];
  keepExactly: string[];
  integrityConstraints: string[];
}

export interface PersianeRenderConfig {
  schema_version: "persiane_render_v2";
  notes: string;
  photo_meta: PersianePhotoMeta | null;
  scene_analysis: PersianeSceneAnalysis;
  target_selection: PersianeTargetSelection;
  technical_specification: PersianaTechnicalSpecification[];
  replacement_manifest: PersianaReplacementManifest;
  removal_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  legacy_config: ConfigurazionePersiane;
}

export interface PersianePromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface PersianePromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: PersianePromptValidationResult;
  normalizedConfig: PersianeRenderConfig;
}
