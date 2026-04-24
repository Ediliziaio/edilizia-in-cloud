import { describe, expect, it } from "vitest";

import { buildRistrutturazionePrompt } from "@/modules/render-ristrutturazioni/lib/ristrutturazioniPromptBuilder";
import type { ConfigurazioneRistrutturazione } from "@/modules/render-ristrutturazioni/lib/types";

function promptText(config: ConfigurazioneRistrutturazione) {
  const result = buildRistrutturazionePrompt(config);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("render ristrutturazioni orchestrator prompt", () => {
  it("orchestrates full bathroom renovation with correct demolition and fixture order", () => {
    const { result, text } = promptText({
      mode: "full",
      sceneHint: "bathroom",
      activeDomains: ["bathroom", "floor"],
      domainConfigs: {
        bathroom: {
          removeTub: true,
          walkInShower: true,
          wallHungSanitary: true,
          wallHungVanity: true,
          flushPlate: "slim rectangular wall flush plate in matte black",
          wallTiles: "120x240 marble slabs, very few long joints",
          floor: "large-format porcelain floor",
        },
        floor: {
          material: "large porcelain slab floor",
          pattern: "straight aligned large slab layout",
        },
      },
    });

    expect(result.sceneClass).toBe("bathroom");
    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("bathtub removal must happen before walk-in shower installation");
    expect(text).toContain("walk-in shower");
    expect(text).toContain("wall-hung wc/bidet");
    expect(text).toContain("slim rectangular wall flush plate");
    expect(text).not.toContain("[roof appendix]");
  });

  it("coordinates facade, windows, shutters and visible roof without reveal-depth contradictions", () => {
    const { result, text } = promptText({
      mode: "energy_retrofit",
      sceneHint: "mixed_exterior_envelope",
      activeDomains: ["facade", "windows", "shutters", "roof"],
      domainConfigs: {
        facade: { insulation: true, finish: "fine render plaster", color: "warm white" },
        windows: { material: "PVC", color: "anthracite RAL 7016", typology: "two-sash windows" },
        shutters: { operation: "replace", type: "solid shutters", color: "RAL 6005 green" },
        roof: { visible: true, operation: "recolor_only", covering: "matte terracotta roof finish" },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.sceneClass).toBe("mixed_exterior_envelope");
    expect(text).toContain("facade insulation modifies reveal depth first");
    expect(text).toContain("windows adapt to final reveal geometry");
    expect(text).toContain("shutters align to final opening/window/reveal geometry");
    expect(text).toContain("roof recolor does not alter skylight");
  });

  it("keeps furniture geometry and position in living room color-only restyling", () => {
    const { result, text } = promptText({
      mode: "premium_restyle",
      sceneHint: "room",
      activeDomains: ["room", "floor"],
      domainConfigs: {
        room: {
          style: "Scandinavian warm minimal",
          furnitureMode: "color-only",
          lighting: "linear suspension lights over dining table",
          accentWall: "main wall only",
        },
        floor: {
          material: "oak parquet",
          pattern: "herringbone",
          skirting: "white 8 cm skirting",
        },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("floor replacement before skirting adaptation");
    expect(text).toContain("furniture color-only mode preserves geometry and position");
    expect(text).toContain("linear suspension lights");
    expect(text).toContain("same room");
  });

  it("fails validation for bathroom photo with roof request and avoids roof appendix hallucination", () => {
    const { result, text } = promptText({
      mode: "mixed_upgrade",
      sceneHint: "bathroom",
      activeDomains: ["bathroom", "roof"],
      domainConfigs: {
        bathroom: { walkInShower: true },
        roof: { covering: "standing seam metal roof" },
      },
    });

    expect(result.validation.isValid).toBe(false);
    expect(result.validation.outOfScopeDomains).toContain("roof");
    expect(text).toContain("validation failed");
    expect(text).toContain("roof is outside the single-photo visible scope");
    expect(text).not.toContain("[roof appendix]");
  });

  it("orders outdoor pool, deck/coping and pergola without unresolved overlap", () => {
    const { result, text } = promptText({
      mode: "mixed_upgrade",
      sceneHint: "outdoor",
      activeDomains: ["pool", "exterior_flooring", "pergola"],
      domainConfigs: {
        pool: { type: "rectangular overflow pool", coping: "travertine coping", replaceExisting: false },
        exterior_flooring: { material: "large-format exterior porcelain deck" },
        pergola: { type: "wall-mounted bioclimatic pergola", cover: "semi-open louvers" },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("pool footprint first");
    expect(text).toContain("deck/coping second");
    expect(text).toContain("pergola after site logic");
    expect(result.conflicts.unresolved).toHaveLength(0);
  });

  it("preserves geometry for recolor-only system without replacement drift", () => {
    const { result, text } = promptText({
      mode: "selective",
      sceneHint: "mixed_exterior_envelope",
      activeDomains: ["shutters"],
      domainConfigs: {
        shutters: { operation: "recolor_only", color: "walnut wood effect" },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("change only shutter finish");
    expect(text).toContain("preserve geometry");
    expect(text).not.toContain("replace existing shutters");
  });

  it("does not include inactive domain appendices", () => {
    const { result, text } = promptText({
      mode: "selective",
      sceneHint: "room",
      activeDomains: ["floor"],
      domainConfigs: {
        floor: { material: "microcement", pattern: "seamless continuous surface" },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(text).toContain("[floor appendix]");
    expect(text).not.toContain("[bathroom appendix]");
    expect(text).not.toContain("[facade appendix]");
    expect(text).not.toContain("[roof appendix]");
  });

  it("keeps multi-domain non-overlapping target zones unified and clean", () => {
    const { result, text } = promptText({
      mode: "mixed_upgrade",
      sceneHint: "mixed_exterior_envelope",
      activeDomains: ["facade", "shutters"],
      domainConfigs: {
        facade: { finish: "fine plaster", color: "light grey", baseCourse: "stone base course on ground floor" },
        shutters: { operation: "replace", type: "classic louvered shutters", color: "dark green RAL" },
      },
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.conflicts.unresolved).toHaveLength(0);
    expect(text).toContain("unified replacement manifest");
    expect(text).toContain("fine plaster");
    expect(text).toContain("classic louvered shutters");
    expect(text).toContain("same-building facade renovation");
  });
});
