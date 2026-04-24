export type GardenStyle =
  | "moderno_minimale"
  | "mediterraneo"
  | "naturale"
  | "contemporaneo"
  | "tropicale_controllato"
  | "rustico_elegante"
  | "zen"
  | "classico"
  | "low_maintenance"
  | "premium_relax";

export type GardenInterventionType =
  | "rifacimento_prato"
  | "aggiunta_aiuole"
  | "aggiunta_siepi"
  | "aggiunta_alberi"
  | "aggiunta_camminamenti"
  | "declutter"
  | "restyling_completo"
  | "upgrade_area_relax"
  | "bordo_piscina_verde"
  | "bordo_casa";

export type LawnType =
  | "prato_inglese"
  | "prato_resistente"
  | "macroterma"
  | "prato_ornamentale"
  | "prato_low_maintenance"
  | "sintetico_premium";

export type BedType =
  | "perimetrale"
  | "isola"
  | "lineare"
  | "angolare"
  | "bordo_piscina"
  | "bordo_camminamento"
  | "sottofinestre";

export type PlantingDensity = "bassa" | "media" | "alta";

export type HedgeType =
  | "schermante_alta"
  | "schermante_media"
  | "bassa_formale"
  | "naturale_morbida";

export type PathType =
  | "stepping_stones"
  | "ghiaia"
  | "pietra_naturale"
  | "betonelle"
  | "deck_path"
  | "lastre_modulari";

export type GroundCoverType =
  | "ghiaia"
  | "corteccia"
  | "lapillo"
  | "stabilizzato"
  | "tappezzante_vegetale";

export type OutdoorFurnitureMode =
  | "mantieni"
  | "aggiungi_minimo"
  | "aggiungi_relax"
  | "sostituisci_leggero";

export type GardenLightingMode =
  | "nessuna"
  | "segnapasso"
  | "uplight_vegetazione"
  | "luce_perimetrale"
  | "mix_soft";

export type GardenTargetZone =
  | "prato_principale"
  | "perimetro"
  | "bordo_casa"
  | "bordo_piscina"
  | "area_relax"
  | "area_ingresso"
  | "area_camminamento"
  | "angolo_vuoto"
  | "fascia_laterale";

export type GardenImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface GardenPhotoMeta {
  width?: number;
  height?: number;
  orientation?: GardenImageOrientation;
}

export interface ConfigurazioneGiardino {
  stile: GardenStyle;
  interventi: GardenInterventionType[];
  target_zones: GardenTargetZone[];
  prato: {
    attivo: boolean;
    tipo: LawnType;
  };
  aiuole: {
    attivo: boolean;
    tipo: BedType;
    densita: PlantingDensity;
    palette?: "verde_strutturale" | "fioriture_controllate" | "mediterranea" | "graminacee" | "mista";
  };
  siepi: {
    attivo: boolean;
    tipo: HedgeType;
    altezza?: "bassa" | "media" | "alta";
  };
  alberi: {
    attivo: boolean;
    quantita?: 1 | 2 | 3 | 4;
    scala?: "piccola" | "media" | "importante";
    portamento?: "colonnare" | "ombrello" | "ornamentale" | "naturale";
  };
  camminamenti: {
    attivo: boolean;
    tipo: PathType;
  };
  ground_cover: {
    attivo: boolean;
    tipo: GroundCoverType;
  };
  arredo: {
    modalita: OutdoorFurnitureMode;
  };
  illuminazione: GardenLightingMode;
  declutter: boolean;
  elementi_da_preservare?: string[];
  elementi_da_rimuovere?: string[];
  note_libere?: string;
}

export interface GardenSceneAnalysis {
  version: "1.0";
  outdoorSpaceType: string;
  apparentSize: string;
  houseRelation: string;
  existingLawn: string;
  bareSoilOrMineralSurfaces: string;
  patioDeckHardscape: string;
  pool: string;
  pergola: string;
  fencesWallsBorders: string;
  existingTrees: string;
  existingShrubsHedgesBeds: string;
  existingPaths: string;
  outdoorFurniture: string;
  lightAndShadows: string;
  circulationFlows: string;
  mainViewCorridors: string;
  emptyZones: string[];
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: GardenImageOrientation;
}

export interface GardenTargetZonesMap {
  targetZones: GardenTargetZone[];
  mainLawnZone: string;
  perimeterZones: string[];
  houseBorderZones: string[];
  poolsideZones: string[];
  pathZones: string[];
  relaxZones: string[];
  untouchedZones: string[];
  noPlantNoBlockZones: string[];
  viewCorridorsToPreserve: string[];
  breathingSpaceZones: string[];
}

export interface PlantingEnvelope {
  plausiblePlantHeights: string;
  bedWidthAndDepth: string;
  plantingDensity: string;
  facadeClearance: string;
  pathAndDoorClearance: string;
  poolPergolaRelation: string;
  treeScaleRules: string;
  hedgeScaleRules: string;
  maintenanceLogic: string;
  forbiddenPlanting: string[];
  warnings: string[];
}

export interface GardenStyleSpecification {
  style: GardenStyle;
  visualLanguage: string;
  plantPaletteDirection: string;
  borderTreatment: string;
  density: string;
  maintenanceIntent: string;
}

export interface GardenReplacementManifest {
  interventions: GardenInterventionType[];
  additions: string[];
  removals: string[];
  replacements: string[];
  refreshes: string[];
  plantingRules: string[];
  conversionRules: string[];
  preserveExactly: string[];
  preserveGeometry: string[];
  preserveContext: string[];
  maintenanceIntent: string;
}

export interface GardenRenderConfig {
  legacy_config: ConfigurazioneGiardino;
  photo_meta: GardenPhotoMeta | null;
  scene_analysis: GardenSceneAnalysis;
  target_zones_map: GardenTargetZonesMap;
  planting_envelope: PlantingEnvelope;
  style_specification: GardenStyleSpecification;
  replacement_manifest: GardenReplacementManifest;
  realism_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface GardenPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
  warnings: string[];
}

export interface GardenPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: GardenPromptValidationResult;
  normalizedConfig: GardenRenderConfig;
}
