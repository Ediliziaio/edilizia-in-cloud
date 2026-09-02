export type TipoPavimento =
  | "parquet_massello"
  | "parquet_prefinito"
  | "laminato"
  | "gres_porcellanato"
  | "ceramica"
  | "marmo"
  | "pietra_naturale"
  | "vinile_lvt"
  | "cotto"
  | "cemento_resina"
  | "resina_continua"
  | "microcemento"
  | "moquette"
  | "terrazzo_veneziano";

export type FinituraPavimento =
  | "lucido"
  | "opaco"
  | "satinato"
  | "spazzolato"
  | "boccardato"
  | "anticato"
  | "levigato"
  | "naturale"
  | "cerato";

export type PatternPosa =
  | "rettilineo_dritto"
  | "a_correre"
  | "sfalsato_33"
  | "spina_di_pesce"
  | "spina_ungherese"
  | "diagonale_45"
  | "cassero_irregolare"
  | "opus_romanum"
  | "doppia_fila"
  | "modulare"
  | "esagonale";

export type EffettoVisivoPavimento =
  | "legno"
  | "marmo"
  | "pietra"
  | "cemento"
  | "resina"
  | "cotto"
  | "tessile"
  | "terrazzo"
  | "neutro";

export type EssenzaLegno =
  | "rovere_naturale"
  | "rovere_sbiancato"
  | "rovere_miele"
  | "noce"
  | "teak"
  | "wenghe"
  | "frassino_bianco";

export type VariazioneTono = "uniforme" | "leggera" | "naturale" | "marcata";
export type Bisellatura = "nessuna" | "microbisello" | "bisello_v" | "bordo_irregolare";
export type DirezionePosa =
  | "segue_prospettiva"
  | "parallela_parete_lunga"
  | "perpendicolare_parete_lunga"
  | "verso_finestra"
  | "diagonale_45";
export type ScalaPattern = "compatta" | "standard" | "grande_formato" | "maxi_lastre";
export type SogliePorte = "mantieni" | "sostituisci_coerenti" | "integra_senza_soglia";
export type GiuntoPerimetrale = "standard_nascosto" | "ombra_sottile" | "sigillatura_elastica";
export type FasceBordo = "nessuna" | "cornice_perimetrale" | "fascia_stesso_materiale";

export interface ConfigurazionePavimento {
  tipo: TipoPavimento;
  finitura: FinituraPavimento;
  colore_mode: "palette" | "ral" | "legno" | "free";
  colore_nome?: string;
  colore_hex?: string;
  colore_ral?: string;
  effetto_visivo?: EffettoVisivoPavimento;
  essenza_legno?: EssenzaLegno;
  variazione_tono?: VariazioneTono;
  bisellatura?: Bisellatura;
  direzione_posa?: DirezionePosa;
  scala_pattern?: ScalaPattern;
  soglie_porte?: SogliePorte;
  giunto_perimetrale?: GiuntoPerimetrale;
  fasce_bordo?: FasceBordo;
  pattern_posa: PatternPosa;
  formato_piastrella?: string;
  larghezza_listello_mm?: number;
  lunghezza_listello_mm?: number;
  fuga_larghezza_mm?: number;
  fuga_colore?: "bianco" | "grigio_chiaro" | "grigio_scuro" | "nero" | "beige" | "tono_su_tono";
  battiscopa?: {
    azione: "mantieni" | "sostituisci" | "rimuovi";
    tipo?: "coordinato_pavimento" | "bianco" | "legno" | "alluminio";
    altezza_cm?: 6 | 8 | 10;
  };
  note_libere?: string;
  /** Foto prodotto del catalogo render dell'azienda scelte nel wizard (max 4). */
  catalogo_reference_ids?: string[];
}

export interface AnalisiPavimento {
  tipo_stanza: string;
  pavimento_attuale: string;
  colore_attuale: string;
  dimensione_stimata: string;
  stato_conservazione: string;
  battiscopa_presente: boolean;
  note?: string;
  room_orientation?: string;
  visible_floor_area?: string;
  walls_visible?: number;
  current_floor_format?: string;
  has_visible_joints?: boolean;
  rugs_present?: boolean;
  thresholds_visible?: boolean;
  steps_visible?: boolean;
  floor_perimeter_geometry?: string;
  obstacles?: string[];
  light_quality?: string;
  reflections_present?: boolean;
  preserved_elements?: string[];
}

export interface FloorPhotoMeta {
  width?: number;
  height?: number;
  orientation?: "landscape" | "portrait" | "square";
}

export interface FloorSceneAnalysis {
  roomType: string;
  estimatedSize: string;
  cameraPerspective: string;
  visibleFloorArea: string;
  roomOrientation: string;
  visibleWalls: number;
  currentFloor: {
    material: string;
    color: string;
    format: string;
    hasVisibleJoints: boolean;
    condition: string;
  };
  skirting: {
    present: boolean;
    material: string;
    color: string;
    height: string;
  };
  obstacles: string[];
  rugsPresent: boolean;
  doorsAndThresholds: string;
  stepsOrRaisedAreas: string;
  lighting: {
    quality: string;
    direction: string;
    reflections: string;
  };
  floorPerimeterGeometry: string;
  untouchedElements: string[];
  analysisNotes: string;
}

export interface FloorCoverageMap {
  mainVisibleArea: string;
  perimeterBoundaries: string[];
  thresholds: string[];
  raisedAreas: string[];
  coveredOrOccludedZones: string[];
  furnitureContactZones: string[];
  crispEdges: string[];
}

export interface FloorMaterialSpecification {
  materialCategory: TipoPavimento;
  visualEffect: EffettoVisivoPavimento;
  materialDescription: string;
  finishDescription: string;
  colorDescription: string;
  woodEssenceDescription?: string;
  toneVariationRule: string;
  formatRule: string;
  bevelRule: string;
  realismRule: string;
  isSeamless: boolean;
  isTextile: boolean;
  isWoodLike: boolean;
  isTileLike: boolean;
}

export interface FloorReplacementManifest {
  replacements: string[];
  removals: string[];
  additions: string[];
  preservation: string[];
  patternRules: string[];
  jointRules: string[];
  skirtingRules: string[];
  objectInteractionRules: string[];
}

export interface FloorRenderConfig {
  legacy_config: ConfigurazionePavimento;
  scene_analysis: FloorSceneAnalysis;
  coverage_map: FloorCoverageMap;
  replacement_manifest: FloorReplacementManifest;
  technical_specification: FloorMaterialSpecification;
  integrity_constraints: string[];
  quality_directives: string[];
  photo_meta?: FloorPhotoMeta | null;
  notes?: string;
}

export interface FloorPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface FloorPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  normalizedConfig: FloorRenderConfig;
  validation: FloorPromptValidationResult;
}
