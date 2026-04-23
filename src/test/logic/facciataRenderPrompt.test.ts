import { describe, expect, it } from "vitest";

import { DEFAULT_FACCIATA_CONFIG } from "@/components/render-facciata/defaultFacciataConfig";
import { buildFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";
import { buildFacciataPrompt } from "@/modules/render-facciata/lib/facciataPromptBuilder";
import { normalizeFacciataSceneAnalysis } from "@/modules/render-facciata/lib/facciataSceneAnalysis";
import type { ConfigurazioneFacciata } from "@/modules/render-facciata/lib/types";

function cloneConfig(): ConfigurazioneFacciata {
  return structuredClone(DEFAULT_FACCIATA_CONFIG);
}

function baseAnalysis(overrides: Record<string, unknown> = {}) {
  return normalizeFacciataSceneAnalysis({
    building_type: "residential facade",
    building_style: "traditional italian townhouse",
    floors_count: 3,
    openings_visible: 6,
    camera_angle: "front-facing facade shot",
    lighting_condition: "soft afternoon daylight",
    wall_texture: "fine mineral plaster",
    current_plaster_finish: "smooth plaster",
    current_facade_color: "#D8D2C7",
    current_condition: "weathered but regular",
    preserved_context: ["sky", "road", "vegetation"],
    preserve_rigidly: ["same building geometry", "same facade crop"],
    window_cornices: true,
    string_courses: true,
    sills: true,
    base_course: true,
    gutters: true,
    downpipes: true,
    balconies: true,
    railings: true,
    shutters: true,
    note_analisi: "preserve the same residential building identity",
    openings: [
      {
        id: "A",
        label: "Main opening",
        position: "center",
        floor_hint: "upper floor",
        opening_kind: "window",
        apparent_size: "medium",
        has_cornice: true,
        has_sill: true,
        sill_material: "stone",
        has_shutter: true,
        shutter_type: "persiane verdi",
        has_balcony: false,
        has_railing: false,
        reveal_depth: "medium reveal",
        lighting_notes: "soft daylight from the left",
        shadow_notes: "thin contact shadows under sills",
        preserve_notes: "keep the opening geometry unchanged",
      },
    ],
    tipo_edificio: "residenziale",
    numero_piani: 3,
    numero_finestre: 6,
    intonaco_attuale: "intonaco civile",
    colore_attuale_hex: "#D8D2C7",
    stato_conservazione: "usura media",
    elementi_presenti: ["cornici", "marcapiani", "ringhiere"],
    ...overrides,
  });
}

describe("facciata render pipeline", () => {
  it("keeps the intervention superficial for paint-only", () => {
    const config = cloneConfig();
    config.tipo_intervento = "tinteggiatura";
    config.intonaco.attivo = true;
    config.rivestimento.attivo = false;
    config.cappotto.attivo = false;
    config.elementi.cornici_finestre.azione = "mantieni";
    config.elementi.marcapiani.azione = "mantieni";
    config.elementi.davanzali.azione = "mantieni";
    config.elementi.zoccolatura.azione = "mantieni";
    config.elementi.gronde.azione = "mantieni";
    config.elementi.balconi_ringhiere.azione = "mantieni";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint only");
    expect(prompt.userPrompt.toLowerCase()).not.toContain("advance the facade plane");
    expect(prompt.userPrompt.toLowerCase()).toContain("no cladding must be introduced");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("makes reveal depth and sill adaptation explicit for 10cm insulation", () => {
    const config = cloneConfig();
    config.tipo_intervento = "cappotto";
    config.cappotto.attivo = true;
    config.cappotto.spessore_cm = 10;
    config.cappotto.zona = "tutta";

    const renderConfig = buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.replacements.some((line) => line.includes("10cm"))).toBe(true);

    const prompt = buildFacciataPrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("reveal depth logic");
    expect(prompt.userPrompt.toLowerCase()).toContain("sill extension logic");
    expect(prompt.userPrompt.toLowerCase()).toContain("edge profile logic");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("limits cladding to the ground floor when requested", () => {
    const config = cloneConfig();
    config.tipo_intervento = "rivestimento";
    config.rivestimento.attivo = true;
    config.rivestimento.zona = "piano_terra";
    config.intonaco.zona = "piani_superiori";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("apply cladding only to ground floor");
    expect(prompt.userPrompt.toLowerCase()).toContain("upper floors must remain untouched");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes window cornices and restores the wall cleanly", () => {
    const config = cloneConfig();
    config.elementi.cornici_finestre.azione = "rimuovi";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("remove all existing window cornices completely");
    expect(prompt.userPrompt.toLowerCase()).toContain("patch and re-finish the wall");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes sill replacement without altering windows", () => {
    const config = cloneConfig();
    config.elementi.davanzali.azione = "sostituisci";
    config.elementi.davanzali.materiale = "marmo";
    config.elementi.davanzali.colore_hex = "#D9D7D1";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("replace existing sills");
    expect(prompt.userPrompt.toLowerCase()).toContain("without altering the windows");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("repaints railings without changing balcony geometry", () => {
    const config = cloneConfig();
    config.elementi.balconi_ringhiere.azione = "vernicia";
    config.elementi.balconi_ringhiere.colore_hex = "#2E3136";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint balcony railings only");
    expect(prompt.userPrompt.toLowerCase()).toContain("keeping the exact geometry");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("coordinates mixed intervention without conflicts", () => {
    const config = cloneConfig();
    config.tipo_intervento = "misto";
    config.intonaco.attivo = true;
    config.intonaco.zona = "piani_superiori";
    config.rivestimento.attivo = true;
    config.rivestimento.zona = "piano_terra";
    config.cappotto.attivo = true;
    config.cappotto.spessore_cm = 8;
    config.elementi.zoccolatura.azione = "aggiungi";
    config.elementi.balconi_ringhiere.azione = "vernicia";

    const renderConfig = buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.transitionRules.length).toBeGreaterThan(0);

    const prompt = buildFacciataPrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("ground-floor cladding");
    expect(prompt.userPrompt.toLowerCase()).toContain("upper-floor plaster");
    expect(prompt.userPrompt.toLowerCase()).toContain("base course");
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint balcony railings only");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("normalizes legacy or alternate analysis keys without losing facade context", () => {
    const analysis = normalizeFacciataSceneAnalysis({
      building_type: "residential apartment building",
      architectural_style: "contemporary residential",
      floors_count: 4,
      visible_openings: 8,
      primary_color: "#E5DED2",
      current_finish: "fine scratched plaster",
      features: {
        balconies: true,
        railings: true,
        sills: true,
      },
    });

    expect(analysis.buildingStyle).toBe("contemporary residential");
    expect(analysis.openingsVisible).toBe(8);
    expect(analysis.currentFacadeColor).toBe("#E5DED2");
    expect(analysis.currentPlasterFinish).toBe("fine scratched plaster");
    expect(analysis.features.balconi).toBe(true);
    expect(analysis.features.ringhiere).toBe(true);
    expect(analysis.features.davanzali).toBe(true);
  });
});
