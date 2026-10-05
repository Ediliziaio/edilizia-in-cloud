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

/** Ante per apertura: 1 o 2 per i tipi a battente, 4 o 6 pannelli per l'«a libro». Assente = come in foto / due ante. */
export type NumeroAntePersiana = 1 | 2 | 4 | 6;

/** Lamelle fisse o orientabili (con asta di comando): la «linea» del listino persiane. */
export type MovimentoLamelle = "fisse" | "orientabili";

/** Cassonetto di tapparella e veneziana esterna: a vista sulla facciata o nascosto nel muro. */
export type CassonettoPersiana = "esterno_a_vista" | "a_scomparsa";

/** Quante ante può avere ogni tipo (i tipi assenti non hanno ante da contare). */
export const ANTE_PER_TIPO: Partial<Record<TipoPersiana, NumeroAntePersiana[]>> = {
  veneziana_classica: [1, 2],
  scuro_pieno: [1, 2],
  scuro_cornice: [1, 2],
  gelosia: [1, 2],
  a_libro: [4, 6],
};

/** Tipi dove fisse/orientabili è una scelta (la gelosia è fissa per definizione, la veneziana esterna orientabile). */
export const TIPI_MOVIMENTO_LAMELLE = new Set<TipoPersiana>(["veneziana_classica", "brise_soleil"]);

/** Tipi con un cassonetto: scorrono su guide e si avvolgono in alto. */
export const TIPI_CON_CASSONETTO = new Set<TipoPersiana>(["avvolgibile_esterno", "veneziana_esterna"]);

/** Il numero di ante vale per questo tipo? */
export function anteCompatibili(tipo: TipoPersiana | null | undefined, numero: number | null | undefined): numero is NumeroAntePersiana {
  return Boolean(tipo && numero && ANTE_PER_TIPO[tipo]?.includes(numero as NumeroAntePersiana));
}

/** Effetti legno del form (colore_mode = "legno"); "rovere_chiaro" è il default del motore. */
export type EffettoLegnoPersiana = "rovere_chiaro" | "rovere_scuro" | "noce_nazionale" | "castagno" | "douglas";

// Elenchi delle opzioni vere, costruiti da un Record sul tipo: se un valore entra
// nel tipo e non qui, TypeScript si ferma. Li usano i test (ogni opzione ha la sua
// foto o un motivo per non averla) e il form.
const tipiPersiana: Record<TipoPersiana, true> = {
  veneziana_classica: true, veneziana_esterna: true, scuro_pieno: true, scuro_cornice: true, gelosia: true,
  avvolgibile_esterno: true, a_libro: true, griglia_sicurezza: true, brise_soleil: true,
};
const materialiPersiana: Record<MaterialePersiana, true> = {
  legno_naturale: true, legno_composito: true, alluminio: true, pvc: true, acciaio: true, fibra_vetro: true,
};
const effettiLegno: Record<EffettoLegnoPersiana, true> = {
  rovere_chiaro: true, rovere_scuro: true, noce_nazionale: true, castagno: true, douglas: true,
};
const ferramentePersiana: Record<PersianaFerramentaFinitura, true> = {
  verniciata_tinta: true, nero_opaco: true, acciaio_satinato: true, ferro_micaceo: true, bronzo_scuro: true,
};
const installazioniPersiana: Record<PersianaInstallazione, true> = {
  cardini_tradizionali: true, su_telaio: true, guide_laterali: true, brackets_architettonici: true,
};
export const TIPI_PERSIANA = Object.keys(tipiPersiana) as TipoPersiana[];
export const MATERIALI_PERSIANA = Object.keys(materialiPersiana) as MaterialePersiana[];
export const EFFETTI_LEGNO_PERSIANA = Object.keys(effettiLegno) as EffettoLegnoPersiana[];
export const FERRAMENTE_PERSIANA = Object.keys(ferramentePersiana) as PersianaFerramentaFinitura[];
export const INSTALLAZIONI_PERSIANA = Object.keys(installazioniPersiana) as PersianaInstallazione[];

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
    /** Assente = non specificato (il prompt non ne parla, come prima). */
    movimento?: MovimentoLamelle;
  };
  /** Assente = come in foto, o due ante (vedi buildLeafConfiguration). */
  numero_ante?: NumeroAntePersiana;
  /** Solo tapparella e veneziana esterna; assente = non specificato. */
  cassonetto?: CassonettoPersiana;
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
