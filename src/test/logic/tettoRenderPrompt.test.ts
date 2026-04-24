import { describe, expect, it } from "vitest";

import { buildTettoPrompt } from "@/modules/render-tetto/lib/tettoPromptBuilder";
import type { AnalisiTetto, ConfigurazioneTetto } from "@/modules/render-tetto/lib/types";

function baseConfig(overrides: Partial<ConfigurazioneTetto> = {}): ConfigurazioneTetto {
  return {
    tipo_intervento: "sostituzione_manto",
    target: { scope: "tutto_tetto" },
    manto: {
      tipo: "tegole_coppi",
      colore_hex: "#b5651d",
      colore_nome: "Terracotta classico",
      finitura: "opaco",
    },
    isolamento: {
      attivo: false,
      tipo: "sarking_legno",
      spessore_cm: 10,
    },
    grondaie: {
      attivo: false,
      materiale: "alluminio",
      colore_hex: "#8b4513",
    },
    lucernari: {
      attivo: false,
      azione: "mantieni",
    },
    pannelli_solari: {
      attivo: false,
      tipo: "fotovoltaico_nero",
      quantita: "medi",
      posizione: "falda_principale",
    },
    note_libere: "",
    ...overrides,
  };
}

function baseAnalysis(overrides: Partial<AnalisiTetto> = {}): AnalisiTetto {
  return {
    tipo_edificio: "casa residenziale",
    stile_edificio: "edificio italiano tradizionale",
    tipo_tetto: "tetto a falde",
    numero_falde: 2,
    falde_visibili: ["main visible slope", "side visible slope"],
    manto_attuale: "old terracotta coppi roof tiles",
    colore_manto_hex: "#a0522d",
    colore_manto_nome: "terracotta invecchiato",
    presenza_lucernari: false,
    numero_lucernari: 0,
    presenza_abbaini: false,
    pendenza_stimata: 30,
    inclinazione_apparente: "medium pitched roof",
    presenza_comignoli: true,
    presenza_fotovoltaico: false,
    presenza_antenne_linee_vita: false,
    gronde_pluviali: "old brown gutters and downpipes",
    bordi_sporti: "traditional eaves with modest overhang",
    colmo_displuvi_converse: "traditional ridge and hip lines",
    prospettiva_foto: "street-level oblique perspective",
    luce_ombre: "natural daylight from upper left",
    elementi_intoccabili: ["facade", "windows", "chimneys"],
    contesto_da_preservare: ["sky", "street", "vegetation"],
    stato_conservazione: "discreto",
    ...overrides,
  };
}

describe("roof render prompt", () => {
  it("converts old coppi/tiles into metal sheet without hybrid remnants", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        manto: {
          tipo: "lamiera_grecata",
          colore_hex: "#708090",
          colore_nome: "Grigio preverniciato",
          finitura: "opaco",
        },
      }),
      baseAnalysis(),
    );

    const text = `${prompt.systemPrompt}\n${prompt.userPrompt}`.toLowerCase();
    expect(text).toContain("remove all visible coppi/tiles");
    expect(text).toContain("trapezoidal corrugated metal sheet");
    expect(text).toContain("no hybrid");
    expect(text).not.toContain("undefined");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("converts coppi into standing seam metal with seam, edge and flashing logic", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        manto: {
          tipo: "lamiera_aggraffata",
          colore_hex: "#2f3437",
          colore_nome: "Antracite aggraffato",
          finitura: "opaco",
        },
      }),
      baseAnalysis(),
    );

    const text = `${prompt.userPrompt}\n${JSON.stringify(prompt.waterManagementRules)}`.toLowerCase();
    expect(text).toContain("standing seam metal roofing");
    expect(text).toContain("remove all visible coppi/tiles");
    expect(text).toContain("clear every trace of the previous tile/coppi rhythm");
    expect(text).toContain("folded metal ridge/hip caps");
    expect(text).toContain("waterproofing and flashing rules");
    expect(prompt.buildabilityEnvelope.forbiddenResults.join(" ").toLowerCase()).toContain("tile rows visible below");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds a skylight with waterproof flashing on the target slope", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        lucernari: {
          attivo: true,
          azione: "aggiungi",
          tipo: "piatto",
          quantita: 1,
          posizione: "centrale",
          colore_telaio_hex: "#3c3c3c",
        },
      }),
      baseAnalysis(),
    );

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("add 1 flat velux-style roof window");
    expect(text).toContain("target slope");
    expect(text).toContain("waterproof flashing");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes an existing skylight and restores continuous covering", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        lucernari: {
          attivo: true,
          azione: "rimuovi",
        },
      }),
      baseAnalysis({ presenza_lucernari: true, numero_lucernari: 1 }),
    );

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("remove existing skylights/dormers completely");
    expect(text).toContain("continuous roof covering");
    expect(text).toContain("no ghost outline");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("replaces gutters only without replacing roof covering", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        tipo_intervento: "lattonerie_accessori",
        grondaie: {
          attivo: true,
          materiale: "rame",
          colore_hex: "#b87333",
          colore_pluviale_hex: "#b87333",
        },
      }),
      baseAnalysis(),
    );

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("keep existing roof covering unchanged");
    expect(text).toContain("replace gutters and downpipes only");
    expect(text).not.toContain("replace roof covering on");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds photovoltaic panels only on the selected slope and protects untouched slopes", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        tipo_intervento: "lattonerie_accessori",
        target: { scope: "falda_principale" },
        pannelli_solari: {
          attivo: true,
          tipo: "fotovoltaico_nero",
          quantita: "medi",
          posizione: "falda_principale",
        },
      }),
      baseAnalysis(),
    );

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("main visible roof slope only");
    expect(text).toContain("add photovoltaic on falda principale");
    expect(text).toContain("align perfectly");
    expect(text).toContain("mounted with realistic rails/standoffs");
    expect(text).toContain("clear of chimneys, skylights, valleys");
    expect(text).toContain("all non-target visible roof planes");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("recolors the existing roof only without changing geometry or modules", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        tipo_intervento: "solo_colore",
        manto: {
          tipo: "tegole_coppi",
          colore_hex: "#6b3f2a",
          colore_nome: "Marrone scuro anticato",
          finitura: "opaco",
        },
      }),
      baseAnalysis(),
    );

    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("recolor/refinish the existing roof covering");
    expect(text).toContain("only surface color/finish changes");
    expect(text).toContain("without changing tile/panel geometry");
    expect(text).toContain("no roof-system conversion");
    expect(prompt.replacementManifest.preserveGeometry.join(" ").toLowerCase()).toContain("roof pitch");
    expect(text).not.toContain("convert traditional tile/coppi roof");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds insulated over-roof thickness with eave adaptation and no geometry distortion", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        tipo_intervento: "sovracopertura_coibentata",
        isolamento: {
          attivo: true,
          tipo: "fibra_legno",
          spessore_cm: 12,
        },
      }),
      baseAnalysis(),
    );

    const text = `${prompt.userPrompt}\n${JSON.stringify(prompt.buildabilityEnvelope)}`.toLowerCase();
    expect(text).toContain("about 12 cm");
    expect(text).toContain("eaves, verges");
    expect(text).toContain("flashings and gutter relationship");
    expect(text).toContain("no floating or swollen roof edges");
    expect(text).toContain("do not inflate or deform the house");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("replaces only gutters/downpipes while preserving covering and facade", () => {
    const prompt = buildTettoPrompt(
      baseConfig({
        tipo_intervento: "lattonerie_accessori",
        grondaie: {
          attivo: true,
          materiale: "zinco_titanio",
          colore_hex: "#7a8b8b",
          colore_pluviale_hex: "#6f7c7c",
        },
      }),
      baseAnalysis(),
    );

    const text = `${prompt.userPrompt}\n${JSON.stringify(prompt.accessoryCompatibility)}`.toLowerCase();
    expect(text).toContain("keep existing roof covering unchanged");
    expect(text).toContain("replace gutters and downpipes only");
    expect(text).toContain("must align to the final drip edge");
    expect(text).toContain("preserve roof covering, facade, pitch");
    expect(text).not.toContain("replace roof covering on");
    expect(prompt.validation.isValid).toBe(true);
  });
});
