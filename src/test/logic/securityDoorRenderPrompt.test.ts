import { describe, expect, it } from "vitest";

import { DEFAULT_SECURITY_DOOR_CONFIG } from "../../../shared/render-technical/defaults";
import { buildSecurityDoorPrompt } from "../../../shared/render-security-door/securityDoorPromptBuilder";
import type { ConfigurazionePortaBlindata } from "../../../shared/render-security-door/types";

function config(overrides: Partial<ConfigurazionePortaBlindata> = {}): ConfigurazionePortaBlindata {
  return {
    ...DEFAULT_SECURITY_DOOR_CONFIG,
    ...overrides,
    frame: { ...DEFAULT_SECURITY_DOOR_CONFIG.frame, ...overrides.frame },
    hardware: { ...DEFAULT_SECURITY_DOOR_CONFIG.hardware, ...overrides.hardware },
    vetri: { ...DEFAULT_SECURITY_DOOR_CONFIG.vetri, ...overrides.vetri },
    soglia: { ...DEFAULT_SECURITY_DOOR_CONFIG.soglia, ...overrides.soglia },
    apertura: { ...DEFAULT_SECURITY_DOOR_CONFIG.apertura, ...overrides.apertura },
  };
}

const apartmentAnalysis = {
  environmentType: "condominium apartment landing",
  visibleSide: "pianerottolo",
  existingDoorPresence: "old simple apartment door visible",
  existingDoorStyle: "flat economical brown door",
  existingFrameAndCasing: "old visible casing and dated trim",
  apparentOpeningWidth: "standard",
  apparentOpeningHeight: "standard",
};

function promptText(input: ConfigurazionePortaBlindata, analysis: Record<string, unknown> = apartmentAnalysis) {
  const result = buildSecurityDoorPrompt(input as unknown as Record<string, unknown>, analysis);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("security door render prompt", () => {
  it("replaces a simple apartment door with a modern security door", () => {
    const { result, text } = promptText(config({
      door_type: "appartamento_moderna",
      finitura_lato_visibile: "liscio_opaco",
      colore_lato_visibile: "antracite opaco",
      hardware: { elementi: ["maniglia_moderna", "defender_visibile"], finitura: "nero_opaco" },
    }));

    expect(text).toContain("remove the old door leaf completely");
    expect(text).toContain("security-door system");
    expect(text).toContain("clean frame integration");
    expect(text).toContain("solid reinforced leaf impression");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes a classic wood-effect security door without modern minimal leakage", () => {
    const { result, text } = promptText(config({
      door_type: "appartamento_classica",
      stile: "classico",
      finitura_lato_visibile: "pantografato",
      colore_lato_visibile: "noce caldo",
      frame: { tipo: "cornice_classica", coprifilo: "classico" },
      hardware: { elementi: ["maniglia_classica", "spioncino_standard"], finitura: "bronzo" },
    }));

    expect(text).toContain("classic apartment security door");
    expect(text).toContain("pantographed");
    expect(text).toContain("classic casing");
    expect(text).toContain("no modern minimal leakage");
    expect(result.validation.isValid).toBe(true);
  });

  it("handles flush-wall rasomuro with minimal casing and no old trim remnants", () => {
    const { result, text } = promptText(config({
      door_type: "rasomuro",
      frame: { tipo: "rasomuro", coprifilo: "assente" },
      interventi: ["replace_existing_door", "convert_to_flush_or_minimal"],
      finitura_lato_visibile: "laccato",
      colore_lato_visibile: "bianco caldo opaco",
    }));

    expect(text).toContain("flush-wall");
    expect(text).toContain("minimal casing");
    expect(text).toContain("no old trim remnants");
    expect(text).toContain("clean wall-plane integration");
    expect(result.validation.isValid).toBe(true);
  });

  it("adds a proportional sidelight with clean frame integration", () => {
    const { result, text } = promptText(config({
      interventi: ["replace_existing_door", "add_sidelight"],
      door_type: "con_fiancoluce",
      leaf_type: "anta_singola_con_fianco",
      vetri: { fiancoluce: true },
      apertura: { larghezza_apparente: "ampia", presenza_fiancoluce: true },
    }));

    expect(text).toContain("sidelight width plausibility");
    expect(text).toContain("proportional integrated sidelight");
    expect(text).toContain("integrated in the frame");
    expect(text).toContain("without warping the doorway");
    expect(result.validation.isValid).toBe(true);
  });

  it("changes only the visible panel finish without changing geometry", () => {
    const { result, text } = promptText(config({
      interventi: ["recolor_or_restyle_only"],
      finitura_lato_visibile: "effetto_legno",
      colore_lato_visibile: "rovere chiaro",
    }));

    expect(text).toContain("finish-only mode");
    expect(text).toContain("preserve exact opening geometry");
    expect(text).toContain("do not replace the door type");
    expect(result.normalizedConfig.replacement_manifest.replacements).toHaveLength(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps recolor-only strict even if structural fields are set", () => {
    const { result, text } = promptText(config({
      interventi: ["recolor_or_restyle_only"],
      door_type: "rasomuro",
      leaf_type: "anta_singola_con_fianco",
      frame: { tipo: "rasomuro", coprifilo: "assente" },
      vetri: { fiancoluce: true, sopraluce: true },
      finitura_lato_visibile: "laccato",
      colore_lato_visibile: "bianco caldo",
    }));

    expect(text).toContain("finish-only mode");
    expect(result.normalizedConfig.replacement_manifest.additions).toHaveLength(0);
    expect(result.normalizedConfig.replacement_manifest.replacements).toHaveLength(0);
    expect(result.normalizedConfig.replacement_manifest.removals).toHaveLength(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("supports double-leaf security doors with width plausibility and coherent split", () => {
    const { result, text } = promptText(config({
      door_type: "doppia_anta",
      leaf_type: "doppia_anta_asimmetrica",
      apertura: { larghezza_apparente: "molto_ampia" },
    }));

    expect(text).toContain("double-leaf width plausibility");
    expect(text).toContain("vertical leaf split");
    expect(text).toContain("active/passive");
    expect(text).toContain("hardware scale");
    expect(result.validation.isValid).toBe(true);
  });

  it("fails validation for sidelight on a narrow apparent opening", () => {
    const { result } = promptText(config({
      interventi: ["replace_existing_door", "add_sidelight"],
      door_type: "con_fiancoluce",
      leaf_type: "anta_singola_con_fianco",
      vetri: { fiancoluce: true },
      apertura: { larghezza_apparente: "stretta", presenza_fiancoluce: true },
    }));

    expect(result.validation.missingBusinessRules.join(" ").toLowerCase()).toContain("not buildable on a narrow apparent opening");
    expect(result.validation.isValid).toBe(false);
  });
});
