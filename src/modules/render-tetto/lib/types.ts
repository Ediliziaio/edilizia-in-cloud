export type TipoManto = "tegole_coppi" | "tegole_marsigliesi" | "tegole_portoghesi" | "tegole_piane" | "ardesia_naturale" | "ardesia_sintetica" | "lamiera_grecata" | "lamiera_aggraffata" | "lamiera_zinco_titanio" | "guaina_bituminosa" | "guaina_tpo" | "tegole_fotovoltaiche";

export type FinituraMantoTetto = "opaco" | "semi_lucido" | "lucido";

export type MaterialeGrondaia = "alluminio" | "rame" | "acciaio_zincato" | "pvc" | "zinco_titanio";

export type TipoLucernario = "piatto" | "sporgente" | "abbaino";

export type TipoInterventoTetto =
  | "sostituzione_manto"
  | "solo_colore"
  | "lattonerie_accessori"
  | "sovracopertura_coibentata"
  | "rifacimento_completo";

export type TargetFaldeTetto =
  | "tutto_tetto"
  | "falda_principale"
  | "falda_frontale"
  | "falda_laterale"
  | "zona_specifica";

export interface ConfigManto {
  tipo: TipoManto;
  colore_hex: string;
  colore_nome?: string;
  finitura: FinituraMantoTetto;
}

export interface ConfigGrondaie {
  attivo: boolean;
  materiale: MaterialeGrondaia;
  colore_hex: string;
  colore_pluviale_hex?: string;
}

export interface ConfigLucernari {
  attivo: boolean;
  azione: "mantieni" | "aggiungi" | "rimuovi";
  tipo?: TipoLucernario;
  quantita?: 1 | 2 | 3 | 4;
  posizione?: "centrale" | "laterale_sx" | "laterale_dx" | "distribuiti";
  colore_telaio_hex?: string;
}

export interface ConfigPannelliSolari {
  attivo: boolean;
  tipo?: "fotovoltaico_nero" | "fotovoltaico_blu" | "tegola_solare_integrata";
  quantita?: "pochi" | "medi" | "tanti";
  posizione?: "falda_sud" | "falda_principale" | "distribuiti";
}

export interface ConfigIsolamentoTetto {
  attivo: boolean;
  tipo?: "pannello_sandwich" | "sarking_legno" | "lana_roccia" | "xps" | "fibra_legno";
  spessore_cm?: 6 | 8 | 10 | 12 | 14 | 16;
}

export interface ConfigTargetTetto {
  scope: TargetFaldeTetto;
  descrizione_zona?: string;
}

export interface ConfigurazioneTetto {
  tipo_intervento?: TipoInterventoTetto;
  target?: ConfigTargetTetto;
  manto: ConfigManto;
  isolamento?: ConfigIsolamentoTetto;
  grondaie: ConfigGrondaie;
  lucernari: ConfigLucernari;
  pannelli_solari?: ConfigPannelliSolari;
  note_libere?: string;
}

export interface AnalisiTetto {
  tipo_edificio?: string;
  stile_edificio?: string;
  tipo_tetto: string;
  numero_falde: number;
  falde_visibili?: string[];
  manto_attuale: string;
  colore_manto_hex: string;
  colore_manto_nome?: string;
  presenza_lucernari: boolean;
  numero_lucernari: number;
  presenza_abbaini?: boolean;
  pendenza_stimata: number;
  inclinazione_apparente?: string;
  presenza_comignoli: boolean;
  presenza_fotovoltaico?: boolean;
  presenza_antenne_linee_vita?: boolean;
  gronde_pluviali?: string;
  bordi_sporti?: string;
  colmo_displuvi_converse?: string;
  prospettiva_foto?: string;
  luce_ombre?: string;
  elementi_intoccabili?: string[];
  contesto_da_preservare?: string[];
  stato_conservazione: string;
}

export interface RoofSceneAnalysis {
  buildingType: string;
  buildingStyle: string;
  roofType: string;
  visibleSlopes: string[];
  slopeCount: number;
  apparentPitch: string;
  currentCovering: string;
  currentColor: string;
  conservationState: string;
  skylights: string;
  dormers: string;
  chimneys: string;
  photovoltaic: string;
  antennasLifeLines: string;
  guttersDownpipes: string;
  eavesEdges: string;
  ridgeValleysFlashings: string;
  photoPerspective: string;
  lightAndShadows: string;
  untouchableElements: string[];
  contextToPreserve: string[];
}

export interface RoofTargetSlopesMap {
  scope: TargetFaldeTetto;
  targetDescription: string;
  targetSlopes: string[];
  untouchedSlopes: string[];
  photovoltaicZone: string;
  accessoryZone: string;
  preservedRoofGeometry: string[];
  accessoryZonesInScope: string[];
  accessoryZonesOutOfScope: string[];
}

export interface RoofBuildabilityEnvelope {
  materialPitchCompatibility: string;
  insulationThicknessEffect: string;
  eaveAndEdgeAdaptation: string;
  skylightIntegration: string;
  photovoltaicIntegration: string;
  gutterCompatibility: string;
  forbiddenResults: string[];
  compatibilityWarnings: string[];
}

export interface RoofWaterManagementRules {
  ridgeCaps: string;
  valleysAndHips: string;
  eavesDripEdges: string;
  flashingsAroundPenetrations: string;
  guttersDownpipes: string;
  noWaterTrapRules: string[];
}

export interface RoofAccessoryCompatibility {
  preserveAccessories: string[];
  replaceAccessories: string[];
  removeAccessories: string[];
  solarCompatibility: string;
  skylightCompatibility: string;
  snowGuardsLifeLines: string;
}

export interface RoofExecutionPriorityPlan {
  phases: string[];
  rules: string[];
}

export interface RoofReplacementManifest {
  interventionType: TipoInterventoTetto;
  replacements: string[];
  recolors: string[];
  additions: string[];
  removals: string[];
  conversionRules: string[];
  compatibilityAdjustments: string[];
  restorationRules: string[];
  preserveExactly: string[];
  preserveGeometry: string[];
  preserveAccessories: string[];
}

export interface RoofPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
  warnings: string[];
}

export interface TettoPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  sceneAnalysis: RoofSceneAnalysis;
  targetSlopesMap: RoofTargetSlopesMap;
  buildabilityEnvelope: RoofBuildabilityEnvelope;
  waterManagementRules: RoofWaterManagementRules;
  accessoryCompatibility: RoofAccessoryCompatibility;
  executionPriorityPlan: RoofExecutionPriorityPlan;
  replacementManifest: RoofReplacementManifest;
  validation: RoofPromptValidationResult;
}
