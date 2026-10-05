import {
  DEFAULT_INTEGRITY_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  INTEGRITY_CONSTRAINTS_RUGS_REMOVED,
} from "./promptFragments.ts";
import { buildFloorCoverageMap, normalizeFloorSceneAnalysis } from "./floorSceneAnalysis.ts";
import {
  buildFloorMaterialSpecification,
  buildFloorReplacementManifest,
  floorUsesTileFormat,
  inferVisualEffect,
  woodEssenceApplies,
} from "./floorReplacementRules.ts";
import { TAPPETI_PAVIMENTO } from "./types.ts";
import type {
  ConfigurazionePavimento,
  FloorPhotoMeta,
  FloorRenderConfig,
  TappetiPavimento,
  TipoPavimento,
} from "./types.ts";

type BattiscopaConfig = NonNullable<ConfigurazionePavimento["battiscopa"]>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOr(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTipo(value: unknown): TipoPavimento {
  const allowed: TipoPavimento[] = [
    "parquet_massello",
    "parquet_prefinito",
    "laminato",
    "gres_porcellanato",
    "ceramica",
    "marmo",
    "pietra_naturale",
    "vinile_lvt",
    "cotto",
    "cemento_resina",
    "resina_continua",
    "microcemento",
    "moquette",
    "terrazzo_veneziano",
  ];
  return allowed.includes(value as TipoPavimento) ? value as TipoPavimento : "gres_porcellanato";
}

/**
 * Formato in centimetri: solo per i pavimenti a piastrelle. Il form lascia nel config il
 * formato del materiale scelto prima (un parquet poteva portarsi dietro «120x120», che il
 * rewriter doveva poi citare e la validazione pretendeva da lastra grande); il pavimento
 * della stanza ha anche «continuo» e «listelli_standard», che finivano in «continuo cm modules».
 * Assente resta «60x60», come prima.
 */
function normalizeTileFormat(tipo: TipoPavimento, value: unknown): string | undefined {
  if (!floorUsesTileFormat(tipo)) return undefined;
  if (typeof value !== "string") return "60x60";
  const formato = value.trim();
  return /^\d+x\d+$/.test(formato) ? formato : undefined;
}

export function normalizeFloorLegacyConfig(raw?: unknown): ConfigurazionePavimento {
  const source = asRecord(raw);
  const battiscopa = asRecord(source.battiscopa);
  const tipo = normalizeTipo(source.tipo);
  const effettoVisivo = source.effetto_visivo as ConfigurazionePavimento["effetto_visivo"] | undefined;
  const essenza = source.essenza_legno as ConfigurazionePavimento["essenza_legno"] | undefined;

  return {
    tipo,
    finitura: (source.finitura as ConfigurazionePavimento["finitura"]) || "opaco",
    colore_mode: (source.colore_mode as ConfigurazionePavimento["colore_mode"]) || "free",
    colore_nome: typeof source.colore_nome === "string" ? source.colore_nome : "Grigio chiaro",
    colore_hex: typeof source.colore_hex === "string" ? source.colore_hex : "#b0b0b0",
    colore_ral: typeof source.colore_ral === "string" ? source.colore_ral : undefined,
    effetto_visivo: effettoVisivo,
    // Un'essenza rimasta da un parquet non descrive un marmo o un gres effetto cemento.
    essenza_legno: essenza && woodEssenceApplies(tipo, inferVisualEffect(tipo, effettoVisivo)) ? essenza : undefined,
    variazione_tono: (source.variazione_tono as ConfigurazionePavimento["variazione_tono"]) || "naturale",
    bisellatura: (source.bisellatura as ConfigurazionePavimento["bisellatura"]) || "microbisello",
    direzione_posa: (source.direzione_posa as ConfigurazionePavimento["direzione_posa"]) || "segue_prospettiva",
    scala_pattern: (source.scala_pattern as ConfigurazionePavimento["scala_pattern"]) || "standard",
    soglie_porte: (source.soglie_porte as ConfigurazionePavimento["soglie_porte"]) || "mantieni",
    giunto_perimetrale: (source.giunto_perimetrale as ConfigurazionePavimento["giunto_perimetrale"]) || "standard_nascosto",
    fasce_bordo: (source.fasce_bordo as ConfigurazionePavimento["fasce_bordo"]) || "nessuna",
    pattern_posa: (source.pattern_posa as ConfigurazionePavimento["pattern_posa"]) || "a_correre",
    formato_piastrella: normalizeTileFormat(tipo, source.formato_piastrella),
    larghezza_listello_mm: numberOr(source.larghezza_listello_mm, undefined),
    lunghezza_listello_mm: numberOr(source.lunghezza_listello_mm, undefined),
    fuga_larghezza_mm: numberOr(source.fuga_larghezza_mm, 2),
    fuga_colore: (source.fuga_colore as ConfigurazionePavimento["fuga_colore"]) || "grigio_chiaro",
    // Facoltativo: assente = i tappeti restano, come prima che la scelta esistesse.
    tappeti: TAPPETI_PAVIMENTO.includes(source.tappeti as TappetiPavimento) ? source.tappeti as TappetiPavimento : undefined,
    battiscopa: {
      azione: (battiscopa.azione as BattiscopaConfig["azione"]) || "mantieni",
      tipo: battiscopa.tipo as BattiscopaConfig["tipo"] | undefined,
      altezza_cm: battiscopa.altezza_cm as 6 | 8 | 10 | undefined,
    },
    note_libere: typeof source.note_libere === "string" ? source.note_libere : "",
  };
}

export function buildFloorRenderConfig(
  rawConfig?: unknown,
  options?: {
    sceneAnalysis?: unknown;
    photoMeta?: FloorPhotoMeta | null;
  },
): FloorRenderConfig {
  const legacyConfig = normalizeFloorLegacyConfig(rawConfig);
  const scene = normalizeFloorSceneAnalysis(options?.sceneAnalysis);
  const rimuoviTappeti = legacyConfig.tappeti === "rimuovi";
  const coverage = buildFloorCoverageMap(scene, { rimuoviTappeti });
  const spec = buildFloorMaterialSpecification(legacyConfig);
  const manifest = buildFloorReplacementManifest(legacyConfig, scene, coverage, spec);

  return {
    legacy_config: legacyConfig,
    scene_analysis: scene,
    coverage_map: coverage,
    replacement_manifest: manifest,
    technical_specification: spec,
    integrity_constraints: rimuoviTappeti ? INTEGRITY_CONSTRAINTS_RUGS_REMOVED : DEFAULT_INTEGRITY_CONSTRAINTS,
    quality_directives: DEFAULT_QUALITY_DIRECTIVES,
    photo_meta: options?.photoMeta ?? null,
    notes: legacyConfig.note_libere,
  };
}

export function ensureFloorRenderConfig(
  rawConfig?: unknown,
  rawAnalysis?: unknown,
  photoMeta?: FloorPhotoMeta | null,
): FloorRenderConfig {
  const source = asRecord(rawConfig);
  if (
    source.scene_analysis &&
    source.coverage_map &&
    source.replacement_manifest &&
    source.technical_specification
  ) {
    return rawConfig as FloorRenderConfig;
  }

  return buildFloorRenderConfig(rawConfig, {
    sceneAnalysis: rawAnalysis,
    photoMeta,
  });
}
