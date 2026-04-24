import { describe, expect, it } from "vitest";

import { DEFAULT_PISCINE_CONFIG } from "@/components/render-piscine/defaultPiscineConfig";
import { buildPiscinePrompt } from "@/modules/render-piscine/lib/piscinePromptBuilder";
import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";

function baseConfig(overrides: Partial<ConfigurazionePiscine> = {}): ConfigurazionePiscine {
  return {
    ...DEFAULT_PISCINE_CONFIG,
    ...overrides,
    inserimento: {
      ...DEFAULT_PISCINE_CONFIG.inserimento,
      ...overrides.inserimento,
    },
    piscina: {
      ...DEFAULT_PISCINE_CONFIG.piscina,
      ...overrides.piscina,
    },
    finiture: {
      ...DEFAULT_PISCINE_CONFIG.finiture,
      ...overrides.finiture,
    },
    comfort: {
      ...DEFAULT_PISCINE_CONFIG.comfort,
      ...overrides.comfort,
      accessori: overrides.comfort?.accessori ?? DEFAULT_PISCINE_CONFIG.comfort.accessori,
    },
  };
}

function promptText(config: ConfigurazionePiscine) {
  const result = buildPiscinePrompt(config as unknown as Record<string, unknown>);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("piscine render prompt", () => {
  it("creates an in-ground rectangular lawn pool with target map, buildability envelope and no floating pool", () => {
    const { result, text } = promptText(baseConfig());

    expect(text).toContain("target pool insertion map");
    expect(text).toContain("buildability envelope");
    expect(text).toContain("in-ground rectangular");
    expect(text).toContain("in-ground relation");
    expect(text).toContain("no floating shell");
    expect(text).toContain("coping must be visible");
    expect(result.validation.isValid).toBe(true);
  });

  it("replaces an existing rectangular pool with an organic one without hybrid edge states", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "replace_existing_pool",
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "interrata_organica", forma: "organica" },
    }));

    expect(text).toContain("remove the existing pool");
    expect(text).toContain("freeform organic pool");
    expect(text).toContain("no hybrid state");
    expect(text).toContain("old coping");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes overflow pools with high water level and no skimmer ambiguity", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "sfioro_rettangolare", sistema_bordo: "sfioro" },
    }));

    expect(text).toContain("overflow system");
    expect(text).toContain("water level very close");
    expect(text).toContain("no skimmer ambiguity");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes skimmer pools without inappropriate infinity or overflow rules", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, sistema_bordo: "skimmer" },
    }));

    expect(text).toContain("skimmer system");
    expect(text).toContain("waterline sits slightly below coping");
    expect(text).toContain("do not render an overflow/infinity edge");
    expect(result.validation.isValid).toBe(true);
  });

  it("makes beach shelf and lounge steps explicit as shallow and visible through water", () => {
    const { result, text } = promptText(baseConfig({
      comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, accesso: "spiaggetta" },
    }));

    expect(text).toContain("baja shelf");
    expect(text).toContain("shallow");
    expect(text).toContain("thinner transparent water");
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps geometry untouched when changing only water look or liner", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "recolor_waterlook_or_liner_only",
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro" },
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, colore_acqua: "blu_profondo" },
    }));

    expect(text).toContain("waterlook/liner-only");
    expect(text).toContain("preserve exact pool shape");
    expect(text).toContain("footprint");
    expect(text).toContain("coping");
    expect(result.validation.isValid).toBe(true);
  });

  it("changes only coping while preserving basin and footprint", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "change_coping_only",
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, coping: "bordo_sottile_moderno" },
    }));

    expect(text).toContain("coping-only");
    expect(text).toContain("no footprint change");
    expect(text).toContain("no basin shape change");
    expect(text).toContain("strict scope");
    expect(text).toContain("preserve existing access features exactly");
    expect(text).not.toContain("access detail:");
    expect(result.normalizedConfig.replacement_manifest.additions.join(" ").toLowerCase()).not.toContain("access");
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps waterlook-only free from access, coping, lighting and furniture additions", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "recolor_waterlook_or_liner_only",
      comfort: {
        ...DEFAULT_PISCINE_CONFIG.comfort,
        accesso: "spiaggetta",
        illuminazione: "subacquea_soft",
        arredo: "aggiungi_minimo",
      },
    }));

    expect(text).toContain("waterlook/liner-only");
    expect(text).toContain("strict scope");
    expect(result.normalizedConfig.replacement_manifest.additions).toHaveLength(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("removes an existing pool with ground or hardscape restoration and no ghost remnants", () => {
    const { result, text } = promptText(baseConfig({ operazione: "remove_existing_pool" }));

    expect(text).toContain("remove the existing pool completely");
    expect(text).toContain("restore");
    expect(text).toContain("no residual basin ghost");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes premium above-ground pool with base/support integration, not cheap inflatable output", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "fuori_terra_premium" },
      inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "fuori_terra" },
    }));

    expect(text).toContain("above-ground");
    expect(text).toContain("premium base");
    expect(text).toContain("never cheap or inflatable");
    expect(result.validation.isValid).toBe(true);
  });

  it("flags an infinity edge in an incompatible flat garden context", () => {
    const { result, text } = promptText(baseConfig({
      inserimento: {
        ...DEFAULT_PISCINE_CONFIG.inserimento,
        zona: "giardino_centrale",
        posizione_descrittiva: "giardino piatto chiuso da recinzioni senza vista o dislivello",
      },
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "infinity_pool", sistema_bordo: "infinity_edge" },
    }));

    expect(text).toContain("infinity feasibility: limited");
    expect(text).toContain("if context is flat and enclosed");
    expect(result.validation.isValid).toBe(false);
  });
});
