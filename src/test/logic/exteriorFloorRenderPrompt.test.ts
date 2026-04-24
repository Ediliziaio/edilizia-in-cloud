import { describe, expect, it } from "vitest";

import { buildPavimentiEsterniPrompt } from "@/modules/render-pavimenti-esterni/lib/promptBuilder";
import type { ConfigurazionePavimentoEsterno } from "@/modules/render-pavimenti-esterni/lib/types";

function baseConfig(overrides: Partial<ConfigurazionePavimentoEsterno> = {}): ConfigurazionePavimentoEsterno {
  return {
    operazione: "replace_existing_surface",
    inserimento: {
      area_target: "patio",
      posizione_descrittiva: "patio davanti alla casa",
      quota_apparente: "a_filo",
      rapporto_con_casa: "soglia porta-finestra da rispettare",
      rapporto_con_prato: "prato laterale da preservare",
      pendenza_apparente: "leggera_verso_giardino",
      drenaggio_percepito: "pendenza_naturale",
      ...overrides.inserimento,
    },
    materiale: "lastre_grande_formato",
    finitura: "antiscivolo",
    colore_nome: "Grigio caldo outdoor",
    formato: "120x120",
    pattern_posa: "rettilineo",
    giunto: "fuga_sottile",
    larghezza_giunto_mm: 2,
    colore_giunto: "tono su tono",
    bordo: "fascia_perimetrale",
    gradino: "nessuno",
    uso: "pedonale",
    elementi_da_preservare: ["facciata", "porte-finestre"],
    note_libere: "",
    ...overrides,
  };
}

function promptText(config: ConfigurazionePavimentoEsterno) {
  const result = buildPavimentiEsterniPrompt(config as unknown as Record<string, unknown>);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("exterior floor render prompt", () => {
  it("replaces old patio tiles with large-format outdoor porcelain respecting thresholds", () => {
    const { result, text } = promptText(baseConfig({
      materiale: "gres_outdoor",
      formato: "120x120",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("target surface map");
    expect(text).toContain("large slabs require sparse joint density");
    expect(text).toContain("remove old surface pattern");
    expect(text).toContain("door thresholds");
    expect(text).toContain("no impossible raised lip");
  });

  it("changes only pool coping to travertine while preserving basin and adjacent deck", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "change_coping_only",
      inserimento: { area_target: "bordo_piscina", rapporto_con_piscina: "piscina rettangolare esistente da preservare" },
      materiale: "coping_bordo_piscina",
      bordo: "coping_piscina_moderno",
      uso: "bordo_piscina",
      coping_materiale: "travertino",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("coping-only");
    expect(text).toContain("preserve pool basin");
    expect(text).toContain("waterline");
    expect(text).toContain("clean transition to adjacent deck");
  });

  it("converts patio to WPC deck with board direction and open gaps", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "convert_to_deck",
      materiale: "deck_wpc",
      pattern_posa: "doga_parallela",
      giunto: "giunto_aperto_deck",
      formato: "doghe 145 mm",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("deck board direction");
    expect(text).toContain("open-gap");
    expect(text).toContain("no old tile grid");
    expect(text).toContain("do not render as gres effetto legno");
  });

  it("renders natural stone walkway with variation and plausible edge cuts", () => {
    const { result, text } = promptText(baseConfig({
      inserimento: { area_target: "camminamento", rapporto_con_prato: "prato su entrambi i lati" },
      materiale: "pietra_naturale",
      finitura: "fiammato",
      pattern_posa: "opus",
      giunto: "fuga_larga",
      uso: "camminamento_giardino",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("natural stone");
    expect(text).toContain("mineral variation");
    expect(text).toContain("opus");
    expect(text).toContain("plausible perimeter cuts");
  });

  it("changes only exterior steps with tread and riser continuity while preserving flat surface", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "change_steps_only",
      gradino: "pedata_alzata_coordinate",
      inserimento: { area_target: "ingresso_esterno", rapporto_con_gradini: "tre gradini esterni visibili" },
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("change only exterior steps");
    expect(text).toContain("tread/riser continuity");
    expect(text).toContain("flat surface preserved");
  });

  it("uses driveway-capable paver logic for vehicular interlocking pavers", () => {
    const { result, text } = promptText(baseConfig({
      inserimento: { area_target: "vialetto" },
      materiale: "masselli_autobloccanti",
      pattern_posa: "massello_spina",
      giunto: "sabbia_polimerica",
      uso: "carrabile_intensa",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("vehicular");
    expect(text).toContain("driveway-capable");
    expect(text).toContain("interlocking pavers");
    expect(text).toContain("no fragile decorative-only");
  });

  it("preserves geometry and pattern on recolor/refinish only", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "recolor_or_refinish_only",
      colore_nome: "Beige sabbiato",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("recolor/refinish only");
    expect(text).toContain("preserve exact pattern");
    expect(text).toContain("no replacement of pattern");
  });

  it("removes old grid when replacing with continuous exterior concrete", () => {
    const { result, text } = promptText(baseConfig({
      materiale: "cemento_architettonico",
      finitura: "lavato",
      giunto: "nessuno_visibile",
      formato: "campi continui con tagli architettonici minimi",
    }));

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("previous grid traces must disappear completely");
    expect(text).toContain("clean transitions");
    expect(text).toContain("do not leave hybrid old/new paving states");
  });
});
