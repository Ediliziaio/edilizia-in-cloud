import { describe, expect, it } from "vitest";

import { buildTettoPrompt } from "@/modules/render-tetto/lib/tettoPromptBuilder";
import { buildRoofPrompt, configPerIlRewriter } from "../../../supabase/functions/generate-roof-render/roofPrompt";
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

/**
 * Il prompt VERO del tetto: generate-roof-render/roofPrompt.ts (prima stava dentro index.ts e
 * nessun test lo caricava; i test qui sopra provano src/modules/…/tettoPromptBuilder.ts, una
 * copia che nessun edge usa).
 */
describe("roof render prompt — quello che usa generate-roof-render", () => {
  const prompt = (overrides: Partial<ConfigurazioneTetto> = {}) => {
    const r = buildRoofPrompt({ config: baseConfig(overrides) as unknown as Record<string, unknown> });
    return { testo: `${r.systemPrompt}\n\n${r.userPrompt}`, payload: r.promptPayload };
  };
  const bloccoF = (testo: string) => testo.slice(testo.indexOf("[BLOCK F"), testo.indexOf("[BLOCK G"));

  it("grondaie in rame, zinco-titanio o acciaio: metallo al naturale, niente colore di default", () => {
    const { testo } = prompt({ tipo_intervento: "lattonerie_accessori", grondaie: { attivo: true, materiale: "rame", colore_hex: "#8b4513" } });
    expect(testo).toContain("matching copper downpipes; gutters and downpipes left in the natural unpainted metal colour.");
    expect(testo).not.toContain("#8b4513");
    // alluminio e PVC sono verniciati: il colore (e quello dei pluviali) resta come prima
    const alluminio = prompt({ grondaie: { attivo: true, materiale: "alluminio", colore_hex: "#3c3c3c", colore_pluviale_hex: "#2b2b2b" } }).testo;
    expect(alluminio).toContain("; gutter color #3c3c3c; downpipe color #2b2b2b.");
  });

  it("solo accessori: il blocco F non presenta come nuova la copertura rimasta nel form", () => {
    const f = bloccoF(prompt({ tipo_intervento: "lattonerie_accessori", grondaie: { attivo: true, materiale: "pvc", colore_hex: "#6b4226" } }).testo);
    expect(f).toContain("Covering active: no");
    expect(f).toContain("Covering type: keep the existing covering exactly as photographed");
    expect(f).toContain("Color / finish: unchanged — keep the photographed colour");
    expect(f).not.toMatch(/tegole_coppi|coppi tiles|Terracotta classico/);
  });

  it("solo colore: cambia il colore, il tipo resta quello della foto", () => {
    const f = bloccoF(prompt({ tipo_intervento: "solo_colore", manto: { tipo: "tegole_coppi", colore_hex: "#6b3f2a", colore_nome: "Marrone scuro anticato", finitura: "opaco" } }).testo);
    expect(f).toContain("Covering active: recolor only");
    expect(f).toContain("Covering type: keep the existing covering exactly as photographed");
    expect(f).toContain("Color / finish: Marrone scuro anticato (#6b3f2a)");
    expect(f).not.toMatch(/coppi tiles/);
  });

  it("sostituzione del manto: il blocco F è quello di prima", () => {
    const f = bloccoF(prompt().testo);
    expect(f).toContain("Covering type: tegole_coppi");
    expect(f).toContain("Color / finish: Terracotta classico (#b5651d)");
  });

  it("al rewriter il manto arriva come «quello della foto» se non si rifà; intatto se si rifà", () => {
    const accessori = baseConfig({ tipo_intervento: "lattonerie_accessori" }) as unknown as Record<string, unknown>;
    expect(configPerIlRewriter(accessori).manto).toEqual({ tipo: "existing covering, kept exactly as photographed: same material, modules and colour" });
    const colore = configPerIlRewriter(baseConfig({ tipo_intervento: "solo_colore" }) as unknown as Record<string, unknown>).manto as Record<string, unknown>;
    expect(colore.tipo).toMatch(/^existing covering, kept exactly as photographed \(recolor only/);
    expect(colore.colore_nome).toBe("Terracotta classico");
    const rifacimento = baseConfig() as unknown as Record<string, unknown>;
    expect(configPerIlRewriter(rifacimento)).toBe(rifacimento);
  });

  it("posizioni di lucernari e fotovoltaico in inglese (prima «at laterale dx», «on falda sud»)", () => {
    const { testo } = prompt({
      lucernari: { attivo: true, azione: "aggiungi", tipo: "abbaino", quantita: 2, posizione: "laterale_dx" },
      pannelli_solari: { attivo: true, tipo: "fotovoltaico_nero", quantita: "medi", posizione: "falda_principale" },
    });
    expect(testo).toContain("front vertical window on the right part of the target slope, with frame color #3c3c3c");
    expect(testo).toContain("Add photovoltaic on the main visible roof slope:");
    expect(testo).not.toMatch(/laterale dx|falda principale/);
  });

  it("scossaline, comignoli, fermaneve e linea vita: righe nel manifesto (che il rewriter riceve) e nel blocco H", () => {
    const { testo, payload } = prompt({
      tipo_intervento: "rifacimento_completo",
      scossaline: { azione: "sostituisci", materiale: "rame", colore_hex: "#8b4513" },
      comignoli: { azione: "rinnova", finitura: "mattoni", colore_hex: "rosso antico" },
      fermaneve: { attivo: true, tipo: "griglia" },
      linea_vita: { attivo: true },
    });
    expect(testo).toContain("Replace the visible sheet-metal flashings only — verge trims, metal ridge and hip cappings, chimney and wall abutment flashings — with natural copper sheet in its natural unpainted colour; same positions and profiles, no new flashing lines.");
    expect(testo).toContain("Refinish the existing chimney stacks only: exposed facing brick with neat mortar joints in colour rosso antico; keep the same number, position, height, section and cap design");
    expect(testo).toContain("Add snow guards on the target slopes: a continuous metal snow-guard grille rail parallel to the eaves");
    expect(testo).toContain("Add a permanent fall-arrest lifeline along the ridge");
    expect(testo).toContain("Flashings / verge trims: replace with the selected sheet metal");
    expect(testo).toContain("Chimneys: refinish the existing stacks only");
    expect(testo).toMatch(/Preserve accessories:\n[\s\S]*- chimney positions, heights and sections/);
    const manifesto = payload.replacement_manifest as { replacements: string[]; additions: string[] };
    expect(manifesto.replacements.some((r) => r.startsWith("Replace the visible sheet-metal flashings"))).toBe(true);
    expect(manifesto.additions.some((r) => r.startsWith("Add snow guards"))).toBe(true);
    // alluminio preverniciato: prende il colore scelto
    expect(prompt({ scossaline: { azione: "sostituisci", materiale: "alluminio", colore_hex: "testa di moro" } }).testo).toContain("with pre-painted aluminium sheet in colour testa di moro;");
  });

  it("fermaneve su una guaina: avviso di compatibilità", () => {
    const { testo } = prompt({ manto: { tipo: "guaina_tpo", colore_hex: "#e8e8e8", colore_nome: "Bianco", finitura: "opaco" }, fermaneve: { attivo: true } });
    expect(testo).toContain("Snow guards belong on pitched slopes");
  });

  it("una configurazione vecchia (senza le voci nuove) non scrive nessuna riga nuova", () => {
    const vecchia = baseConfig();
    const { testo, payload } = prompt(vecchia);
    expect(testo).not.toMatch(/sheet-metal flashings|chimney stacks|snow guards on|lifeline|Flashings \/ verge trims|Ridge lifeline/);
    expect((payload.accessory_compatibility as { preserve_accessories: string[] }).preserve_accessories).toContain("chimneys");
    // spente esplicitamente (come nel default del form): stesso testo
    const spente = prompt({ scossaline: { azione: "mantieni" }, comignoli: { azione: "mantieni" }, fermaneve: { attivo: false }, linea_vita: { attivo: false } }).testo;
    expect(spente).toBe(testo);
  });
});
