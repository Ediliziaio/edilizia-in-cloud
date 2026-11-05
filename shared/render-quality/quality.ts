export type QualitaRender = "standard" | "alta";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Valori precedenti o sconosciuti conservano la qualità Standard. */
export function qualitaImmagineRender(value: unknown): "medium" | "high" {
  const r = record(value);
  const cfg = record(r.config);
  const selected = r.qualita_render ?? cfg.qualita_render ?? record(cfg.legacy_config).qualita_render ?? record(r.legacy_config).qualita_render;
  return selected === "alta" ? "high" : "medium";
}

/** Un'unica scadenza include preparazione, generazione e riserva per QA/upload. */
export function parametriQualitaRender(value: unknown, startedAt: number, direct = false, now = Date.now()) {
  const openaiQuality = qualitaImmagineRender(value);
  const high = openaiQuality === "high";
  const directProviderOnly = direct || high;
  const remaining = 140_000 - (now - startedAt) - 20_000;
  if (remaining < 10_000) throw new Error("Tempo disponibile esaurito: riprova il render. Il credito viene restituito.");
  return {
    openaiQuality,
    directProviderOnly,
    timeoutMs: Math.min(remaining, Math.max(10_000, Math.min(high ? 110_000 : 75_000, Math.floor(remaining / (directProviderOnly ? 1 : 2))))),
  };
}

export function tempoQaRender(startedAt: number, now = Date.now()) {
  return Math.max(1_000, Math.min(18_000, 140_000 - (now - startedAt) - 8_000));
}
