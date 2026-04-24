import { describe, expect, it } from "vitest";

import { DEFAULT_INTERIOR_DOOR_CONFIG } from "@/components/render-porte-interne/defaultInteriorDoorConfig";
import { buildInteriorDoorPrompt } from "@/modules/render-porte-interne/lib/interiorDoorPromptBuilder";
import type { ConfigurazionePortaInterna } from "@/modules/render-porte-interne/lib/types";

function config(overrides: Partial<ConfigurazionePortaInterna> = {}): ConfigurazionePortaInterna {
  return {
    ...DEFAULT_INTERIOR_DOOR_CONFIG,
    ...overrides,
    frame: { ...DEFAULT_INTERIOR_DOOR_CONFIG.frame, ...overrides.frame },
    glass: { ...DEFAULT_INTERIOR_DOOR_CONFIG.glass, ...overrides.glass },
    hardware: { ...DEFAULT_INTERIOR_DOOR_CONFIG.hardware, ...overrides.hardware },
    apertura: { ...DEFAULT_INTERIOR_DOOR_CONFIG.apertura, ...overrides.apertura },
  };
}

const corridorAnalysis = {
  roomType: "corridoio",
  doorwayPosition: "main doorway on the right wall of a modern corridor",
  existingDoorPresence: "existing standard white hinged door visible",
  existingDoorType: "standard hinged white interior door with casing",
  wallMaterialAndColor: "smooth white painted corridor walls",
  floorMaterial: "wood-look floor running through corridor",
  skirtingBaseboard: "white baseboard visible at doorway",
  wallSlidingAvailableArea: "sufficient",
};

function promptText(input: ConfigurazionePortaInterna, analysis: Record<string, unknown> = corridorAnalysis) {
  const result = buildInteriorDoorPrompt(input as unknown as Record<string, unknown>, analysis);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("interior door render prompt", () => {
  it("replaces a standard white hinged door with clean frame integration", () => {
    const { result, text } = promptText(config({
      door_type: "battente_liscia",
      frame: { tipo: "minimale", coprifilo: "minimale" },
      finish: "laccato_bianco",
      colore: "bianco opaco",
    }));

    expect(text).toContain("remove the old interior door completely");
    expect(text).toContain("clean frame-to-wall junction");
    expect(text).toContain("same room");
    expect(text).toContain("frame must integrate");
    expect(result.validation.isValid).toBe(true);
  });

  it("converts hinged door to pocket sliding with no old swing traces and no visible external rail", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "convert_to_pocket_sliding"],
      door_type: "scorrevole_interno_muro",
      leaf_config: "scorrevole_singola",
      frame: { tipo: "minimale", coprifilo: "minimale" },
    }));

    expect(text).toContain("pocket sliding");
    expect(text).toContain("no visible external rail");
    expect(text).toContain("no old swing traces");
    expect(text).toContain("clean wall-pocket reading");
    expect(result.validation.isValid).toBe(true);
  });

  it("converts to wall sliding with free wall area and no collision rules", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "convert_to_wall_sliding"],
      door_type: "scorrevole_esterno_muro",
      leaf_config: "scorrevole_singola",
      hardware: { elementi: ["binario_visibile", "maniglia_moderna"], finitura: "nero_opaco" },
      apertura: { spazio_scorrimento_parete: "ampio" },
    }));

    expect(text).toContain("wall sliding feasibility mandatory");
    expect(text).toContain("free wall area");
    expect(text).toContain("visible rail");
    expect(text).toContain("no collision");
    expect(result.validation.isValid).toBe(true);
  });

  it("handles a flush-wall rasomuro door with minimal casing", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "convert_to_flush_door"],
      door_type: "rasomuro",
      frame: { tipo: "rasomuro", coprifilo: "assente" },
      hardware: { elementi: ["maniglia_moderna", "cerniere_scomparse"], finitura: "nero_opaco" },
    }));

    expect(text).toContain("flush-wall");
    expect(text).toContain("minimal or no casing");
    expect(text).toContain("wall-plane integration");
    expect(result.validation.isValid).toBe(true);
  });

  it("adds a frosted glass door with realistic privacy and frame rules", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "add_glazing"],
      door_type: "vetrata",
      finish: "vetro_satinato",
      glass: { enabled: true, type: "satinato", privacy_level: "alto" },
      frame: { tipo: "minimale", coprifilo: "minimale" },
      context: "bagno",
    }));

    expect(text).toContain("frosted glass");
    expect(text).toContain("privacy");
    expect(text).toContain("glass configuration");
    expect(text).toContain("believable frame");
    expect(result.validation.isValid).toBe(true);
  });

  it("supports full-height doors with ceiling relation plausibility", () => {
    const { result, text } = promptText(config({
      door_type: "tutta_altezza",
      height: "tutta_altezza",
      apertura: { altezza_apparente: "tutta_altezza", rapporto_con_soffitto: "door can plausibly reach the visible ceiling plane" },
    }));

    expect(text).toContain("full-height ceiling relation");
    expect(text).toContain("without stretching the room");
    expect(text).toContain("vertical continuity");
    expect(result.validation.isValid).toBe(true);
  });

  it("supports double-leaf doors with width plausibility and coherent split", () => {
    const { result, text } = promptText(config({
      door_type: "doppia_anta",
      leaf_config: "doppia_simmetrica",
      apertura: { larghezza_apparente: "molto_ampia" },
    }));

    expect(text).toContain("double-leaf width plausibility");
    expect(text).toContain("central split");
    expect(text).toContain("leaf widths");
    expect(text).toContain("hardware scale");
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps geometry and mechanism unchanged for finish-only updates", () => {
    const { result, text } = promptText(config({
      interventi: ["recolor_or_restyle_only"],
      door_type: "battente_liscia",
      finish: "effetto_legno_chiaro",
      colore: "rovere naturale chiaro",
    }));

    expect(text).toContain("finish-only mode");
    expect(text).toContain("preserve exact doorway geometry");
    expect(text).toContain("do not change from hinged to sliding");
    expect(result.normalizedConfig.replacement_manifest.replacements).toHaveLength(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("fails validation when external wall sliding has insufficient wall travel area", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "convert_to_wall_sliding"],
      door_type: "scorrevole_esterno_muro",
      leaf_config: "scorrevole_singola",
      apertura: { spazio_scorrimento_parete: "ridotto" },
      hardware: { elementi: ["binario_visibile", "maniglia_moderna"], finitura: "nero_opaco" },
    }));

    expect(text).toContain("wall sliding feasibility mandatory");
    expect(result.validation.warnings.join(" ").toLowerCase()).toContain("available wall travel area is not sufficient");
    expect(result.validation.missingBusinessRules.join(" ").toLowerCase()).toContain("not buildable without sufficient free wall travel area");
    expect(result.validation.isValid).toBe(false);
  });

  it("fails validation for double-leaf door in a standard-width opening", () => {
    const { result } = promptText(config({
      door_type: "doppia_anta",
      leaf_config: "doppia_simmetrica",
      apertura: { larghezza_apparente: "standard" },
    }));

    expect(result.validation.missingBusinessRules.join(" ").toLowerCase()).toContain("not buildable in a narrow or standard-width doorway");
    expect(result.validation.isValid).toBe(false);
  });
});
