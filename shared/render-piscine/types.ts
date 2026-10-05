export type TipoOperazionePiscina =
  | "add_new_pool"
  | "replace_existing_pool"
  | "remove_existing_pool"
  | "recolor_waterlook_or_liner_only"
  | "change_coping_only"
  | "add_access_system"
  | "add_pool_features";

export type TipoPiscina =
  | "interrata_rettangolare"
  | "interrata_organica"
  | "lap_pool"
  | "plunge_pool"
  | "sfioro_rettangolare"
  | "infinity_pool"
  | "semi_incassata"
  | "fuori_terra_premium"
  | "minipiscina"
  | "terrazzo_compatta"
  /** Biopiscina: zona di nuoto + zona di rigenerazione con piante, niente cloro né mosaico. */
  | "biopiscina";

export type FormaPiscina =
  | "rettangolare"
  | "organica"
  | "stretta_lunga"
  | "compatta"
  | "a_l"
  | "su_misura";

export type SistemaBordoPiscina =
  | "skimmer"
  | "sfioro"
  | "infinity_edge"
  | "sfioro_nascosto";

export type RivestimentoInternoPiscina =
  | "mosaico_bianco"
  | "mosaico_azzurro"
  | "mosaico_grigio"
  | "mosaico_antracite"
  | "gres_effetto_pietra"
  | "gres_effetto_sabbia"
  | "liner_chiaro"
  | "liner_scuro"
  | "resina_premium"
  | "pietra_naturale_pool_finish";

export type TipoCopingPiscina =
  | "pietra_chiara"
  | "pietra_grigia"
  | "gres_2cm"
  | "travertino"
  | "legno_wpc"
  | "cemento_spazzolato"
  | "bordo_sottile_moderno"
  | "bordo_massivo_classico";

export type SistemaAccessoPiscina =
  | "nessuno"
  | "scala_inox"
  | "gradini_angolo"
  | "gradini_frontali"
  | "gradoni_lounge"
  | "spiaggetta"
  | "beach_entry";

export type AccessorioPiscina =
  | "illuminazione_subacquea"
  | "lama_dacqua"
  | "cascata"
  | "idromassaggio_integrato"
  | "copertura_isotermica"
  | "copertura_rigida"
  | "doccia_esterna"
  | "zona_prendisole"
  /** Recinzione di sicurezza in vetro intorno alla piscina, con cancelletto. */
  | "recinzione_vetro";

export type ZonaInserimentoPiscina =
  | "giardino_centrale"
  | "laterale_casa"
  | "vicino_patio"
  | "bordo_terrazza"
  | "dietro_casa"
  | "vista_panoramica"
  | "plunge_compatta"
  | "rooftop_terrazza"
  | "custom";

export type DimensioneApparentePiscina = "compatta" | "media" | "ampia" | "stretta_lunga" | "su_misura";
export type ProfonditaApparentePiscina = "bassa_relax" | "standard" | "profonda" | "variabile";
export type AreaPerimetralePiscina = "mantieni_esistente" | "deck_wpc" | "solarium_gres" | "pietra_naturale" | "prato_raccordato" | "ghiaia_drenante";
export type ColoreAcquaPiscina = "cristallina_chiara" | "azzurra_classica" | "turchese" | "grigio_verde_naturale" | "blu_profondo" | "sabbia_chiara";
export type QuotaBordoPiscina = "a_filo_terreno" | "leggermente_rialzata" | "semi_incassata" | "fuori_terra";
/** Rivestimento delle pareti di una vasca rialzata (fuori terra, semi-incassata, compatta da terrazzo). */
export type RivestimentoEsternoPiscina = "doghe_legno_wpc" | "pietra_naturale" | "gres_effetto_pietra" | "intonaco_liscio";
/** Cosa va al posto di una piscina tolta. */
export type SuperficieRipristinoPiscina = Exclude<AreaPerimetralePiscina, "mantieni_esistente">;

/** Opzioni dei campi nuovi (04/10/2026): il form e i test le leggono da qui. Assenti = non specificato. */
export const RIVESTIMENTI_ESTERNI_PISCINA: readonly RivestimentoEsternoPiscina[] = ["doghe_legno_wpc", "pietra_naturale", "gres_effetto_pietra", "intonaco_liscio"];
export const SUPERFICI_RIPRISTINO_PISCINA: readonly SuperficieRipristinoPiscina[] = ["prato_raccordato", "deck_wpc", "solarium_gres", "pietra_naturale", "ghiaia_drenante"];
/** Misure reali ammesse (metri, dentro il bordo): fuori da qui il valore si ignora. */
export const MISURE_PISCINA_METRI = { lunghezza: { min: 2, max: 30 }, larghezza: { min: 1.5, max: 15 } } as const;
export type PiscinaImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface PiscinaPhotoMeta {
  width: number;
  height: number;
  orientation: PiscinaImageOrientation;
}

export interface ConfigInserimentoPiscina {
  zona: ZonaInserimentoPiscina;
  posizione_descrittiva?: string;
  footprint_apparente: DimensioneApparentePiscina;
  larghezza_apparente?: "ridotta" | "media" | "ampia" | "su_misura";
  lunghezza_apparente?: "corta" | "media" | "lunga" | "su_misura";
  profondita_apparente?: ProfonditaApparentePiscina;
  quota_bordo?: QuotaBordoPiscina;
  rapporto_con_casa?: string;
  rapporto_con_prato?: string;
  rapporto_con_deck?: string;
  interferenze_note?: string;
}

export interface PiscinaSpecConfig {
  tipo: TipoPiscina;
  forma: FormaPiscina;
  dimensione_apparente: DimensioneApparentePiscina;
  sistema_bordo: SistemaBordoPiscina;
  colore_acqua: ColoreAcquaPiscina;
  /** Misure reali della vasca in metri (dentro il bordo). Assenti = vale la dimensione apparente. */
  lunghezza_m?: number;
  larghezza_m?: number;
}

export interface PiscinaFinitureConfig {
  rivestimento_interno: RivestimentoInternoPiscina;
  coping: TipoCopingPiscina;
  area_perimetrale: AreaPerimetralePiscina;
  fuga_bordo?: "sottile" | "normale" | "invisibile";
  /** Pareti di una vasca rialzata. Assente = come oggi (il modello sceglie). */
  rivestimento_esterno?: RivestimentoEsternoPiscina;
  /** Solo rimozione: cosa va al posto della piscina. Assente = come il contesto della foto. */
  superficie_ripristino?: SuperficieRipristinoPiscina;
}

export interface PiscinaComfortConfig {
  accesso: SistemaAccessoPiscina;
  accessori: AccessorioPiscina[];
  illuminazione: "nessuna" | "subacquea_soft" | "perimetrale_calda" | "subacquea_e_perimetrale";
  arredo: "mantieni" | "aggiungi_minimo" | "rimuovi_superfluo";
}

export interface ConfigurazionePiscine {
  operazione: TipoOperazionePiscina;
  inserimento: ConfigInserimentoPiscina;
  piscina: PiscinaSpecConfig;
  finiture: PiscinaFinitureConfig;
  comfort: PiscinaComfortConfig;
  elementi_da_rimuovere?: string[];
  elementi_da_preservare?: string[];
  note_libere?: string;
}

export interface PiscinaSceneAnalysis {
  version: "1.0";
  outdoorAreaType: string;
  propertyType: string;
  houseAndFacade: string;
  existingLawnAndHardscape: string;
  topographyAndLevels: string;
  existingPoolOrWater: string;
  outdoorFurniture: string;
  boundariesAndWalls: string;
  vegetationAndTrees: string;
  pathsAndCirculation: string;
  lightAndShadows: string;
  availableInsertionSpace: string;
  obstacles: string[];
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: PiscinaImageOrientation;
}

export interface PiscinaTargetAreaMap {
  zone: ZonaInserimentoPiscina;
  targetDescription: string;
  footprint: string;
  orientation: string;
  leftRightLimits: string;
  frontBackLimits: string;
  circulationMargins: string[];
  preservedAdjacentAreas: string[];
  noExcavationZones: string[];
  mainViewAxis: string;
  /** «Note tecniche» del form (es. «non toccare l'ulivo a sinistra»): vincoli da rispettare. */
  installerNotes?: string;
}

export interface PiscinaBuildabilityEnvelope {
  plausibleSize: string;
  plausibleDepth: string;
  copingThickness: string;
  deckMargins: string;
  groundPlaneRelation: string;
  houseAndPathRelation: string;
  infinityFeasibility: "plausible" | "limited" | "not_plausible";
  rooftopFeasibility: "plausible" | "not_plausible";
  forbiddenPlacements: string[];
  /** Quota del bordo rispetto al terreno, se diversa da «a filo terreno» e coerente con la tipologia. */
  edgeHeight?: string;
}

export interface PiscinaTechnicalSpecification {
  poolTypology: TipoPiscina;
  poolGeometry: string;
  installationType: string;
  waterSystem: SistemaBordoPiscina;
  waterSystemDescription: string;
  interiorFinish: RivestimentoInternoPiscina;
  interiorFinishDescription: string;
  waterLookDescription: string;
  accessDescription: string;
  copingDescription: string;
  deckDescription: string;
  lightingDescription: string;
  accessoryDescriptions: string[];
}

export interface PiscinaReplacementManifest {
  operation: TipoOperazionePiscina;
  additions: string[];
  replacements: string[];
  recolors: string[];
  removals: string[];
  conversions: string[];
  preserveExactly: string[];
}

export interface PiscinaRenderConfig {
  legacy_config: ConfigurazionePiscine;
  photo_meta: PiscinaPhotoMeta | null;
  scene_analysis: PiscinaSceneAnalysis;
  target_pool_insertion_map: PiscinaTargetAreaMap;
  buildability_envelope: PiscinaBuildabilityEnvelope;
  technical_specification: PiscinaTechnicalSpecification;
  replacement_manifest: PiscinaReplacementManifest;
  water_realism_rules: string[];
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface PiscinaPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface PiscinaPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: PiscinaPromptValidationResult;
  normalizedConfig: PiscinaRenderConfig;
}
