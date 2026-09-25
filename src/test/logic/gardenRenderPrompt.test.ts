import { describe, expect, it } from "vitest";

import { buildGardenPrompt } from "../../../shared/render-garden/gardenPromptBuilder";
import type { ConfigurazioneGiardino } from "../../../shared/render-garden/types";

function baseConfig(overrides: Partial<ConfigurazioneGiardino> = {}): ConfigurazioneGiardino {
  const defaultPrato = { attivo: true, tipo: "prato_resistente" };
  const defaultAiuole = { attivo: true, tipo: "perimetrale", densita: "media", palette: "verde_strutturale" };
  const defaultSiepi = { attivo: false, tipo: "schermante_media", altezza: "media" };
  const defaultAlberi = { attivo: false, quantita: 2, scala: "media", portamento: "ornamentale" };
  const defaultCamminamenti = { attivo: false, tipo: "stepping_stones" };
  const defaultGroundCover = { attivo: false, tipo: "ghiaia" };
  const defaultArredo = { modalita: "mantieni" };
  const {
    prato,
    aiuole,
    siepi,
    alberi,
    camminamenti,
    ground_cover,
    arredo,
    ...restOverrides
  } = overrides;

  return {
    stile: "contemporaneo",
    interventi: ["restyling_completo"],
    target_zones: ["prato_principale", "perimetro"],
    illuminazione: "nessuna",
    declutter: false,
    elementi_da_preservare: ["facciata", "recinzione"],
    elementi_da_rimuovere: [],
    note_libere: "",
    ...restOverrides,
    prato: { ...defaultPrato, ...prato },
    aiuole: { ...defaultAiuole, ...aiuole },
    siepi: { ...defaultSiepi, ...siepi },
    alberi: { ...defaultAlberi, ...alberi },
    camminamenti: { ...defaultCamminamenti, ...camminamenti },
    ground_cover: { ...defaultGroundCover, ...ground_cover },
    arredo: { ...defaultArredo, ...arredo },
  };
}

const compactGardenAnalysis = {
  outdoorSpaceType: "small residential back garden",
  apparentSize: "compact narrow garden",
  houseRelation: "garden attached to the rear facade",
  existingLawn: "patchy existing lawn",
  patioDeckHardscape: "small patio near the house",
  pool: "no pool visible",
  pergola: "no pergola visible",
  mainViewCorridors: "view from patio toward back fence",
};

function promptText(config: ConfigurazioneGiardino, analysis: Record<string, unknown> = compactGardenAnalysis) {
  const result = buildGardenPrompt(config as unknown as Record<string, unknown>, analysis);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("garden render prompt", () => {
  it("handles lawn-only renovation without adding beds, trees, hedges or paths", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["rifacimento_prato"],
      target_zones: ["prato_principale"],
      aiuole: { attivo: false, tipo: "perimetrale", densita: "media" },
      siepi: { attivo: false, tipo: "schermante_media" },
      alberi: { attivo: false },
      camminamenti: { attivo: false, tipo: "stepping_stones" },
      ground_cover: { attivo: false, tipo: "ghiaia" },
    }));

    expect(text).toContain("replace/refresh the lawn only");
    expect(text).toContain("do not add planting beds unless targeted");
    expect(text).toContain("do not add trees");
    expect(text).toContain("do not invent new paths");
    expect(text).toContain("non-target hardscape");
    expect(result.validation.isValid).toBe(true);
  });

  it("adds perimeter beds with medium shrubs, bed depth and no path blockage", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["aggiunta_aiuole"],
      target_zones: ["perimetro"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: true, tipo: "perimetrale", densita: "media", palette: "fioriture_controllate" },
    }));

    expect(text).toContain("perimeter planting beds");
    expect(text).toContain("believable width/depth");
    expect(text).toContain("mature spacing");
    expect(text).toContain("no invasion of paths");
    expect(result.validation.isValid).toBe(true);
  });

  it("adds screening hedge along boundaries without facade/window conflict", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["aggiunta_siepi"],
      target_zones: ["perimetro"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: false, tipo: "perimetrale", densita: "media" },
      siepi: { attivo: true, tipo: "schermante_alta", altezza: "alta" },
    }));

    expect(text).toContain("tall screening hedge");
    expect(text).toContain("screen where requested");
    expect(text).toContain("facade readability");
    expect(text).toContain("windows and door clearances");
    expect(result.validation.isValid).toBe(true);
  });

  it("adds two ornamental trees with realistic scale and shadow logic", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["aggiunta_alberi"],
      target_zones: ["angolo_vuoto"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: false, tipo: "perimetrale", densita: "media" },
      alberi: { attivo: true, quantita: 2, scala: "piccola", portamento: "ornamentale" },
    }));

    expect(text).toContain("add 2 ornamental tree");
    expect(text).toContain("realistic scale");
    expect(text).toContain("canopy shadow");
    expect(text).toContain("no conflict with house");
    expect(result.validation.isValid).toBe(true);
  });

  it("creates stepping stones path with circulation continuity and lawn integration", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["aggiunta_camminamenti"],
      target_zones: ["area_camminamento", "prato_principale"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: false, tipo: "perimetrale", densita: "media" },
      camminamenti: { attivo: true, tipo: "stepping_stones" },
    }));

    expect(text).toContain("stepping stones path");
    expect(text).toContain("connect logical access points");
    expect(text).toContain("integration with lawn");
    expect(text).toContain("no random curvature");
    expect(result.validation.isValid).toBe(true);
  });

  it("declutters only weak garden items while preserving usable identity", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["declutter"],
      target_zones: ["prato_principale"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: false, tipo: "perimetrale", densita: "media" },
      declutter: true,
      elementi_da_rimuovere: ["vecchi vasi rotti", "ramaglie sparse"],
    }));

    expect(text).toContain("remove only selected clutter");
    expect(text).toContain("preserve the garden's usable identity");
    expect(text).toContain("do not create an empty sterile space");
    expect(result.validation.isValid).toBe(true);
  });

  it("preserves pool when garden work is poolside but pool is not targeted", () => {
    const { result, text } = promptText(baseConfig({
      interventi: ["bordo_piscina_verde", "aggiunta_aiuole"],
      target_zones: ["bordo_piscina"],
      prato: { attivo: false, tipo: "prato_resistente" },
      aiuole: { attivo: true, tipo: "bordo_piscina", densita: "bassa", palette: "mediterranea" },
    }), {
      ...compactGardenAnalysis,
      pool: "existing rectangular pool with coping and deck",
      patioDeckHardscape: "pool deck and patio",
    });

    expect(text).toContain("poolside planting");
    expect(text).toContain("preserve pool basin");
    expect(text).toContain("coping");
    expect(text).toContain("no plant spill into water");
    expect(result.validation.isValid).toBe(true);
  });

  it("coordinates a full minimal modern garden restyling with density control", () => {
    const { result, text } = promptText(baseConfig({
      stile: "moderno_minimale",
      interventi: ["restyling_completo", "upgrade_area_relax"],
      target_zones: ["prato_principale", "perimetro", "area_relax", "area_camminamento"],
      camminamenti: { attivo: true, tipo: "lastre_modulari" },
      illuminazione: "segnapasso",
      arredo: { modalita: "aggiungi_minimo" },
    }));

    expect(text).toContain("minimal modern garden");
    expect(text).toContain("controlled density");
    expect(text).toContain("clean edges");
    expect(text).toContain("breathing-space zones");
    expect(text).toContain("complete restyling coordinates");
    expect(result.validation.isValid).toBe(true);
  });
});
