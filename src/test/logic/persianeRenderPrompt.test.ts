import { describe, expect, it } from "vitest";

import { buildPersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import { normalizePersianeSceneAnalysis } from "@/modules/render-persiane/lib/persianeSceneAnalysis";
import { buildPersianePrompt } from "@/modules/render-persiane/lib/persianePromptBuilder";
import type { ConfigurazionePersiane } from "@/modules/render-persiane/lib/types";

function baseConfig(overrides: Partial<ConfigurazionePersiane> = {}): ConfigurazionePersiane {
  return {
    operazione: "sostituisci",
    tipo: "veneziana_classica",
    materiale: "alluminio",
    colore_mode: "ral",
    colore_ral: "7016",
    colore_nome: "Grigio Antracite",
    colore_hex: "#383E42",
    stato_apertura: "chiuso",
    lamelle: {
      larghezza_mm: 50,
      apertura: "chiuse",
    },
    applica_tutte_finestre: false,
    target_mode: "main_opening",
    selected_opening_ids: [],
    ferramenta_finitura: "nero_opaco",
    installazione: "cardini_tradizionali",
    fermapersiana_visibile: true,
    mantieni_accessori_non_target: true,
    note_libere: "",
    ...overrides,
  };
}

function buildAnalysis() {
  return normalizePersianeSceneAnalysis({
    facade_type: "intonaco residenziale",
    building_style: "villa contemporanea",
    openings_visible: 2,
    camera_angle: "front-facing facade shot",
    lighting_condition: "soft daylight from upper left",
    wall_texture: "fine plaster",
    wall_color: "warm beige",
    untouched_elements: ["downpipe", "stone sill", "plants"],
    preserve_rigidly: ["same facade crop", "same glass reflections"],
    primary_target_hint: "center",
    note_analisi: "Preserve the same house identity and change only the selected shutter system.",
    openings: [
      {
        id: "A",
        position: "center",
        approximate_placement: "main central window",
        opening_kind: "window",
        apparent_size: "medium",
        has_existing_shutter: true,
        existing_shutter_type: "veneziana_classica",
        material_perceived: "painted wood",
        color_perceived: "dark green",
        opening_state_perceived: "chiuso",
        leaf_orientation: "double side-hinged leaves",
        leaf_count: 2,
        has_louvers: true,
        louver_state: "closed",
        has_hinges: true,
        has_hold_open_hardware: true,
        has_tracks: false,
        has_side_guides: false,
        has_head_box: false,
        has_security_grille: false,
        reveal_depth: "medium reveal",
        trim_details: ["stone sill", "painted reveal"],
        lighting_notes: "soft daylight on the left side",
        shadow_notes: "contact shadows around hinges",
        geometry_notes: "rectangular opening with no distortion",
        preserve_notes: "keep the wall reveal and sill exactly the same",
      },
      {
        id: "B",
        position: "right",
        approximate_placement: "secondary right window",
        opening_kind: "window",
        apparent_size: "small",
        has_existing_shutter: true,
        existing_shutter_type: "scuro_pieno",
        material_perceived: "painted wood",
        color_perceived: "cream",
        opening_state_perceived: "chiuso",
        leaf_orientation: "double side-hinged leaves",
        leaf_count: 2,
        has_louvers: false,
        louver_state: "none",
        has_hinges: true,
        has_hold_open_hardware: false,
        has_tracks: false,
        has_side_guides: false,
        has_head_box: false,
        has_security_grille: false,
        reveal_depth: "shallow reveal",
        trim_details: ["painted reveal"],
        lighting_notes: "same daylight",
        shadow_notes: "minor sill shadow",
        geometry_notes: "small rectangular opening",
        preserve_notes: "do not touch this opening",
      },
    ],
    tipo_facciata: "residenziale",
    persiane_attuali: "veneziana_classica",
    materiale_attuale: "legno",
    colore_attuale: "verde scuro",
    numero_finestre: 2,
    stato_conservazione: "buono",
  });
}

describe("persiane render pipeline", () => {
  it("converts veneziana_classica into scuro_pieno removing louvers completely", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      tipo: "scuro_pieno",
      materiale: "alluminio",
      colore_nome: "Grigio Antracite",
    });

    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code === "convert_louver_to_solid_A")).toBe(true);

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("solid panel shutters");
    expect(prompt.userPrompt.toLowerCase()).toContain("remove all visible louvers completely");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps geometry unchanged when the operation is cambia_colore", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      operazione: "cambia_colore",
      colore_nome: "Bianco puro",
      colore_ral: "9010",
      colore_hex: "#F7F5EF",
    });

    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.targetOpenings[0].action).toBe("recolor");
    expect(renderConfig.technical_specification[0].keepGeometryExactly).toBe(true);

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("recolor only");
    expect(prompt.userPrompt.toLowerCase()).toContain("preserving identical shutter geometry");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("makes 90 degree opening explicit with wall-plane and hold-open logic", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      stato_apertura: "aperto_90",
    });

    const prompt = buildPersianePrompt(
      buildPersianeRenderConfig(config, { sceneAnalysis: analysis }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("opened about 90 degrees");
    expect(prompt.userPrompt.toLowerCase()).toContain("wall plane");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves untouched openings when only the main opening is targeted", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({ target_mode: "main_opening", applica_tutte_finestre: false });

    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.target_selection.selectedOpeningIds).toEqual(["A"]);
    expect(renderConfig.target_selection.preservedOpeningIds).toEqual(["B"]);

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt).toContain("Opening B remains untouched");
  });

  it("describes a true bi-fold shutter system", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      tipo: "a_libro",
      materiale: "alluminio",
    });

    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code === "convert_to_bifold_A")).toBe(true);

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("bi-fold shutters");
    expect(prompt.userPrompt.toLowerCase()).toContain("multiple folding panels");
  });

  it("removes shutters and repairs the facade when the operation is rimuovi", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      operazione: "rimuovi",
    });

    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code === "remove_shutter_system_A")).toBe(true);

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("remove the shutter system from opening a");
    expect(prompt.userPrompt.toLowerCase()).toContain("patch former anchor points");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes griglia_sicurezza as a real security system", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      tipo: "griglia_sicurezza",
      materiale: "acciaio",
      installazione: "su_telaio",
      ferramenta_finitura: "ferro_micaceo",
    });

    const prompt = buildPersianePrompt(
      buildPersianeRenderConfig(config, { sceneAnalysis: analysis }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("real security grille system");
    expect(prompt.userPrompt.toLowerCase()).toContain("robust metallic fixing logic");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps the exact selected wood effect explicit", () => {
    const analysis = buildAnalysis();
    const config = baseConfig({
      tipo: "scuro_pieno",
      materiale: "alluminio",
      colore_mode: "legno",
      effetto_legno: "noce_nazionale",
    });

    const prompt = buildPersianePrompt(
      buildPersianeRenderConfig(config, { sceneAnalysis: analysis }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("walnut wood effect");
    expect(prompt.userPrompt.toLowerCase()).toContain("exact selected wood-effect identity");
    expect(prompt.validation.isValid).toBe(true);
  });
});
