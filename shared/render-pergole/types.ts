export type TipoOperazionePergola =
  | "add_new_pergola"
  | "replace_existing_awning_with_pergola"
  | "replace_existing_pergola"
  | "recolor_only"
  | "change_cover_only"
  | "add_side_closures"
  | "remove_side_closures"
  | "change_open_state";

export type TipoPergola =
  | "addossata"
  | "autoportante"
  | "bioclimatica_addossata"
  | "bioclimatica_autoportante"
  | "telo_addossata"
  | "telo_autoportante"
  | "vetro_addossata"
  | "vetro_autoportante"
  | "legno_addossata"
  | "legno_autoportante";

export type MaterialeStrutturaPergola =
  | "alluminio"
  | "alluminio_effetto_legno"
  | "legno_lamellare"
  | "acciaio"
  | "misto";

export type TipoCoperturaPergola =
  | "lamelle_orientabili"
  | "telo_retraibile"
  | "vetro"
  | "policarbonato"
  | "listelli_legno"
  | "copertura_opaca_tecnica";

export type StatoCoperturaPergola =
  | "chiusa"
  | "semi_aperta"
  | "aperta"
  | "lamelle_15"
  | "lamelle_30"
  | "lamelle_45"
  | "lamelle_90"
  | "telo_raccolto"
  | "telo_disteso";

export type TipoChiusuraLaterale =
  | "nessuna"
  | "vetrata_slide"
  | "screen_zip"
  | "tenda_tecnica"
  | "frangivento"
  | "pannelli_fissi"
  | "brise_soleil";

export type StatoChiusuraLaterale = "chiuse" | "parzialmente_aperte" | "aperte" | "raccolte";

export type TipoIlluminazionePergola =
  | "nessuna"
  | "strip_led_perimetrale"
  | "spot_integrati"
  | "downlight_lineari"
  | "applique_coordinate";

// Elenchi delle opzioni vere, costruiti da un Record sul tipo: se un valore entra
// nel tipo e non qui, TypeScript si ferma. Li usano i test (ogni opzione ha la sua
// foto o un motivo per non averla) e il form.
const tipiPergola: Record<TipoPergola, true> = {
  addossata: true, autoportante: true, bioclimatica_addossata: true, bioclimatica_autoportante: true,
  telo_addossata: true, telo_autoportante: true, vetro_addossata: true, vetro_autoportante: true,
  legno_addossata: true, legno_autoportante: true,
};
const materialiPergola: Record<MaterialeStrutturaPergola, true> = {
  alluminio: true, alluminio_effetto_legno: true, legno_lamellare: true, acciaio: true, misto: true,
};
const coperturePergola: Record<TipoCoperturaPergola, true> = {
  lamelle_orientabili: true, telo_retraibile: true, vetro: true, policarbonato: true, listelli_legno: true, copertura_opaca_tecnica: true,
};
const chiusurePergola: Record<TipoChiusuraLaterale, true> = {
  nessuna: true, vetrata_slide: true, screen_zip: true, tenda_tecnica: true, frangivento: true, pannelli_fissi: true, brise_soleil: true,
};
const luciPergola: Record<TipoIlluminazionePergola, true> = {
  nessuna: true, strip_led_perimetrale: true, spot_integrati: true, downlight_lineari: true, applique_coordinate: true,
};
export const TIPI_PERGOLA = Object.keys(tipiPergola) as TipoPergola[];
export const MATERIALI_PERGOLA = Object.keys(materialiPergola) as MaterialeStrutturaPergola[];
export const COPERTURE_PERGOLA = Object.keys(coperturePergola) as TipoCoperturaPergola[];
export const CHIUSURE_PERGOLA = Object.keys(chiusurePergola) as TipoChiusuraLaterale[];
export const LUCI_PERGOLA = Object.keys(luciPergola) as TipoIlluminazionePergola[];

export type ZonaInstallazionePergola =
  | "addossata_facciata"
  | "patio_centrale"
  | "terrazzo"
  | "bordo_piscina"
  | "giardino_relax"
  | "dining_outdoor"
  | "custom";

export type PergolaImageOrientation = "portrait" | "landscape" | "square" | "unknown";

export interface PergolaPhotoMeta {
  width: number;
  height: number;
  orientation: PergolaImageOrientation;
}

export interface ConfigInstallazionePergola {
  zona: ZonaInstallazionePergola;
  descrizione_zona?: string;
  addossata_si_no: boolean;
  distanza_da_facciata?: "aderente" | "entro_50cm" | "libera";
  larghezza_apparente?: "compatta" | "media" | "ampia" | "su_misura";
  profondita_apparente?: "ridotta" | "standard" | "profonda" | "su_misura";
  altezza_apparente?: "standard" | "alta" | "bassa_da_correggere";
  numero_montanti?: 2 | 4 | 6;
  posizione_montanti?: "angoli" | "frontali_visibili" | "arretrati" | "custom";
  ancoraggio_a_terra?: "pavimento" | "deck" | "prato_con_plinti" | "bordo_piscina" | "terrazzo";
  rapporto_con_porte_finestre?: string;
  interferenze_note?: string;
}

export interface PergolaStrutturaConfig {
  tipo: TipoPergola;
  materiale: MaterialeStrutturaPergola;
  colore_nome: string;
  colore_hex: string;
  finitura?: "opaca" | "satinata" | "lucida" | "effetto_legno";
  stile?: "minimal" | "tecnico" | "caldo" | "premium_contemporaneo" | "rustico";
}

export interface PergolaCoperturaConfig {
  tipo: TipoCoperturaPergola;
  stato: StatoCoperturaPergola;
  colore_telo_nome?: string;
  colore_telo_hex?: string;
  trasparenza?: "trasparente" | "satinato" | "fumé" | "opaco";
}

export interface PergolaChiusureConfig {
  tipo: TipoChiusuraLaterale;
  stato: StatoChiusuraLaterale;
  colore_nome?: string;
  colore_hex?: string;
}

export interface PergolaArredoConfig {
  gestisci_arredo: "mantieni" | "aggiungi_minimo" | "rimuovi_superfluo";
  uso_area: "relax" | "pranzo" | "salotto_outdoor" | "bordo_piscina" | "commerciale";
  note?: string;
}

export interface ConfigurazionePergole {
  operazione: TipoOperazionePergola;
  installazione: ConfigInstallazionePergola;
  struttura: PergolaStrutturaConfig;
  copertura: PergolaCoperturaConfig;
  chiusure_laterali: PergolaChiusureConfig;
  illuminazione: TipoIlluminazionePergola;
  arredo: PergolaArredoConfig;
  elementi_da_rimuovere?: string[];
  elementi_da_preservare?: string[];
  note_libere?: string;
}

export interface PergolaSceneAnalysis {
  version: "1.0";
  outdoorAreaType: string;
  propertyType: string;
  facadeVisible: string;
  doorsAndWindows: string;
  existingPaving: string;
  existingShadingSystems: string;
  parapetsAndBoundaries: string;
  outdoorFurniture: string;
  poolOrWater: string;
  obstacles: string[];
  lightAndShadows: string;
  availableInstallationSpace: string;
  untouchableElements: string[];
  contextToPreserve: string[];
  imageOrientation: PergolaImageOrientation;
}

export interface PergolaTargetAreaMap {
  zone: ZonaInstallazionePergola;
  targetDescription: string;
  footprint: string;
  rearAttachmentLine: string;
  frontEdge: string;
  leftRightLimits: string;
  clearances: string[];
  noOccupyZones: string[];
}

export interface PergolaInstallabilityEnvelope {
  structuralHeight: string;
  beamDepth: string;
  postCount: number;
  postPositions: string[];
  anchoringLogic: string;
  facadeRelation: string;
  openingClearance: string;
  drainageLogic: string;
  forbiddenPlacements: string[];
}

export interface PergolaTechnicalSpecification {
  typology: TipoPergola;
  wallMounted: boolean;
  material: MaterialeStrutturaPergola;
  materialDescription: string;
  colorDescription: string;
  structureLanguage: string;
  coverType: TipoCoperturaPergola;
  coverDescription: string;
  coverStateRule: string;
  sideClosureType: TipoChiusuraLaterale;
  sideClosureDescription: string;
  lightingDescription: string;
}

export interface PergolaReplacementManifest {
  operation: TipoOperazionePergola;
  additions: string[];
  replacements: string[];
  recolors: string[];
  removals: string[];
  conversions: string[];
  preserveExactly: string[];
}

export interface PergolaRenderConfig {
  legacy_config: ConfigurazionePergole;
  photo_meta: PergolaPhotoMeta | null;
  scene_analysis: PergolaSceneAnalysis;
  target_installation_map: PergolaTargetAreaMap;
  installability_envelope: PergolaInstallabilityEnvelope;
  technical_specification: PergolaTechnicalSpecification;
  replacement_manifest: PergolaReplacementManifest;
  integrity_constraints: string[];
  quality_directives: string[];
  notes: string;
}

export interface PergolaPromptValidationResult {
  isValid: boolean;
  missingSections: string[];
  missingBusinessRules: string[];
}

export interface PergolaPromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  validation: PergolaPromptValidationResult;
  normalizedConfig: PergolaRenderConfig;
}
