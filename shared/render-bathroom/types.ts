export type TipoIntervento =
  | "restyling_piastrelle"
  | "restyling_completo"
  | "demolizione_parziale"
  | "demolizione_completa";

export interface SostituzioneElementi {
  piastrelle_parete: boolean;
  pavimento: boolean;
  doccia: boolean;
  vasca: boolean;
  mobile_bagno: boolean;
  sanitari: boolean;
  rubinetteria: boolean;
  parete_colore: boolean;
  illuminazione: boolean;
}

export interface ConfigPiastrella {
  attivo: boolean;
  effetto: string;
  formato: string;
  posa: string;
  fuga_colore: string;
  altezza_rivestimento?: string;
  orientamento_lastra?: "automatico" | "verticale" | "orizzontale";
}

export type BathroomShowerType =
  | "walk_in"
  | "nicchia_box"
  | "frontale_box"
  | "angolare"
  | "semicircolare";

export type BathroomShowerGlassType =
  | "trasparente"
  | "satinato"
  | "fume"
  | "serigrafato";

export type BathroomShowerTrayType =
  | "filo_pavimento"
  | "rialzato_3cm"
  | "rialzato_5cm"
  | "pietra";

export type BathroomShowerProfileFinish =
  | "cromato"
  | "nero_opaco"
  | "oro_spazzolato"
  | "senza_profilo";

export type BathroomShowerHeadType =
  | "a_parete"
  | "pioggia_soffitto"
  | "colonna_completa"
  | "combinato";

export interface ConfigDoccia {
  attivo: boolean;
  tipo: BathroomShowerType;
  box_vetro: BathroomShowerGlassType;
  piatto: BathroomShowerTrayType;
  profilo: BathroomShowerProfileFinish;
  soffione: BathroomShowerHeadType;
}

export type BathroomBathtubType =
  | "freestanding_ovale"
  | "freestanding_rettangolare"
  | "back_to_wall"
  | "incassata"
  | "angolare";

export type BathroomBathtubMaterial =
  | "acrilico_bianco"
  | "solid_surface"
  | "ghisa_smaltata"
  | "pietra";

export type BathroomBathtubFaucetPosition =
  | "a_parete"
  | "a_pavimento"
  | "bordo_vasca";

export type BathroomBathtubSize =
  | "150x70"
  | "160x75"
  | "170x75"
  | "180x80"
  | "190x90";

export interface ConfigVasca {
  attivo: boolean;
  tipo: BathroomBathtubType;
  materiale: BathroomBathtubMaterial;
  rubinetteria_vasca: BathroomBathtubFaucetPosition;
  dimensione_cm?: BathroomBathtubSize;
}

export type BathroomVanityStyle =
  | "sospeso_moderno"
  | "sospeso_minimal"
  | "a_terra_classico"
  | "a_terra_industrial";

export type BathroomVanityTopMaterial =
  | "marmo_bianco"
  | "marmo_nero"
  | "quarzo"
  | "legno"
  | "ceramica";

export type BathroomBasinType =
  | "integrato"
  | "appoggio_ovale"
  | "appoggio_rettangolare"
  | "semincasso";

export type BathroomMirrorType =
  | "retroilluminato"
  | "specchiera_contenitore"
  | "tondo"
  | "verticale";

export interface ConfigVanity {
  attivo: boolean;
  stile: BathroomVanityStyle;
  colore: string;
  piano: BathroomVanityTopMaterial;
  lavabo: BathroomBasinType;
  larghezza_cm: 60 | 80 | 100 | 120 | 140;
  numero_lavabi?: 1 | 2;
  specchio?: BathroomMirrorType;
}

export type BathroomSanitaryAction = "mantieni" | "sostituisci";
export type BathroomBidetAction = "mantieni" | "sostituisci" | "rimuovi";
export type BathroomToiletType = "sospeso" | "a_terra" | "rimless_sospeso";
export type BathroomBidetType = "sospeso" | "a_terra";
export type BathroomSanitaryColor = "bianco" | "grigio_chiaro" | "nero_opaco";
export type BathroomFlushPlateStyle =
  | "rettangolare_sottile"
  | "vetro_minimal"
  | "tonda_soft";

export type BathroomFlushPlateColor =
  | "bianco"
  | "nero_opaco"
  | "cromo"
  | "acciaio_spazzolato"
  | "oro_rosa"
  | "ottone_spazzolato";

export interface ConfigSanitari {
  attivo: boolean;
  azione_wc: BathroomSanitaryAction;
  tipo_wc: BathroomToiletType;
  azione_bidet: BathroomBidetAction;
  tipo_bidet?: BathroomBidetType;
  colore: BathroomSanitaryColor;
  piastra_wc?: BathroomFlushPlateStyle;
  piastra_wc_colore?: BathroomFlushPlateColor;
}

export type BathroomFaucetFinish =
  | "cromo"
  | "nero_opaco"
  | "oro_spazzolato"
  | "oro_rosa"
  | "acciaio_spazzolato";

export type BathroomFaucetStyle =
  | "quadro_moderno"
  | "tondo_classico"
  | "industrial"
  | "vintage_crosshead";

export interface ConfigRubinetteria {
  attivo: boolean;
  finitura: BathroomFaucetFinish;
  stile: BathroomFaucetStyle;
}

export interface ConfigParete {
  attivo: boolean;
  azione: "mantieni" | "tinta_unita" | "lastra_decorativa";
  colore_hex?: string;
}

export interface ConfigurazioneBagno {
  tipo_intervento: TipoIntervento;
  sostituzione: SostituzioneElementi;
  piastrelle_parete: ConfigPiastrella;
  pavimento: ConfigPiastrella;
  doccia: ConfigDoccia;
  vasca: ConfigVasca;
  vanity: ConfigVanity;
  sanitari: ConfigSanitari;
  rubinetteria: ConfigRubinetteria;
  parete: ConfigParete;
  illuminazione_tipo?: string;
  note_libere?: string;
}

export type BathroomImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface BathroomPhotoMeta {
  width: number;
  height: number;
  orientation: BathroomImageOrientation;
}

export type BathroomRoomType =
  | "bathroom"
  | "ensuite"
  | "powder_room"
  | "wet_room"
  | "laundry_bath"
  | "unknown";

export type BathroomLayoutType =
  | "linear_single_wall"
  | "opposed_walls"
  | "corner_shower"
  | "bathtub_alcove"
  | "compact_rectangular"
  | "split_zones"
  | "unknown";

export type BathroomZonePosition =
  | "left_wall"
  | "right_wall"
  | "back_wall"
  | "center"
  | "corner_left"
  | "corner_right"
  | "under_window"
  | "unknown";

export type BathroomCondition = "buono" | "discreto" | "da_ristrutturare";

export interface BathroomSurfaceAnalysis {
  description: string;
  effect: string;
  format: string;
  layingPattern: string;
  groutColor: string;
  coverage?: string;
}

export interface BathroomCurrentShower {
  present: boolean;
  type: BathroomShowerType | "generic_box" | "unknown" | "none";
  position: BathroomZonePosition;
  enclosureType: string;
  glassType: string;
  trayType: string;
  frameFinish: string;
  notes: string;
}

export interface BathroomCurrentBathtub {
  present: boolean;
  type: BathroomBathtubType | "generic_built_in" | "unknown" | "none";
  position: BathroomZonePosition;
  faucetType: string;
  screenPresent: boolean;
  notes: string;
}

export interface BathroomCurrentVanity {
  present: boolean;
  type: "wall_hung" | "floor_standing" | "console" | "unknown" | "none";
  position: BathroomZonePosition;
  basinType: string;
  basinCount: 0 | 1 | 2;
  mirrorPresent: boolean;
  mirrorType: string;
  notes: string;
}

export interface BathroomCurrentSanitaryWare {
  wcPresent: boolean;
  wcType: "wall_hung" | "back_to_wall" | "floor_standing" | "unknown" | "none";
  bidetPresent: boolean;
  bidetType: "wall_hung" | "back_to_wall" | "floor_standing" | "unknown" | "none";
  position: BathroomZonePosition;
  notes: string;
}

export interface BathroomLightingAnalysis {
  type: "natural" | "ceiling_spots" | "pendant" | "mirror_backlit" | "wall_sconces" | "mixed" | "unknown";
  direction: string;
  temperature: string;
  notes: string;
}

export interface BathroomSceneAnalysis {
  version: "2.0";
  roomType: BathroomRoomType;
  estimatedSize: string;
  estimatedCeilingHeight: string;
  layoutType: BathroomLayoutType;
  cameraPerspective: string;
  cameraAngle: string;
  dominantColors: string[];
  overallCondition: BathroomCondition;
  wallTiles: BathroomSurfaceAnalysis;
  floor: BathroomSurfaceAnalysis;
  shower: BathroomCurrentShower;
  bathtub: BathroomCurrentBathtub;
  vanity: BathroomCurrentVanity;
  sanitaryWare: BathroomCurrentSanitaryWare;
  lighting: BathroomLightingAnalysis;
  mirrorPresent: boolean;
  towelWarmerPresent: boolean;
  towelWarmerType: string;
  windowPresent: boolean;
  windowPosition: BathroomZonePosition;
  nichePresent: boolean;
  partitionPresent: boolean;
  preserveRigidly: string[];
  demolitionSensitiveAreas: string[];
  noteAnalisi: string;
  legacy: {
    tipo_stanza: string;
    dimensione_stimata: string;
    altezza_stimata: string;
    piastrelle_parete_attuali: string;
    pavimento_attuale: string;
    colori_dominanti: string[];
    presenza_doccia: boolean;
    tipo_doccia?: string;
    presenza_vasca: boolean;
    presenza_mobile: boolean;
    tipo_mobile?: string;
    sanitari_tipo?: string;
    rubinetteria_attuale?: string;
    illuminazione_attuale?: string;
    stato_conservazione: BathroomCondition;
    note?: string;
  };
}

export type AnalisiBagno = BathroomSceneAnalysis;

export interface BathroomTileSpecification {
  replace: boolean;
  effectId: string;
  effectDescription: string;
  format: string;
  nominalWidthCm: number | null;
  nominalHeightCm: number | null;
  formatCategory: "mosaic" | "standard" | "large_format" | "architectural_slab" | "plank" | "seamless";
  layingPattern: string;
  groutColor: string;
  coverage: string;
  moduleScaleRule: string;
  groutDensityRule: string;
  cutLayoutRule: string;
  realScaleLockRule: string;
  veinContinuityRule: string | null;
}

export interface BathroomFloorSpecification {
  replace: boolean;
  effectId: string;
  effectDescription: string;
  format: string;
  nominalWidthCm: number | null;
  nominalHeightCm: number | null;
  formatCategory: "mosaic" | "standard" | "large_format" | "architectural_slab" | "plank" | "seamless";
  layingPattern: string;
  groutColor: string;
  reflectivityRule: string;
  moduleScaleRule: string;
  groutDensityRule: string;
  cutLayoutRule: string;
  realScaleLockRule: string;
  veinContinuityRule: string | null;
}

export interface BathroomShowerSpecification {
  replace: boolean;
  type: BathroomShowerType;
  showerTypeLabel: string;
  enclosureType: string;
  glassType: string;
  framePresence: string;
  frameFinish: string;
  trayType: string;
  trayThickness: string;
  drainType: string;
  showerHeadType: string;
  handShowerType: string;
  mixerFinish: string;
  wallNiche: boolean;
  layoutRule: string;
}

export interface BathroomBathtubSpecification {
  replace: boolean;
  type: BathroomBathtubType;
  bathtubTypeLabel: string;
  materialDescription: string;
  faucetPosition: string;
  nominalSize: string;
  layoutRule: string;
  scaleRule: string;
  placementRule: string;
}

export interface BathroomVanitySpecification {
  replace: boolean;
  installation: "wall_hung" | "floor_standing";
  styleLabel: string;
  colorLabel: string;
  topDescription: string;
  basinType: string;
  basinCount: 1 | 2;
  mirrorType: string;
  mirrorLighting: string;
  storageType: string;
}

export interface BathroomSanitarySpecification {
  replace: boolean;
  toiletAction: BathroomSanitaryAction;
  toiletType: string;
  bidetAction: BathroomBidetAction;
  bidetType: string | null;
  installationRule: string;
  ceramicFinish: string;
  cisternRule: string;
  flushPlateStyle: string | null;
  flushPlateColor: string | null;
  flushPlateRule: string | null;
  scaleRule: string;
}

export interface BathroomFaucetSpecification {
  replace: boolean;
  finish: string;
  style: string;
  reflectivityRule: string;
}

export interface BathroomWallPaintSpecification {
  replace: boolean;
  action: string;
  colorHex: string | null;
}

export interface BathroomLightingSpecification {
  replace: boolean;
  target: string;
}

export interface BathroomRemovalRule {
  code: string;
  summary: string;
  repairInstruction?: string;
  preserveInstruction?: string;
}

export interface BathroomReplacementManifest {
  interventionSummary: string;
  replacements: string[];
  additions: string[];
  removals: BathroomRemovalRule[];
  preserveExactly: string[];
  untouchedSurfaces: string[];
  integrityConstraints: string[];
}

export interface BathroomRenderConfig {
  schema_version: "bathroom_render_v2";
  notes: string;
  photo_meta: BathroomPhotoMeta | null;
  intervention_type: TipoIntervento;
  scene_analysis: BathroomSceneAnalysis;
  technical_specification: {
    wallTiles: BathroomTileSpecification;
    floor: BathroomFloorSpecification;
    shower: BathroomShowerSpecification;
    bathtub: BathroomBathtubSpecification;
    vanity: BathroomVanitySpecification;
    sanitaryWare: BathroomSanitarySpecification;
    faucets: BathroomFaucetSpecification;
    wallPaint: BathroomWallPaintSpecification;
    lighting: BathroomLightingSpecification;
  };
  replacement_manifest: BathroomReplacementManifest;
  removal_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  legacy_config: ConfigurazioneBagno;
}

export interface BathroomPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface BathroomPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: BathroomPromptValidationResult;
  normalizedConfig: BathroomRenderConfig;
}
