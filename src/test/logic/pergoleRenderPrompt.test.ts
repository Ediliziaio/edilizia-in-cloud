import { describe, expect, it } from "vitest";

import { buildPergolePrompt } from "@/modules/render-pergole/lib/pergolePromptBuilder";
import type { ConfigurazionePergole } from "@/modules/render-pergole/lib/types";

function baseConfig(overrides: Partial<ConfigurazionePergole> = {}): ConfigurazionePergole {
  return {
    operazione: "add_new_pergola",
    installazione: {
      zona: "addossata_facciata",
      addossata_si_no: true,
      distanza_da_facciata: "aderente",
      larghezza_apparente: "media",
      profondita_apparente: "standard",
      altezza_apparente: "standard",
      numero_montanti: 2,
      posizione_montanti: "frontali_visibili",
      ancoraggio_a_terra: "pavimento",
      rapporto_con_porte_finestre: "porta-finestra centrale da lasciare libera",
    },
    struttura: {
      tipo: "bioclimatica_addossata",
      materiale: "alluminio",
      colore_nome: "Antracite RAL 7016",
      colore_hex: "#30343B",
      finitura: "opaca",
      stile: "premium_contemporaneo",
    },
    copertura: {
      tipo: "lamelle_orientabili",
      stato: "lamelle_45",
      trasparenza: "opaco",
    },
    chiusure_laterali: {
      tipo: "nessuna",
      stato: "aperte",
    },
    illuminazione: "nessuna",
    arredo: {
      gestisci_arredo: "mantieni",
      uso_area: "relax",
    },
    elementi_da_preservare: ["facciata", "serramenti"],
    note_libere: "",
    ...overrides,
  };
}

describe("pergole render prompt", () => {
  it("creates wall-mounted aluminum bioclimatic pergola with louver rules and installability envelope", () => {
    const prompt = buildPergolePrompt(baseConfig());
    const text = `${prompt.systemPrompt}\n${prompt.userPrompt}`.toLowerCase();

    expect(text).toContain("wall-mounted");
    expect(text).toContain("facade plane");
    expect(text).toContain("orientable");
    expect(text).toContain("louvers tilted about 45 degrees");
    expect(text).toContain("no floating");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("creates freestanding patio pergola with independent posts and no wall attachment", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "patio_centrale",
        addossata_si_no: false,
        numero_montanti: 4,
      },
      struttura: {
        ...baseConfig().struttura,
        tipo: "bioclimatica_autoportante",
      },
    }));

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("freestanding");
    expect(text).toContain("independent");
    expect(text).toContain("no rear wall attachment");
    expect(text).toContain("four corner posts");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("replaces an existing awning with removal of brackets and clean facade restoration", () => {
    const prompt = buildPergolePrompt(baseConfig({ operazione: "replace_existing_awning_with_pergola" }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("remove existing awning");
    expect(text).toContain("brackets");
    expect(text).toContain("patch the facade");
    expect(text).toContain("no old awning arms");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes retractable fabric cover without glass/louver drift", () => {
    const prompt = buildPergolePrompt(baseConfig({
      struttura: { ...baseConfig().struttura, tipo: "telo_addossata" },
      copertura: { tipo: "telo_retraibile", stato: "telo_disteso" },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("retractable technical fabric");
    expect(text).toContain("fully extended and tensioned");
    expect(text).toContain("not as glass or metal");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds ZIP side closures with technical screen rules", () => {
    const prompt = buildPergolePrompt(baseConfig({
      operazione: "add_side_closures",
      chiusure_laterali: {
        tipo: "screen_zip",
        stato: "chiuse",
        colore_nome: "Grigio tecnico",
        colore_hex: "#7A7D80",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("technical zip screens");
    expect(text).toContain("side tracks");
    expect(text).toContain("not decorative curtains");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps geometry untouched for recolor-only operation", () => {
    const prompt = buildPergolePrompt(baseConfig({
      operazione: "recolor_only",
      struttura: {
        ...baseConfig().struttura,
        colore_nome: "Bianco opaco",
        colore_hex: "#F2F1EA",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("recolor-only");
    expect(text).toContain("preserve exact footprint");
    expect(text).toContain("post positions");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("protects pool edge for poolside pergola placement", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "bordo_piscina",
        addossata_si_no: false,
        ancoraggio_a_terra: "bordo_piscina",
      },
      struttura: {
        ...baseConfig().struttura,
        tipo: "vetro_autoportante",
      },
      copertura: { tipo: "vetro", stato: "chiusa", trasparenza: "trasparente" },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("pool edge");
    expect(text).toContain("inside pool water");
    expect(text).toContain("transparent");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves terrace parapet and door operation", () => {
    const prompt = buildPergolePrompt(baseConfig({
      installazione: {
        ...baseConfig().installazione,
        zona: "terrazzo",
        addossata_si_no: true,
        ancoraggio_a_terra: "terrazzo",
      },
    }));
    const text = prompt.userPrompt.toLowerCase();

    expect(text).toContain("terrace");
    expect(text).toContain("parapet");
    expect(text).toContain("doors and door-windows remain");
    expect(prompt.validation.isValid).toBe(true);
  });
});
