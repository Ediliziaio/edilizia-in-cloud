import { describe, expect, it } from "vitest";

import { mapWizardToConfig, type WizardState } from "@/modules/render/lib/configMapper";
import { normalizeWindowSceneAnalysis } from "@/modules/render/lib/windowSceneAnalysis";
import { buildWindowPrompt } from "@/modules/render/lib/windowPromptBuilder";

const baseState: WizardState = {
  tipo: "F2A",
  profilo: "pvc",
  manigliaCentrale: false,
  coloreInfisso: "7016",
  tipoManiglia: "q_moderna",
  coloreHw: "cromo",
  cass: false,
  cassMat: "stesso_colore",
  cassCol: "",
  tapp: "no",
  tappCol: "stesso",
  traverso: "auto",
  cerniere: "visibili",
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
        belt_placement: "right_wall",
        belt_placement_notes: "manual belt and wall winder visible on the right wall beside the opening",
        roller_control_type: "manual_belt",
        roller_curtain_state: "fully_raised_hidden",
        roller_curtain_position_notes: "shutter curtain not visibly lowered; it is hidden inside the cassonetto",
        has_horizontal_transom: false,
        transom_position_pct: null,
        transom_panel_below_type: "unknown",
        estimated_height_cm: 150,
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
        has_horizontal_transom: false,
        transom_position_pct: null,
        transom_panel_below_type: "unknown",
        estimated_height_cm: 150,
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
    // v8.2: nuove stringhe più dettagliate per evitare ambiguità con AI.
    expect(prompt.userPrompt.toLowerCase()).toContain("manual belt visible");
    // Wall repair: prima era "repair the surrounding wall seamlessly" — il pack v8.2
    // dettaglia con "seamlessly plastered/stuccoed flush" + "repainted with EXACT same paint color".
    expect(prompt.userPrompt.toLowerCase()).toContain("seamlessly plastered/stuccoed flush".toLowerCase());
    expect(prompt.userPrompt.toLowerCase()).toContain("hidden inside the cassonetto");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not invent a colored strip above the glazing");
    expect(prompt.userPrompt.toLowerCase()).toContain("right wall beside the opening");
    // v8.2: "zero manual-control traces" rimosso, sostituito da
    // "no visible trace of the previous installation" (semantica equivalente).
    expect(prompt.userPrompt.toLowerCase()).toContain("no visible trace of the previous installation");
  });

  it("builds a coherent PVC dark grey two-sash specification (v8.3 catalog)", () => {
    // v8.3 — la mazzetta colori RAL pura ("7016 = Grigio Antracite") è stata
    // sostituita da una mazzetta PVC reale del fornitore italiano. Usiamo
    // "1009_grigio_ardesia" che è il corrispettivo più scuro del nuovo catalog.
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, tipo: "F2A", profilo: "pvc", coloreInfisso: "1009_grigio_ardesia" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.nuovo_infisso.materiale).toBe("pvc");
    expect(config.technical_specification[0].finish.name).toBe("Grigio Ardesia");

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("Grigio Ardesia (RAL 1009)");
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

  it("describes the exact wood-effect finish and chosen handle typology in the prompt", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, coloreInfisso: "noce", tipoManiglia: "q_moderna", coloreHw: "inox" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.userPrompt).toContain("walnut wood-effect laminate with dark brown tone and visible longitudinal grain");
    expect(prompt.userPrompt).toContain("square modern handle");
    expect(prompt.userPrompt).toContain("brushed stainless steel");
  });

  it("removes a horizontal transom on a portafinestra when the user selects vetro unico", () => {
    const analysis = normalizeWindowSceneAnalysis({
      openings: [{
        id: "A",
        type_current: "portafinestra",
        perceived_element: "door_window",
        sash_count: 2,
        has_horizontal_transom: true,
        transom_position_pct: 42,
        transom_panel_below_type: "glass",
        estimated_height_cm: 235,
        has_cassonetto: false,
        has_roller_shutter: false,
        has_belt: false,
        has_belt_box: false,
      }],
    });

    const config = mapWizardToConfig(
      { ...baseState, tipo: "PF2A", profilo: "alluminio", traverso: "rimuovi" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.technical_specification[0].transomRule?.toLowerCase()).toContain("remove");
    expect(config.replacement_manifest.removals.some((rule) => rule.code === "remove_horizontal_transom")).toBe(true);

    const prompt = buildWindowPrompt(config, analysis);
    // v8.2 → v8.6: la regola "rimuovi traverso" resta nel user prompt
    // tramite la specifica tecnica dinamica (BLOCK D). Il negative prompt
    // ora e' asciugato — non duplichiamo regole semantiche gia' coperte
    // dal user prompt dynamic.
    expect(prompt.userPrompt.toLowerCase()).toContain("remove the horizontal transom");
  });

  it("v8.3.8: hidden hinges are honored on ALL profile families (architectural upsell)", () => {
    // Pre-v8.3.8 fallback su "visible" se profilo non-compatibile.
    // v8.3.8: forza sempre "hidden" se richiesto, anche su PVC/legno.
    // Il cliente può vendere PVC con cerniere a scomparsa come upsell.
    const analysis = buildAnalysisWithOpenings();
    const compatibleConfig = mapWizardToConfig(
      { ...baseState, profilo: "minimal", cerniere: "scomparsa" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );
    expect(compatibleConfig.technical_specification[0].hingeMode).toBe("hidden");

    const pvcWithHiddenConfig = mapWizardToConfig(
      { ...baseState, profilo: "pvc", cerniere: "scomparsa" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );
    expect(pvcWithHiddenConfig.technical_specification[0].hingeMode).toBe("hidden");
    // La regola placement deve menzionare il caveat architectural upsell
    expect(pvcWithHiddenConfig.technical_specification[0].hingePlacementRule).toContain(
      "premium architectural upsell",
    );
  });

  it("uses three hinges per sash for tall portefinestre", () => {
    const analysis = normalizeWindowSceneAnalysis({
      openings: [{
        id: "A",
        type_current: "portafinestra",
        perceived_element: "door_window",
        sash_count: 2,
        estimated_height_cm: 245,
        has_cassonetto: false,
        has_roller_shutter: false,
        has_belt: false,
        has_belt_box: false,
      }],
    });

    const config = mapWizardToConfig(
      { ...baseState, tipo: "PF2A", profilo: "alluminio" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.technical_specification[0].hingesPerSash).toBe(3);
    expect(config.technical_specification[0].hingeCountVisible).toBe(6);
    // v8.2: il pack centralizza il count su technical_specification (source of truth).
    // Il campo legacy `nuovo_infisso.cerniere.num_per_anta` è stato rimosso —
    // il prompt builder legge tutto da technical_specification ora.
  });

  it("adds an electric wall switch when a motorized shutter replaces a manual belt", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, tapp: "motorizzate" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    expect(config.technical_specification[0].shutter.electricButton?.install).toBe(true);
    const prompt = buildWindowPrompt(config, analysis);
    // v8.2: "electric command button" rinominato in "electric roller-shutter switch plate"
    // (terminologia Italian standard Vimar/Bticino). Test allineato.
    expect(prompt.userPrompt.toLowerCase()).toContain("electric roller-shutter switch plate");
    expect(prompt.validation.isValid).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // v8.3.x regression tests — masterprompt v8.3.1 alignment
  // ───────────────────────────────────────────────────────────────────────────

  it("v8.6: BLOCK A includes core SIMULATOR identity + demolish-and-rebuild semantics", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });
    const prompt = buildWindowPrompt(config, analysis);

    // v8.6 ha consolidato il sistema YOU ARE NOT/DOING in narrative piu' compatta.
    // Le frasi chiave devono restare presenti.
    expect(prompt.systemPrompt).toContain("PHOTOREALISTIC WINDOW INSTALLATION SIMULATOR");
    expect(prompt.systemPrompt).toContain("demolish and rebuild");
    expect(prompt.systemPrompt).toContain("PRESERVE EXACTLY");
    expect(prompt.systemPrompt).toContain("REPLACE COMPLETELY");
    expect(prompt.systemPrompt).toContain("NOT a color filter");
  });

  it("v8.6: BLOCK A includes ABSOLUTE BANS + Italian residential standard", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });
    const prompt = buildWindowPrompt(config, analysis);

    // Le ban critiche (recolor / handle / stiles / cinghia / cassonetto)
    // sono ora consolidate nella sezione ABSOLUTE BANS del system prompt
    expect(prompt.systemPrompt).toContain("ABSOLUTE BANS");
    expect(prompt.systemPrompt).toContain("Recoloring the existing window instead of replacing");
    expect(prompt.systemPrompt).toContain("Preserving the old handle silhouette");
    expect(prompt.systemPrompt).toContain("lateral stiles in the old color");
    expect(prompt.systemPrompt).toContain("Italian residential");
  });

  it("v8.6: BLOCK F focuses on INSTALLATION REALISM only", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });
    const prompt = buildWindowPrompt(config, analysis);

    expect(prompt.userPrompt).toContain("INSTALLATION REALISM");
    expect(prompt.userPrompt).toContain("Same room, same angle");
    // v8.6 — sezioni eliminate (consolidate in BLOCK A):
    expect(prompt.userPrompt).not.toContain("PHYSICAL REPLACEMENT (CRITICAL)");
    expect(prompt.userPrompt).not.toContain("CARDINAL FAILURE MODES");
  });

  it("v8.6: BLOCK J has lean 8-point pre-output checklist", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });
    const prompt = buildWindowPrompt(config, analysis);

    expect(prompt.userPrompt).toContain("PRE-OUTPUT CHECKLIST");
    // I 8 punti sono numerati 1-8 e coprono i 7 fail mode + scope
    expect(prompt.blocks.J).toMatch(/1\. Scope/);
    expect(prompt.blocks.J).toMatch(/8\. Scene integrity/);
  });

  it("v8.3.x: builds IMAGE INPUTS LEGEND when reference images are available", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(
      { ...baseState, coloreInfisso: "1009_grigio_ardesia", tipoManiglia: "q_moderna" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );
    const prompt = buildWindowPrompt(config, analysis);

    // referenceImages popolato (almeno frame color + handle)
    expect(prompt.referenceImages.length).toBeGreaterThan(0);
    expect(prompt.referenceImages.some((r) => r.kind === "frame_color")).toBe(true);

    // Legend presente nel userPrompt e nei blocks
    expect(prompt.userPrompt).toContain("IMAGE INPUTS LEGEND");
    expect(prompt.userPrompt).toContain("SOURCE SCENE PHOTO");
    expect(prompt.userPrompt).toContain("HARD RULE");
    expect(prompt.blocks.LEGEND).toBeTruthy();
  });

  it("v8.3.6 regression: mapShutter resolves WIZARD_TAPP_COLORS ids (verde/rosso/blu)", () => {
    const analysis = buildAnalysisWithOpenings();
    // Tapparella motorizzata + colore "Verde Muschio (RAL 6005)" dalla palette
    // dedicata tapparelle. Prima del fix v8.3.6 findWizardRal lo scartava.
    const config = mapWizardToConfig(
      { ...baseState, tapp: "motorizzate", tappCol: "tapp_6005_muschio" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    const shutter = config.technical_specification[0].shutter;
    expect(shutter.replace).toBe(true);
    expect(shutter.isMotorized).toBe(true);
    expect(shutter.colorLabel).toContain("Verde Muschio");
    expect(shutter.colorLabel).toContain("RAL 6005");
    // NON deve contenere l'id grezzo "tapp_6005_muschio" (bug pre-v8.3.6)
    expect(shutter.colorLabel).not.toContain("tapp_6005");
  });

  it("v8.3.6 regression: mapCassonetto uses RAL code, not internal id", () => {
    const analysis = buildAnalysisWithOpenings();
    // Cassonetto custom in "Blu Cobalto (RAL 135)" — il vecchio mapper
    // produceva "Blu Cobalto (RAL 135_blu_cobalto)".
    const config = mapWizardToConfig(
      { ...baseState, cass: true, cassMat: "colore_custom", cassCol: "135_blu_cobalto" },
      "",
      { sceneAnalysis: analysis, selectedOpeningIds: ["A"] },
    );

    const cass = config.technical_specification[0].cassonetto;
    expect(cass.replace).toBe(true);
    expect(cass.colorLabel).toBe("Blu Cobalto (RAL 135)");
    expect(cass.colorLabel).not.toContain("135_blu_cobalto");
  });

  it("v8.3.x: promptVersion is current (regression detector for version bumps)", () => {
    const analysis = buildAnalysisWithOpenings();
    const config = mapWizardToConfig(baseState, "", {
      sceneAnalysis: analysis,
      selectedOpeningIds: ["A"],
    });
    const prompt = buildWindowPrompt(config, analysis);
    expect(prompt.promptVersion).toBe("8.6.30");
  });
});
