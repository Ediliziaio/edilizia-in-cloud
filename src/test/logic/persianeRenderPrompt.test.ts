import { describe, expect, it } from "vitest";

import { buildPersianeRenderConfig } from "@/modules/render-persiane/lib/persianeRenderConfig";
import { normalizePersianeSceneAnalysis } from "@/modules/render-persiane/lib/persianeSceneAnalysis";
import { buildPersianePrompt } from "../../../shared/render-persiane/persianePromptBuilder";
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

  // ── Correzioni A (audit 04/10) ─────────────────────────────────────────

  function tapparelle(existingType = "avvolgibile_esterno") {
    return normalizePersianeSceneAnalysis({
      facade_type: "intonaco",
      openings: [{
        id: "A", position: "center", opening_kind: "window", apparent_size: "medium",
        has_existing_shutter: true, existing_shutter_type: existingType,
        material_perceived: "PVC", color_perceived: "beige", has_side_guides: true, has_head_box: true, has_hinges: false,
      }],
    });
  }

  it("cambia colore delle tapparelle: tipo e materiale nascosti nel form non finiscono nel prompt", () => {
    // Il form nasconde tipo e materiale in «cambia colore»: restano i default
    // (veneziana classica, legno naturale). Prima la ricolorazione diceva
    // «solid natural wood», «side-hinged mounting» e allegava una veneziana.
    const config = baseConfig({
      operazione: "cambia_colore", tipo: "veneziana_classica", materiale: "legno_naturale",
      colore_nome: "Grigio antracite", colore_ral: "7016", colore_hex: "#383E42",
      target_mode: "all_visible", applica_tutte_finestre: true,
    });
    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: tapparelle() });
    const spec = renderConfig.technical_specification[0];
    expect(spec.targetType).toBe("avvolgibile_esterno");
    expect(spec.material).toBeNull();
    expect(spec.materialDescription).toBeNull();

    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    // tutto ciò che va al modello: blocchi e piano (il riscrittore legge specifica e aggiunte)
    const tutto = `${prompt.userPrompt}\n${JSON.stringify(prompt.normalizedConfig.technical_specification)}\n${prompt.normalizedConfig.replacement_manifest.additions.join("\n")}`.toLowerCase();
    expect(tutto).not.toContain("natural wood");
    expect(tutto).not.toContain("side-hinged");
    expect(tutto).not.toContain("veneziana classica");
    expect(tutto).not.toContain("fermapersiane");
    expect(tutto).toContain("keep the existing mounting, hinges, guides and fixing points exactly as photographed");
    expect(prompt.userPrompt).toContain("avvolgibile esterno in Grigio antracite (RAL 7016)");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("cambia colore con tipo esistente non riconosciuto: si descrive l'esistente, mai il tipo di default", () => {
    const config = baseConfig({ operazione: "cambia_colore", target_mode: "all_visible", applica_tutte_finestre: true });
    const renderConfig = buildPersianeRenderConfig(config, { sceneAnalysis: tapparelle("qualcosa di strano") });
    const spec = renderConfig.technical_specification[0];
    expect(spec.targetType).toBeNull();
    expect(spec.typeDescription).toBe("the existing shutter system exactly as photographed");
    expect(spec.leafConfiguration).toBe("keep the existing leaf and panel layout exactly as photographed");
    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt).toContain("existing typology in Grigio Antracite (RAL 7016)");
    expect(prompt.userPrompt.toLowerCase()).not.toContain("slat width about");
    expect(prompt.userPrompt.toLowerCase()).not.toContain("remove the existing shutter assembly");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("l'analisi che risponde «roller shutter» o «tapparella» riconosce l'avvolgibile", () => {
    for (const parola of ["roller shutter", "rolling_shutter", "tapparella"]) {
      expect(tapparelle(parola).openings[0].existingShutterType, parola).toBe("avvolgibile_esterno");
    }
  });

  it("la tapparella non ruota su cardini: lo stato è la posizione del telo, senza fermi a muro", () => {
    const meta = buildPersianePrompt(
      buildPersianeRenderConfig(baseConfig({ tipo: "avvolgibile_esterno", materiale: "alluminio", stato_apertura: "aperto_45" }), { sceneAnalysis: tapparelle() }) as unknown as Record<string, unknown>,
    );
    expect(meta.userPrompt).toContain("raised halfway: the bottom rail sits about halfway down the opening");
    expect(meta.userPrompt.toLowerCase()).not.toContain("hinge rotation");

    const alzata = buildPersianePrompt(
      buildPersianeRenderConfig(baseConfig({ tipo: "avvolgibile_esterno", materiale: "alluminio", stato_apertura: "aperto_90" }), { sceneAnalysis: tapparelle() }) as unknown as Record<string, unknown>,
    );
    expect(alzata.userPrompt).toContain("fully raised into the head box: the window is completely clear");
    expect(alzata.userPrompt.toLowerCase()).not.toContain("hold-open hardware or visual contact with the wall plane");
    expect(alzata.validation.isValid).toBe(true);
  });

  it("il brise-soleil è fisso: niente ante da aprire", () => {
    const prompt = buildPersianePrompt(
      buildPersianeRenderConfig(baseConfig({ tipo: "brise_soleil", materiale: "alluminio" }), { sceneAnalysis: buildAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt).toContain("fixed installation with no hinged leaves");
    expect(prompt.userPrompt).not.toContain("leaves aligned in the closed position");
  });

  it("le persiane a battente restano descritte come prima (stato chiuso)", () => {
    const prompt = buildPersianePrompt(buildPersianeRenderConfig(baseConfig(), { sceneAnalysis: buildAnalysis() }) as unknown as Record<string, unknown>);
    expect(prompt.userPrompt).toContain("fully closed, leaves aligned in the closed position with no hybrid half-open reading");
  });

  it("il colore del profilo a contrasto arriva col nome e il RAL, non solo come codice esadecimale", () => {
    const prompt = buildPersianePrompt(
      buildPersianeRenderConfig(baseConfig({ colore_profilo_diverso: true, colore_profilo_hex: "#383E42" }), { sceneAnalysis: buildAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt).toContain("Outer frame/profile contrast color: Grigio antracite (RAL 7016, #383E42).");
  });

  it("ricolorare un «a libro» esistente non aggiunge la conversione a libro (e la validazione passa)", () => {
    const scena = normalizePersianeSceneAnalysis({
      openings: [{ id: "A", position: "center", opening_kind: "door_window", has_existing_shutter: true, existing_shutter_type: "a_libro" }],
    });
    const renderConfig = buildPersianeRenderConfig(baseConfig({ operazione: "cambia_colore", target_mode: "all_visible", applica_tutte_finestre: true }), { sceneAnalysis: scena });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code.startsWith("convert_to_bifold"))).toBe(false);
    expect(buildPersianePrompt(renderConfig as unknown as Record<string, unknown>).validation.isValid).toBe(true);
  });

  // ── Elementi che mancavano (B, 04/10) ─────────────────────────────────

  it("numero di ante scelto: entra nella configurazione delle ante e, se diverso dalla foto, diventa una conversione", () => {
    const renderConfig = buildPersianeRenderConfig(baseConfig({ numero_ante: 1 }), { sceneAnalysis: buildAnalysis() });
    expect(renderConfig.technical_specification[0].leafConfiguration).toBe("exactly one leaf per opening, hinged on one jamb and covering the whole opening");
    expect(renderConfig.replacement_manifest.removals.some((r) => r.code === "leaf_count_A" && r.summary.includes("changes from 2 to 1 leaf"))).toBe(true);
    const prompt = buildPersianePrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt).toContain("Leaf/panel logic: exactly one leaf per opening");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("numero di ante che il tipo non può avere: ignorato (l'«a libro» resta a pannelli)", () => {
    const renderConfig = buildPersianeRenderConfig(baseConfig({ tipo: "a_libro", numero_ante: 1 }), { sceneAnalysis: buildAnalysis() });
    expect(renderConfig.technical_specification[0].leafConfiguration).toBe("bi-fold layout with 4 folding panels total");
    const sei = buildPersianeRenderConfig(baseConfig({ tipo: "a_libro", numero_ante: 6 }), { sceneAnalysis: buildAnalysis() });
    expect(sei.technical_specification[0].leafConfiguration).toContain("exactly six folding panels per opening");
    expect(buildPersianePrompt(sei as unknown as Record<string, unknown>).validation.isValid).toBe(true);
  });

  it("lamelle fisse o orientabili: la scelta arriva alla regola delle lamelle, solo per i tipi che la prevedono", () => {
    const orientabili = buildPersianePrompt(buildPersianeRenderConfig(
      baseConfig({ lamelle: { larghezza_mm: 50, apertura: "parzialmente_aperte", movimento: "orientabili" } }),
      { sceneAnalysis: buildAnalysis() },
    ) as unknown as Record<string, unknown>);
    expect(orientabili.userPrompt).toContain("adjustable slats that tilt together, linked by a slim vertical tilt rod on the inner face of the leaf");
    expect(orientabili.validation.isValid).toBe(true);

    const brise = buildPersianeRenderConfig(baseConfig({ tipo: "brise_soleil", lamelle: { larghezza_mm: 80, apertura: "parzialmente_aperte", movimento: "fisse" } }), { sceneAnalysis: buildAnalysis() });
    expect(brise.technical_specification[0].louverRule).toContain("blades fixed at one constant angle on the side supports");

    const gelosia = buildPersianeRenderConfig(baseConfig({ tipo: "gelosia", lamelle: { larghezza_mm: 50, apertura: "chiuse", movimento: "orientabili" } }), { sceneAnalysis: buildAnalysis() });
    expect(gelosia.technical_specification[0].louverRule).not.toContain("tilt rod");
  });

  it("cassonetto della tapparella: a vista o nascosto, con la conversione rispetto a quello in foto", () => {
    const aVista = buildPersianeRenderConfig(
      baseConfig({ tipo: "avvolgibile_esterno", materiale: "alluminio", cassonetto: "esterno_a_vista" }),
      { sceneAnalysis: tapparelle("avvolgibile_esterno") },
    );
    expect(aVista.technical_specification[0].hardwareRules).toContain(
      "head box: a visible external head box (cassonetto) mounted on the facade right above the opening, same finish as the curtain, the side guides running down from its ends",
    );
    // in foto il cassonetto c'è già: nessuna conversione
    expect(aVista.replacement_manifest.removals.some((r) => r.code.startsWith("head_box_"))).toBe(false);

    const nascosto = buildPersianeRenderConfig(
      baseConfig({ tipo: "avvolgibile_esterno", materiale: "alluminio", cassonetto: "a_scomparsa" }),
      { sceneAnalysis: tapparelle("avvolgibile_esterno") },
    );
    const prompt = buildPersianePrompt(nascosto as unknown as Record<string, unknown>);
    expect(prompt.userPrompt).toContain("the curtain comes out of a narrow slot under the lintel");
    expect(prompt.userPrompt).toContain("Remove the external box above the opening and restore the wall and lintel cleanly");
    expect(prompt.validation.isValid).toBe(true);

    // su un tipo senza cassonetto la scelta non entra
    const scuro = buildPersianeRenderConfig(baseConfig({ tipo: "scuro_pieno", cassonetto: "esterno_a_vista" }), { sceneAnalysis: buildAnalysis() });
    expect(JSON.stringify(scuro.technical_specification)).not.toContain("head box:");
  });

  it("cambia colore ignora ante, cassonetto e lamelle scelti: descrive l'esistente", () => {
    const renderConfig = buildPersianeRenderConfig(
      baseConfig({ operazione: "cambia_colore", numero_ante: 1, cassonetto: "a_scomparsa", lamelle: { larghezza_mm: 50, apertura: "chiuse", movimento: "fisse" }, target_mode: "all_visible", applica_tutte_finestre: true }),
      { sceneAnalysis: tapparelle("avvolgibile_esterno") },
    );
    const testo = JSON.stringify(renderConfig.technical_specification) + JSON.stringify(renderConfig.replacement_manifest);
    expect(testo).not.toContain("exactly one leaf");
    expect(testo).not.toContain("head box:");
    expect(buildPersianePrompt(renderConfig as unknown as Record<string, unknown>).validation.isValid).toBe(true);
  });

  it("la veneziana esterna scorre su guide: niente «double-leaf»", () => {
    const renderConfig = buildPersianeRenderConfig(baseConfig({ tipo: "veneziana_esterna", materiale: "alluminio" }), { sceneAnalysis: buildAnalysis() });
    expect(renderConfig.technical_specification[0].leafConfiguration).toBe("single external venetian blind running in two side guides");
  });
});
