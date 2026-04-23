import { describe, expect, it } from "vitest";

import { mapWizardToConfig, type WizardState } from "@/modules/render/lib/configMapper";
import { normalizeWindowSceneAnalysis } from "@/modules/render/lib/windowSceneAnalysis";
import { buildWindowPrompt } from "@/modules/render/lib/windowPromptBuilder";

const baseState: WizardState = {
  tipo: "F2A",
  profilo: "pvc",
  manigliaCentrale: false,
  coloreInfisso: "7016",
  coloreHw: "cromo",
  cass: false,
  cassMat: "stesso_colore",
  cassCol: "",
  tapp: "no",
  tappCol: "stesso",
};

function buildAnalysisWithOpenings() {
  return normalizeWindowSceneAnalysis({
    environment_type: "living_room",
    view_mode: "interior",
    openings_count_visible: 2,
    camera_angle: "front-facing eye-level shot",
    lighting_direction: "left-to-right daylight",
    lighting_quality: "soft natural daylight",
    environment_summary: "Residential living room with two visible openings, curtains and radiator near the left opening.",
    wall_material: "painted plaster",
    wall_color: "warm white",
    floor_visible: true,
    curtains_present: true,
    radiator_present: true,
    untouched_elements: ["walls", "floor", "curtains", "radiator", "furniture", "outdoor view"],
    outdoor_view_summary: "suburban exterior view with trees",
    primary_target_hint: "A",
    openings: [
      {
        id: "A",
        position: "left",
        approximate_placement: "left side of the room",
        type_current: "battente_2_ante",
        perceived_element: "window",
        sash_count: 2,
        material_perceived: "legno",
        color_perceived: "dark brown wood",
        condition: "usurato",
        has_cassonetto: true,
        cassonetto_type: "visible interior roller box",
        has_roller_shutter: true,
        has_belt: true,
        has_belt_box: true,
        roller_control_type: "manual_belt",
        has_persiane: false,
        has_scuri: false,
        has_grates: false,
        has_sill: true,
        has_curtains: true,
        radiator_nearby: true,
        surrounding_elements: ["sheer curtain", "radiator", "sofa arm"],
        light_notes: "soft daylight entering from outside",
        reflection_notes: "subtle tree reflection on glass",
        shadow_notes: "soft shadow under sill",
        geometry_notes: "rectangular opening, no distortion",
        outdoor_view_notes: "keep trees and neighboring building",
        preserve_notes: "keep curtain folds and radiator exactly the same",
      },
      {
        id: "B",
        position: "right",
        approximate_placement: "right side of the room",
        type_current: "fisso",
        perceived_element: "fixed_light",
        sash_count: 1,
        material_perceived: "alluminio",
        color_perceived: "light grey",
        condition: "buone",
        has_cassonetto: false,
        cassonetto_type: null,
        has_roller_shutter: false,
        has_belt: false,
        has_belt_box: false,
        roller_control_type: "none",
        has_persiane: false,
        has_scuri: false,
        has_grates: false,
        has_sill: true,
        has_curtains: true,
        radiator_nearby: false,
        surrounding_elements: ["curtain", "bookcase"],
        light_notes: "same daylight",
        reflection_notes: "mild reflection",
        shadow_notes: "no strong shadow",
        geometry_notes: "rectangular fixed opening",
        outdoor_view_notes: "same outdoor scene",
        preserve_notes: "do not touch this opening",
      },
    ],
    tipo_apertura: "battente_2_ante",
    materiale_attuale: "legno",
    colore_attuale: "dark brown wood",
    condizioni: "usurato",
    stile_edificio: "contemporaneo",
    num_ante_attuale: 2,
    presenza_cassonetto: true,
    presenza_davanzale: true,
    presenza_inferriata: false,
    larghezza_stimata_cm: 140,
    altezza_stimata_cm: 150,
    cinghia_attuale: "con_cinghia",
    note_analisi: "Two visible openings, left one targetable with manual shutter belt.",
  });
}

describe("window render prompt", () => {
  it("includes belt removal and wall repair when a motorized shutter is selected over a visible manual belt", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, tapp: "motorizzate" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.replacement_manifest.removals.some((rule) => rule.code === "remove_manual_belt_system")).toBe(true);

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("manual roller-shutter belt");
    expect(prompt.userPrompt.toLowerCase()).toContain("repair the surrounding wall seamlessly");
    expect(prompt.userPrompt.toLowerCase()).toContain("hidden inside the cassonetto");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not invent a colored strip above the glazing");
  });

  it("builds a coherent PVC anthracite two-sash specification", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, tipo: "F2A", profilo: "pvc", coloreInfisso: "7016" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.nuovo_infisso.materiale).toBe("pvc");
    expect(config.technical_specification[0].finish.name).toBe("Grigio Antracite");

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("Grigio Antracite (RAL 7016)");
    expect(prompt.userPrompt).toContain("double-leaf casement window");
  });

  it("enforces sliding geometry without battente language", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, tipo: "SCORR", profilo: "minimal", coloreInfisso: "7016" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.technical_specification[0].desiredOpeningType).toBe("scorrevole_alzante");

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("lift-and-slide system");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not invent battente");
  });

  it("distinguishes target and untouched openings when multiple openings are visible", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });

    expect(config.target_selection.selectedOpeningIds).toEqual(["A"]);
    expect(config.target_selection.preservedOpeningIds).toEqual(["B"]);

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("Target openings to modify: A");
    expect(prompt.userPrompt).toContain("Opening B must remain untouched");
  });

  it("preserves non-target elements and scene integrity in the final prompt", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("Preserve floor, walls, curtains, radiators");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("forces hardware consistency so hinges match satin/chrome hardware instead of mixing colors", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, coloreHw: "inox" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("Hinge consistency");
    expect(prompt.userPrompt).toContain("brushed stainless steel");
    expect(prompt.userPrompt.toLowerCase()).toContain("no mixed black/dark hinge parts");
  });

  it("keeps the cassonetto envelope close to the original source photo when replacing it", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, cass: true, cassMat: "pvc_bianco" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt.toLowerCase()).toContain("keep the visible cassonetto envelope");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not oversize it");
  });
});
