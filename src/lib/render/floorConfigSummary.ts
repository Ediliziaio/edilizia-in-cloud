import { floorUsesTileFormat, inferVisualEffect, woodEssenceApplies } from "../../../shared/render-floor/floorReplacementRules";
import type { EffettoVisivoPavimento, TipoPavimento } from "../../../shared/render-floor/types";

const INTERNAL_CONFIG_KEY_RE = /(schema|prompt|provider|openai|gemini|model|cost|costo|addeb|billing|token|api|manifest|rules|directives|analysis|analisi)/i;
const KNOWN_TYPES = new Set<string>(["parquet_massello", "parquet_prefinito", "laminato", "gres_porcellanato", "ceramica", "marmo", "pietra_naturale", "vinile_lvt", "cotto", "cemento_resina", "resina_continua", "microcemento", "moquette", "terrazzo_veneziano"]);
const CONTINUOUS_TYPES = new Set<string>(["cemento_resina", "resina_continua", "microcemento", "moquette"]);
export type FloorSummaryEntry = [string, string | number | boolean];

/** Organizza solo la lettura dello storico: non normalizza né riscrive la configurazione. */
export function floorConfigSummary(config: Record<string, unknown>) {
  const active: FloorSummaryEntry[] = [];
  const other: FloorSummaryEntry[] = [];
  const known = typeof config.tipo === "string" && KNOWN_TYPES.has(config.tipo);
  const type = config.tipo as TipoPavimento;
  const effect = inferVisualEffect(type, config.effetto_visivo as EffettoVisivoPavimento | undefined);
  const usesTileFormat = known && floorUsesTileFormat(type) && typeof config.formato_piastrella === "string" && /^\d+x\d+$/.test(config.formato_piastrella);
  for (const [key, value] of Object.entries(config)) {
    if (INTERNAL_CONFIG_KEY_RE.test(key) || value === "" || value == null || !["string", "number", "boolean"].includes(typeof value)) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    const secondary = key === "colore_mode" || (known && (
      (key === "essenza_legno" && !woodEssenceApplies(type, effect)) ||
      (["larghezza_listello_mm", "lunghezza_listello_mm"].includes(key) && (usesTileFormat || CONTINUOUS_TYPES.has(type))) ||
      (key === "formato_piastrella" && !floorUsesTileFormat(type))
    ));
    (secondary ? other : active).push([key, value as string | number | boolean]);
  }
  return { active, other };
}
