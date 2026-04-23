import { describe, expect, it } from "vitest";

import { DEFAULT_PAVIMENTO_CONFIG } from "@/components/render-pavimento/defaultPavimentoConfig";
import { buildFloorPrompt } from "../../../shared/render-floor/floorPromptBuilder.ts";
import { buildFloorRenderConfig } from "../../../shared/render-floor/floorRenderConfig.ts";
import type { ConfigurazionePavimento } from "../../../shared/render-floor/types.ts";

function cloneConfig(): ConfigurazionePavimento {
  return structuredClone(DEFAULT_PAVIMENTO_CONFIG);
}

function baseAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    tipo_stanza: "soggiorno",
    pavimento_attuale: "old beige ceramic tiles",
    colore_attuale: "beige",
    dimensione_stimata: "medium living room",
    stato_conservazione: "worn but regular",
    battiscopa_presente: true,
    current_floor_format: "30x30 ceramic tiles",
    has_visible_joints: true,
    visible_floor_area: "entire living-room floor from foreground to back wall",
    floor_perimeter_geometry: "floor bounded by two walls, sofa legs and a door threshold",
    thresholds_visible: true,
    steps_visible: false,
    rugs_present: false,
    obstacles: ["sofa legs", "coffee table", "low cabinet"],
    light_quality: "soft daylight from left window with mild floor reflections",
    preserved_elements: ["walls", "sofa", "coffee table", "window", "door"],
    note: "keep the room unchanged and replace only the floor",
    ...overrides,
  };
}

describe("floor render pipeline", () => {
  it("removes old tile grout completely when resin is selected", () => {
    const config = cloneConfig();
    config.tipo = "resina_continua";
    config.effetto_visivo = "resina";
    config.fuga_larghezza_mm = 0;

    const renderConfig = buildFloorRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.technical_specification.isSeamless).toBe(true);
    expect(renderConfig.replacement_manifest.removals.join(" ").toLowerCase()).toContain("old grout");

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("absolutely no grout lines");
    expect(prompt.userPrompt.toLowerCase()).toContain("ghost grid");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes classic parquet herringbone without confusing it with Hungarian point", () => {
    const config = cloneConfig();
    config.tipo = "parquet_massello";
    config.effetto_visivo = "legno";
    config.essenza_legno = "rovere_naturale";
    config.pattern_posa = "spina_di_pesce";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("classic herringbone");
    expect(prompt.userPrompt.toLowerCase()).toContain("90 degrees");
    expect(prompt.userPrompt.toLowerCase()).toContain("not chevron-cut ends");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes Hungarian point with angled chevron-cut ends", () => {
    const config = cloneConfig();
    config.tipo = "parquet_prefinito";
    config.effetto_visivo = "legno";
    config.pattern_posa = "spina_ungherese";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("hungarian point");
    expect(prompt.userPrompt.toLowerCase()).toContain("chevron");
    expect(prompt.userPrompt.toLowerCase()).toContain("strip ends are cut");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves large slab scale for 120x120 gres with 2mm tone-on-tone grout", () => {
    const config = cloneConfig();
    config.tipo = "gres_porcellanato";
    config.formato_piastrella = "120x120";
    config.scala_pattern = "maxi_lastre";
    config.fuga_larghezza_mm = 2;
    config.fuga_colore = "tono_su_tono";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("120x120 cm modules");
    expect(prompt.userPrompt.toLowerCase()).toContain("large-format scale");
    expect(prompt.userPrompt.toLowerCase()).toContain("tone-on-tone grout");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("treats carpet as a continuous textile surface with no modules", () => {
    const config = cloneConfig();
    config.tipo = "moquette";
    config.effetto_visivo = "tessile";
    config.fuga_larghezza_mm = 0;

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("wall-to-wall carpet");
    expect(prompt.userPrompt.toLowerCase()).toContain("continuous textile");
    expect(prompt.userPrompt.toLowerCase()).toContain("no modules");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds continuous baseboard rules when skirting is replaced", () => {
    const config = cloneConfig();
    config.battiscopa = {
      azione: "sostituisci",
      tipo: "coordinato_pavimento",
      altezza_cm: 8,
    };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("replace baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("run the new baseboard continuously");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes skirting with clean wall-floor repair", () => {
    const config = cloneConfig();
    config.battiscopa = { azione: "rimuovi" };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("remove the visible baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("repair the wall-floor junction");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps existing skirting unchanged when requested", () => {
    const config = cloneConfig();
    config.battiscopa = { azione: "mantieni" };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("keep the existing baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("same color, material, height");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes marble with natural veining and polished depth", () => {
    const config = cloneConfig();
    config.tipo = "marmo";
    config.effetto_visivo = "marmo";
    config.finitura = "lucido";
    config.formato_piastrella = "120x240";
    config.scala_pattern = "maxi_lastre";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("natural marble");
    expect(prompt.userPrompt.toLowerCase()).toContain("natural veining");
    expect(prompt.userPrompt.toLowerCase()).toContain("polished depth");
    expect(prompt.validation.isValid).toBe(true);
  });
});
