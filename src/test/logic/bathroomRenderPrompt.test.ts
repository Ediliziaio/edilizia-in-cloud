import { describe, expect, it } from "vitest";
import { DEFAULT_BATHROOM_CONFIG } from "@/components/render-bagno/defaultBathroomConfig";
import { buildBathroomRenderConfig } from "../../../shared/render-bathroom/bathroomRenderConfig.ts";
import { buildBathroomPrompt } from "../../../shared/render-bathroom/bathroomPromptBuilder.ts";
import type { ConfigurazioneBagno } from "../../../shared/render-bathroom/types.ts";

function cloneConfig(): ConfigurazioneBagno {
  return structuredClone(DEFAULT_BATHROOM_CONFIG);
}

function baseAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    room_type: "bathroom",
    estimated_size: "small rectangular bathroom",
    estimated_ceiling_height: "2.70m",
    layout_type: "compact_rectangular",
    camera_perspective: "frontal portrait framing of the bathroom",
    camera_angle: "straight-on view",
    colori_dominanti: ["beige", "white"],
    wall_tiles: {
      description: "pink-beige ceramic wall tiles",
      effect: "ceramic",
      format: "20x25",
      laying_pattern: "stacked",
      grout_color: "beige",
      coverage: "full height",
    },
    floor: {
      description: "light beige ceramic floor",
      effect: "ceramic",
      format: "20x20",
      laying_pattern: "straight",
      grout_color: "beige",
    },
    shower: {
      present: false,
      type: "none",
      position: "right_wall",
      enclosure_type: "none",
      glass_type: "none",
      tray_type: "none",
      frame_finish: "none",
      notes: "no shower visible",
    },
    bathtub: {
      present: false,
      type: "none",
      position: "back_wall",
      faucet_type: "none",
      screen_present: false,
      notes: "no bathtub visible",
    },
    vanity: {
      present: true,
      type: "floor_standing",
      position: "left_wall",
      basin_type: "integrated basin",
      basin_count: 1,
      mirror_present: true,
      mirror_type: "rectangular mirror",
      notes: "compact vanity on the left wall",
    },
    sanitary_ware: {
      wc_present: true,
      wc_type: "floor_standing",
      bidet_present: true,
      bidet_type: "floor_standing",
      position: "left_wall",
      notes: "aligned sanitary fixtures on the same wall",
    },
    lighting: {
      type: "ceiling_spots",
      direction: "from above",
      temperature: "neutral",
      notes: "ceiling lighting only",
    },
    mirror_present: true,
    towel_warmer_present: false,
    towel_warmer_type: "not identified",
    window_present: true,
    window_position: "back_wall",
    niche_present: false,
    partition_present: false,
    preserve_rigidly: ["room geometry", "window and light contribution"],
    demolition_sensitive_areas: ["fixture contact lines with tiles"],
    stato_conservazione: "discreto",
    note_analisi: "keep the same room identity",
    tipo_stanza: "bagno",
    dimensione_stimata: "small rectangular bathroom",
    altezza_stimata: "2.70m",
    piastrelle_parete_attuali: "pink-beige ceramic wall tiles",
    pavimento_attuale: "light beige ceramic floor",
    presenza_doccia: false,
    presenza_vasca: false,
    presenza_mobile: true,
    tipo_mobile: "mobile a terra",
    sanitari_tipo: "a terra",
    rubinetteria_attuale: "chrome",
    illuminazione_attuale: "ceiling spots",
    ...overrides,
  };
}

describe("bathroom render pipeline", () => {
  it("removes the bathtub completely when a walk-in shower replaces it", () => {
    const config = cloneConfig();
    config.sostituzione.doccia = true;
    config.doccia.attivo = true;
    config.doccia.tipo = "walk_in";
    config.sostituzione.vasca = false;

    const analysis = baseAnalysis({
      presenza_vasca: true,
      bathtub: {
        present: true,
        type: "incassata",
        position: "back_wall",
        faucet_type: "a_parete",
        screen_present: true,
        notes: "existing built-in tub under the wall tiles",
      },
    });

    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code === "remove_existing_bathtub_for_new_shower")).toBe(true);

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, analysis);
    expect(prompt.userPrompt).toContain("Remove the existing bathtub completely");
    expect(prompt.userPrompt.toLowerCase()).toContain("walk-in shower");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes the shower and adds a freestanding bathtub when requested", () => {
    const config = cloneConfig();
    config.sostituzione.doccia = false;
    config.sostituzione.vasca = true;
    config.vasca.attivo = true;
    config.vasca.tipo = "freestanding_ovale";

    const analysis = baseAnalysis({
      presenza_doccia: true,
      tipo_doccia: "angolare",
      shower: {
        present: true,
        type: "angolare",
        position: "corner_right",
        enclosure_type: "corner enclosure",
        glass_type: "clear",
        tray_type: "raised tray",
        frame_finish: "chrome",
        notes: "existing corner shower",
      },
    });

    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.some((rule) => rule.code === "remove_existing_shower_for_new_bathtub")).toBe(true);

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, analysis);
    expect(prompt.userPrompt).toContain("Remove the existing shower completely");
    expect(prompt.userPrompt.toLowerCase()).toContain("freestanding bathtub");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes a real walk-in and not a generic closed box", () => {
    const config = cloneConfig();
    config.sostituzione.doccia = true;
    config.doccia.attivo = true;
    config.doccia.tipo = "walk_in";

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("walk-in");
    expect(prompt.userPrompt.toLowerCase()).toContain("no generic closed box");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("makes a suspended vanity explicit", () => {
    const config = cloneConfig();
    config.sostituzione.mobile_bagno = true;
    config.vanity.attivo = true;
    config.vanity.stile = "sospeso_moderno";

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("wall-hung / suspended");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("makes wall-hung sanitary ware explicit", () => {
    const config = cloneConfig();
    config.sostituzione.sanitari = true;
    config.sanitari.attivo = true;
    config.sanitari.azione_wc = "sostituisci";
    config.sanitari.tipo_wc = "rimless_sospeso";
    config.sanitari.azione_bidet = "sostituisci";
    config.sanitari.tipo_bidet = "sospeso";

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("wall-hung sanitary ware");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps wall tiles unchanged when only the floor is replaced", () => {
    const config = cloneConfig();
    config.sostituzione.piastrelle_parete = false;
    config.piastrelle_parete.attivo = false;
    config.sostituzione.pavimento = true;
    config.pavimento.attivo = true;

    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.replacements.some((line) => line.toLowerCase().includes("replace wall tiles with"))).toBe(false);

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt).toContain("Wall tile replacement not requested");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps the floor unchanged when only wall tiles are replaced", () => {
    const config = cloneConfig();
    config.sostituzione.piastrelle_parete = true;
    config.piastrelle_parete.attivo = true;
    config.sostituzione.pavimento = false;
    config.pavimento.attivo = false;

    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.replacements.some((line) => line.toLowerCase().includes("replace floor with"))).toBe(false);

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt).toContain("Floor replacement not requested");
    expect(prompt.validation.isValid).toBe(true);
  });
});
