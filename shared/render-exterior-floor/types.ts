export type TipoOperazionePavimentoEsterno =
  | "replace_existing_surface"
  | "recolor_or_refinish_only"
  | "change_coping_only"
  | "change_steps_only"
  | "add_border_band"
  | "add_drainage_logic"
  | "convert_to_deck"
  | "convert_to_gravel_or_stepping_stones";

export type TipoPavimentazioneEsterna =
  | "gres_outdoor"
  | "pietra_naturale"
  | "masselli_autobloccanti"
  | "cotto_esterno"
  | "cemento_architettonico"
  | "cemento_drenante"
  | "deck_wpc"
  | "deck_legno"
  | "ghiaia_stabilizzata"
  | "lastre_grande_formato"
  | "coping_bordo_piscina";

export type FinituraPavimentazioneEsterna =
  | "opaco"
  | "naturale"
  | "fiammato"
  | "spazzolato"
  | "sabbiato"
  | "bocciardato"
  | "antiscivolo"
  | "lavato"
  | "effetto_materico";

export type PatternPosaEsterna =
  | "rettilineo"
  | "a_correre"
  | "diagonale"
  | "opus"
  | "modulare"
  | "cassero"
  | "doga_parallela"
  | "doga_sfalsata"
  | "stepping_stones"
  | "massello_spina"
  | "massello_classico";

export type TipoGiuntoEsterno =
  | "fuga_sottile"
  | "fuga_media"
  | "fuga_larga"
  | "drenante"
  | "sabbia_polimerica"
  | "giunto_aperto_deck"
  | "nessuno_visibile";

export type TipoBordoEsterna =
  | "nessuno"
  | "fascia_perimetrale"
  | "bordo_pietra"
  | "bordo_alluminio"
  | "bordo_massello"
  | "coping_piscina_moderno"
  | "coping_piscina_classico";

export type TipoGradinoEsterno =
  | "nessuno"
  | "rivestito_stesso_materiale"
  | "pedata_alzata_coordinate"
  | "toro_arrotondato"
  | "gradone_monolitico";

export type UsoSuperficieEsterna =
  | "pedonale"
  | "carrabile_leggera"
  | "carrabile_intensa"
  | "bordo_piscina"
  | "area_relax"
  | "camminamento_giardino";

export type AreaTargetPavimentoEsterno =
  | "patio"
  | "terrazza"
  | "vialetto"
  | "camminamento"
  | "cortile"
  | "bordo_piscina"
  | "ingresso_esterno"
  | "zona_portico"
  | "area_pergola"
  | "giardino_camminamenti"
  | "custom";

export type ExteriorFloorImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface ExteriorFloorPhotoMeta {
  width?: number;
  height?: number;
  orientation?: ExteriorFloorImageOrientation;
}

export interface ConfigInserimentoPavimentoEsterno {
  area_target: AreaTargetPavimentoEsterno;
  posizione_descrittiva?: string;
  quota_apparente?: "a_filo" | "leggermente_rialzata" | "ribassata" | "su_gradini" | "custom";
  rapporto_con_casa?: string;
  rapporto_con_prato?: string;
  rapporto_con_piscina?: string;
  rapporto_con_gradini?: string;
  pendenza_apparente?: "leggera_verso_giardino" | "leggera_verso_scarico" | "quasi_piana" | "da_preservare" | "custom";
  drenaggio_percepito?: "non_visibile" | "fughe_drenanti" | "canalina_lineare" | "pendenza_naturale" | "giunti_aperti";
  interferenze_note?: string;
}

export interface ConfigurazionePavimentoEsterno {
  operazione: TipoOperazionePavimentoEsterno;
  inserimento: ConfigInserimentoPavimentoEsterno;
  materiale: TipoPavimentazioneEsterna;
  finitura: FinituraPavimentazioneEsterna;
  colore_nome?: string;
  colore_hex?: string;
  formato?: string;
  pattern_posa: PatternPosaEsterna;
  giunto: TipoGiuntoEsterno;
  larghezza_giunto_mm?: number;
  colore_giunto?: string;
  bordo: TipoBordoEsterna;
  gradino: TipoGradinoEsterno;
  uso: UsoSuperficieEsterna;
  coping_materiale?: "travertino" | "pietra_chiara" | "gres_2cm" | "pietra_grigia" | "cemento_spazzolato" | "legno_wpc";
  elementi_da_rimuovere?: string[];
  elementi_da_preservare?: string[];
  note_libere?: string;
}

export interface ExteriorFloorSceneAnalysis {
  version: "1.0";
  outdoorAreaType: string;
  propertyType: string;
  houseFacadeRelation: string;
  currentSurface: string;
  surroundingSurfaces: string;
  stepsAndLevels: string;
  thresholdsAndHouseJunctions: string;
  poolEdge: string;
  wallsParapetsFences: string;
  circulationFlows: string;
  outdoorFurniture: string;
  lightAndShadows: string;
  currentWear: string;
  apparentSlopeAndLevels: string;
  obstacles: string[];
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: ExteriorFloorImageOrientation;
}

export interface ExteriorFloorTargetSurfaceMap {
  areaTarget: AreaTargetPavimentoEsterno;
  targetDescription: string;
  apparentPerimeter: string;
  frontBackLimits: string;
  leftRightLimits: string;
  thresholds: string[];
  steps: string[];
  poolEdges: string[];
  occludedZones: string[];
  adjacentSurfacesToPreserve: string[];
  materialTransitionLines: string[];
}

export interface ExteriorFloorBuildabilityEnvelope {
  plausibleThickness: string;
  finalLevelRelation: string;
  thresholdCompatibility: string;
  slopeLogic: string;
  drainageLogic: string;
  poolCompatibility: string;
  lawnDeckFacadeCompatibility: string;
  usageCompatibility: string;
  forbiddenPlacements: string[];
}

export interface ExteriorFloorTechnicalSpecification {
  flooringType: TipoPavimentazioneEsterna;
  materialDescription: string;
  finishDescription: string;
  colorDescription: string;
  formatDescription: string;
  patternDescription: string;
  usageDescription: string;
  jointDescription: string;
  borderDescription: string;
  stepDescription: string;
  outdoorRealismCues: string[];
  isDeck: boolean;
  isLargeFormat: boolean;
  isPoolside: boolean;
  isVehicular: boolean;
  isContinuousLike: boolean;
}

export interface ExteriorFloorReplacementManifest {
  operation: TipoOperazionePavimentoEsterno;
  additions: string[];
  removals: string[];
  replacements: string[];
  recolors: string[];
  conversions: string[];
  preserveExactly: string[];
}

export interface ExteriorFloorRenderConfig {
  legacy_config: ConfigurazionePavimentoEsterno;
  photo_meta: ExteriorFloorPhotoMeta | null;
  scene_analysis: ExteriorFloorSceneAnalysis;
  target_surface_map: ExteriorFloorTargetSurfaceMap;
  buildability_envelope: ExteriorFloorBuildabilityEnvelope;
  technical_specification: ExteriorFloorTechnicalSpecification;
  replacement_manifest: ExteriorFloorReplacementManifest;
  outdoor_realism_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface ExteriorFloorPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface ExteriorFloorPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: ExteriorFloorPromptValidationResult;
  normalizedConfig: ExteriorFloorRenderConfig;
}
