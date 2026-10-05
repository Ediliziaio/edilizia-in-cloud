import { describe, expect, it } from "vitest";
import { DEFAULT_BATHROOM_CONFIG } from "@/components/render-bagno/defaultBathroomConfig";
import { buildBathroomRenderConfig } from "../../../shared/render-bathroom/bathroomRenderConfig.ts";
import { buildBathroomPrompt } from "../../../shared/render-bathroom/bathroomPromptBuilder.ts";
import { normalizeBathroomSceneAnalysis } from "../../../shared/render-bathroom/bathroomSceneAnalysis.ts";
import { bathroomQaContext } from "../../../shared/render-bathroom/bathroomQa.ts";
import { validateBathroomPromptConfig } from "../../../shared/render-bathroom/bathroomPromptValidation.ts";
import { BATH_SCREEN_DESCRIPTIONS } from "../../../shared/render-bathroom/promptFragments.ts";
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

  // v2.1.0 (audit 16/07) — FIXTURE COUNT CONTRACT: i conteggi dei sanitari
  // devono stare in CIMA al prompt (i modelli ignorano le regole sepolte)
  // ed essere corretti: 1 WC, conversione vasca→doccia = zero vasche.
  it("puts the fixture count contract first with exact sanitary counts", () => {
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
      sanitary_ware: {
        wc_present: true,
        wc_type: "a_terra",
        bidet_present: true,
        bidet_type: "a_terra",
        position: "left_wall",
        notes: "wc and bidet visible",
      },
    });

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, analysis);
    // Il contratto è il PRIMO blocco del prompt
    expect(prompt.userPrompt.startsWith("[🚨 FIXTURE COUNT CONTRACT")).toBe(true);
    // Esattamente 1 WC, mai due
    expect(prompt.userPrompt).toContain("1 toilet (WC)");
    expect(prompt.userPrompt).toContain("NEVER render two toilets");
    // Conversione vasca→doccia: 1 doccia, 0 vasche
    expect(prompt.userPrompt).toContain("1 shower and 0 bathtub");
    expect(prompt.userPrompt).toContain("ZERO bathtubs may remain");
    expect(prompt.promptVersion).toBe("2.1.0");
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
    config.sanitari.piastra_wc = "rettangolare_sottile";
    config.sanitari.piastra_wc_colore = "nero_opaco";
    config.sanitari.azione_bidet = "sostituisci";
    config.sanitari.tipo_bidet = "sospeso";

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("wall-hung sanitary ware");
    expect(prompt.userPrompt.toLowerCase()).toContain("concealed in-wall cistern");
    expect(prompt.userPrompt.toLowerCase()).toContain("selected wall flush plate is mandatory");
    expect(prompt.userPrompt.toLowerCase()).toContain("matte black flush plate");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not add a second toilet");
    expect(prompt.userPrompt.toLowerCase()).toContain("same wall plane above/behind that wc");
    expect(prompt.userPrompt.toLowerCase()).toContain("one-for-one replacement in the existing sanitary zone");
    expect(prompt.userPrompt.toLowerCase()).toContain("no floor contact pedestal");
    expect(prompt.userPrompt.toLowerCase()).toContain("never an exposed old-style bulky tank");
    expect(prompt.negativePrompt.toLowerCase()).toContain("missing wall flush plate");
    expect(prompt.negativePrompt.toLowerCase()).toContain("floor-standing wc when wall-hung wc is selected");
    expect(prompt.negativePrompt.toLowerCase()).toContain("duplicated wc");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps slab-scale tile instructions explicit for 120x240 selections", () => {
    const config = cloneConfig();
    config.sostituzione.piastrelle_parete = true;
    config.piastrelle_parete.attivo = true;
    config.piastrelle_parete.effetto = "marmo_verde_guatemala";
    config.piastrelle_parete.formato = "120x240";
    config.sostituzione.pavimento = true;
    config.pavimento.attivo = true;
    config.pavimento.effetto = "marmo_carrara";
    config.pavimento.formato = "120x240";

    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.technical_specification.wallTiles.formatCategory).toBe("architectural_slab");
    expect(renderConfig.technical_specification.wallTiles.moduleScaleRule.toLowerCase()).toContain("few very large modules");
    expect(renderConfig.technical_specification.floor.groutDensityRule.toLowerCase()).toContain("extremely low");
    expect(renderConfig.technical_specification.wallTiles.realScaleLockRule.toLowerCase()).toContain("120x240 cm");
    expect(renderConfig.technical_specification.wallTiles.realScaleLockRule.toLowerCase()).toContain("floor-to-ceiling");

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("format family: architectural_slab");
    expect(prompt.userPrompt.toLowerCase()).toContain("few very large modules");
    expect(prompt.userPrompt.toLowerCase()).toContain("never as a dense small-tile grid");
    expect(prompt.userPrompt.toLowerCase()).toContain("do not downscale it into 60x60");
    expect(prompt.negativePrompt.toLowerCase()).toContain("60x60 grid");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("forces freestanding bathtub to keep adult real-world scale", () => {
    const config = cloneConfig();
    config.sostituzione.vasca = true;
    config.vasca.attivo = true;
    config.vasca.tipo = "freestanding_ovale";
    config.vasca.dimensione_cm = "180x80";

    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("nominal real-world footprint: 180x80 cm");
    expect(prompt.userPrompt.toLowerCase()).toContain("full adult bathtub footprint");
    expect(prompt.userPrompt.toLowerCase()).toContain("must not become a small decorative bowl");
    expect(prompt.negativePrompt.toLowerCase()).toContain("tiny bathtub");
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

/**
 * Il percorso vero di produzione: l'edge «analyze» restituisce l'analisi GIÀ
 * normalizzata, il wizard la ripassa a buildBathroomRenderConfig e salva il
 * payload v2, l'edge rilegge il payload. Tre normalizzazioni in fila.
 */
function promptDiProduzione(config: ConfigurazioneBagno, analysis: Record<string, unknown>) {
  const daEdge = JSON.parse(JSON.stringify(normalizeBathroomSceneAnalysis(analysis)));
  const payload = JSON.parse(JSON.stringify(buildBathroomRenderConfig(config, { sceneAnalysis: daEdge })));
  return buildBathroomPrompt(payload, payload.scene_analysis);
}

describe("bug corretti (audit render bagno 04/10)", () => {
  it("l'analisi normalizzata due volte non perde sanitari, finestra e termoarredo", () => {
    const una = normalizeBathroomSceneAnalysis(baseAnalysis({ towel_warmer_present: true, towel_warmer_type: "ladder radiator" }));
    const due = normalizeBathroomSceneAnalysis(JSON.parse(JSON.stringify(una)));
    expect(due).toEqual(una);
    expect(due.sanitaryWare.wcPresent).toBe(true);
    expect(due.windowPresent).toBe(true);
    expect(due.towelWarmerPresent).toBe(true);
    expect(due.wallTiles.description).toBe("pink-beige ceramic wall tiles");
  });

  it("produzione: con i sanitari non toccati il contratto conta il WC e il bidet della foto (prima diceva 0)", () => {
    const config = cloneConfig(); // solo piastrelle e pavimento
    const prompt = promptDiProduzione(config, baseAnalysis());
    expect(prompt.userPrompt).toContain("- 1 toilet (WC) — the existing WC, kept exactly as photographed");
    expect(prompt.userPrompt).toContain("- 1 bidet — the existing bidet, kept exactly as photographed");
    expect(prompt.userPrompt).not.toContain("0 toilet (WC)");
    expect(prompt.userPrompt).toContain("Existing sanitary ware: toilet floor standing, bidet floor standing");
    expect(prompt.userPrompt).toContain("Window present: yes (back_wall)");
  });

  it("un WC «back_to_wall» dell'analisi resta filo muro (prima diventava sospeso: «back_to_wall» contiene «wall»)", () => {
    const scena = normalizeBathroomSceneAnalysis(baseAnalysis({
      sanitary_ware: { wc_present: true, wc_type: "back_to_wall", bidet_present: true, bidet_type: "wall_hung", position: "left_wall", notes: "" },
    }));
    expect(scena.sanitaryWare.wcType).toBe("back_to_wall");
    expect(scena.sanitaryWare.bidetType).toBe("wall_hung");
  });

  it("QA: il WC sospeso scelto attiva il controllo «wallhung_violation» (prima cercava «sospeso» in un testo inglese)", () => {
    const config = cloneConfig();
    config.sostituzione.sanitari = true;
    config.sanitari.attivo = true;
    config.sanitari.tipo_wc = "rimless_sospeso";
    const qa = bathroomQaContext(buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() }));
    expect(qa.wallHungSelected).toBe(true);
    expect(qa.modificheAutorizzate).toContain("the WC (now WALL-HUNG) and the other sanitary ware are REPLACED one-for-one with new models");

    config.sanitari.tipo_wc = "a_terra";
    expect(bathroomQaContext(buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() })).wallHungSelected).toBe(false);
  });

  it("QA: un «aggiungi bidet» rimasto nel form con i sanitari spenti non autorizza un bidet nuovo", () => {
    const config = cloneConfig();
    config.sanitari.azione_bidet = "aggiungi";
    const qa = bathroomQaContext(buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis({ sanitary_ware: { wc_present: true, wc_type: "floor_standing", bidet_present: false, position: "left_wall" } }) }));
    expect(qa.modificheAutorizzate.join(" ")).not.toContain("NEW BIDET");
  });

  it("mobile da 120 cm con «Singolo lavabo»: un lavabo solo (prima la larghezza ne imponeva due)", () => {
    const config = cloneConfig();
    config.sostituzione.mobile_bagno = true;
    config.vanity.attivo = true;
    config.vanity.larghezza_cm = 120;
    config.vanity.numero_lavabi = 1;
    expect(buildBathroomRenderConfig(config).technical_specification.vanity.basinCount).toBe(1);
    expect(buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis()).userPrompt).toContain("- 1 washbasin on ONE single vanity unit");
    // Senza scelta esplicita resta la regola della larghezza.
    delete config.vanity.numero_lavabi;
    expect(buildBathroomRenderConfig(config).technical_specification.vanity.basinCount).toBe(2);
  });

  it("rubinetti non sostituiti: il blocco J non ripete la finitura rimasta nel form", () => {
    const config = cloneConfig(); // rubinetteria spenta, finitura di default nero opaco
    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.blocks.J).toContain("Faucet replacement requested: no");
    expect(prompt.blocks.J).not.toContain("matte black finish");
    expect(prompt.blocks.J).toContain("Primary finish: unchanged — keep the existing faucets");
    config.sostituzione.rubinetteria = true;
    config.rubinetteria.attivo = true;
    expect(buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis()).blocks.J).toContain("Primary finish: matte black finish");
  });

  it("specchio tondo o verticale: nessuna luce integrata (quella è la scelta «retroilluminato»)", () => {
    const config = cloneConfig();
    config.sostituzione.mobile_bagno = true;
    config.vanity.attivo = true;
    config.vanity.specchio = "tondo";
    expect(buildBathroomRenderConfig(config).technical_specification.vanity.mirrorLighting).toBe("none — a plain mirror with no integrated lighting");
    config.vanity.specchio = "retroilluminato";
    expect(buildBathroomRenderConfig(config).technical_specification.vanity.mirrorLighting).toBe("integrated backlighting");
  });
});

/** Il payload come lo salva il wizard e lo rilegge l'edge (giro in JSON compreso). */
function payloadSalvato(config: ConfigurazioneBagno, analysis: Record<string, unknown> = baseAnalysis()) {
  return JSON.parse(JSON.stringify(buildBathroomRenderConfig(config, { sceneAnalysis: analysis })));
}

function docciaWalkIn(): ConfigurazioneBagno {
  const config = cloneConfig();
  config.sostituzione.doccia = true;
  config.doccia.attivo = true;
  config.doccia.tipo = "walk_in";
  return config;
}

describe("elementi nuovi (04/10/2026): assenti = prompt di prima", () => {
  it("una configurazione senza i campi nuovi non porta nessuna chiave nuova nel payload né frasi nuove nel prompt", () => {
    const config = docciaWalkIn();
    config.sostituzione.vasca = true;
    config.vasca.attivo = true;
    config.vasca.tipo = "incassata";
    const payload = payloadSalvato(config);
    const json = JSON.stringify(payload.technical_specification);
    for (const chiave of ["wallNicheRule", "screenRule", "towelWarmer", "ceilingRule"]) expect(json).not.toContain(chiave);
    const prompt = buildBathroomPrompt(payload, payload.scene_analysis);
    // La nicchia resta la regola di prima per la walk-in.
    expect(prompt.userPrompt).toContain("wall niche: requested / plausible if spatially coherent");
    expect(prompt.userPrompt).toContain("drain type: linear drain or discreet premium drain solution");
    for (const frase of ["Towel warmer (", "bath screen:", "Inside the new shower", "Do not alter: ceiling —", "drains through"]) {
      expect(prompt.userPrompt).not.toContain(frase);
    }
    expect(prompt.userPrompt).toContain("Do not alter: ceiling.");
  });

  it("i campi nuovi si leggono da legacy_config (dove li scrive il wizard), non dal livello alto del payload", () => {
    const config = docciaWalkIn();
    const payload = payloadSalvato(config);
    // Messi per sbaglio al livello alto: nessun effetto.
    payload.doccia = { ...config.doccia, nicchia: "verticale" };
    payload.termoarredo = { attivo: true, azione: "aggiungi", tipo: "scaletta", finitura: "bianco" };
    expect(buildBathroomPrompt(payload, payload.scene_analysis).userPrompt).not.toContain("recessed vertical niche");
    // Scritti dal form (legacy_config → specifica calcolata al salvataggio): arrivano all'edge.
    config.doccia.nicchia = "verticale";
    config.sostituzione.termoarredo = true;
    config.termoarredo = { attivo: true, azione: "aggiungi", tipo: "scaletta", finitura: "bianco" };
    const giusto = payloadSalvato(config);
    const prompt = buildBathroomPrompt(giusto, giusto.scene_analysis);
    expect(prompt.userPrompt).toContain("wall niche: one recessed vertical niche");
    expect(prompt.userPrompt).toContain("Towel warmer (new, added): ladder towel warmer");
    expect(bathroomQaContext(giusto).modificheAutorizzate.join("\n")).toMatch(/TOWEL WARMER is ADDED[\s\S]*recessed NICHE/);
  });
});

describe("elemento nuovo: nicchia nella parete doccia", () => {
  it("indicata → descritta nel blocco E e costruita nelle aggiunte; il QA la autorizza", () => {
    const config = docciaWalkIn();
    config.doccia.nicchia = "orizzontale";
    const payload = payloadSalvato(config);
    expect(payload.technical_specification.shower.wallNiche).toBe(true);
    const prompt = buildBathroomPrompt(payload, payload.scene_analysis);
    expect(prompt.blocks.E).toContain("wall niche: one long horizontal recessed niche about 60-90 cm wide");
    expect(prompt.userPrompt).toContain("Inside the new shower, build one long horizontal recessed niche");
    expect(prompt.validation.isValid).toBe(true);
    expect(bathroomQaContext(payload).modificheAutorizzate.some((r) => r.includes("recessed NICHE"))).toBe(true);
  });

  it("«nessuna» spegne la nicchia che la walk-in aveva per default", () => {
    const config = docciaWalkIn();
    config.doccia.nicchia = "nessuna";
    const payload = payloadSalvato(config);
    expect(payload.technical_specification.shower.wallNiche).toBe(false);
    const prompt = buildBathroomPrompt(payload, payload.scene_analysis);
    expect(prompt.blocks.E).toContain("wall niche: no recessed niche: keep the shower walls flat");
    expect(prompt.userPrompt).not.toContain("Inside the new shower, build");
    expect(bathroomQaContext(payload).modificheAutorizzate.some((r) => r.includes("NICHE"))).toBe(false);
  });

  it("con la doccia spenta la nicchia non entra nel prompt", () => {
    const config = cloneConfig();
    config.doccia.nicchia = "verticale";
    expect(buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis()).userPrompt).not.toContain("recessed vertical niche");
  });
});

describe("elemento nuovo: scarico della doccia", () => {
  it("piletta su una walk-in: niente canalina dedotta", () => {
    const config = docciaWalkIn();
    config.doccia.scarico = "piletta";
    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.blocks.E).toContain("drain type: small square point drain");
    expect(prompt.userPrompt).toContain("The new shower drains through a small square point drain");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("canalina su un piatto semicircolare: incompatibile, il builder mette la piletta e lo dice", () => {
    const config = docciaWalkIn();
    config.doccia.tipo = "semicircolare";
    config.doccia.piatto = "rialzato_3cm";
    config.doccia.scarico = "canalina";
    const renderConfig = buildBathroomRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.technical_specification.shower.drainType).toContain("a linear channel cannot follow the curved quadrant tray");
    expect(validateBathroomPromptConfig(renderConfig).isValid).toBe(true);
    // Se la specifica la tenesse, la validazione lo segnalerebbe.
    renderConfig.technical_specification.shower.drainType = "slim linear channel drain running along the back wall of the shower";
    expect(validateBathroomPromptConfig(renderConfig).missingBusinessRules).toContain("a semicircular quadrant tray cannot take a linear channel drain");
  });
});

describe("elemento nuovo: parete doccia sulla vasca", () => {
  function vasca(tipo: ConfigurazioneBagno["vasca"]["tipo"], parete: ConfigurazioneBagno["vasca"]["parete_doccia"]) {
    const config = cloneConfig();
    config.sostituzione.vasca = true;
    config.vasca.attivo = true;
    config.vasca.tipo = tipo;
    config.vasca.parete_doccia = parete;
    return config;
  }

  it("fissa su una vasca incassata: descritta, montata e autorizzata; il contratto dice che non è una seconda doccia", () => {
    const payload = payloadSalvato(vasca("incassata", "fissa"));
    const prompt = buildBathroomPrompt(payload, payload.scene_analysis);
    expect(prompt.blocks.E).toContain("bath screen: one fixed clear-glass bath screen standing on the tub rim");
    expect(prompt.userPrompt).toContain("- Fit one fixed clear-glass bath screen");
    expect(prompt.userPrompt).toContain("they are not a separate shower");
    expect(prompt.validation.isValid).toBe(true);
    expect(bathroomQaContext(payload).modificheAutorizzate.some((r) => r.includes("GLASS BATH SCREEN"))).toBe(true);
  });

  it("su una freestanding non si monta: il builder lo scrive e la validazione controlla", () => {
    const renderConfig = buildBathroomRenderConfig(vasca("freestanding_ovale", "girevole"), { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.technical_specification.bathtub.screenRule).toMatch(/^no bath screen: a freestanding tub/);
    expect(renderConfig.replacement_manifest.additions.join(" ")).not.toContain("Fit ");
    expect(validateBathroomPromptConfig(renderConfig).isValid).toBe(true);
    renderConfig.technical_specification.bathtub.screenRule = BATH_SCREEN_DESCRIPTIONS.girevole;
    expect(validateBathroomPromptConfig(renderConfig).missingBusinessRules).toContain("a freestanding bathtub cannot carry a glass bath screen");
  });

  it("«nessuna» con un vetro nella foto: la regola di rimozione c'è", () => {
    const analysis = baseAnalysis({ bathtub: { present: true, type: "incassata", position: "back_wall", faucet_type: "wall", screen_present: true, notes: "" }, presenza_vasca: true });
    const renderConfig = buildBathroomRenderConfig(vasca("incassata", "nessuna"), { sceneAnalysis: analysis });
    expect(renderConfig.replacement_manifest.removals.map((r) => r.code)).toContain("remove_existing_bath_screen");
  });
});

describe("elemento nuovo: termoarredo", () => {
  function termoarredo(azione: "sostituisci" | "aggiungi" | "rimuovi") {
    const config = cloneConfig();
    config.sostituzione.termoarredo = true;
    config.termoarredo = { attivo: true, azione, tipo: "tubi_verticali", finitura: "nero_opaco" };
    return config;
  }
  const conTermoarredo = () => baseAnalysis({ towel_warmer_present: true, towel_warmer_type: "white ladder radiator" });

  it("sostituisci: blocco J, manifest, rimozione del vecchio; il vecchio non è più tra le cose da conservare", () => {
    const renderConfig = buildBathroomRenderConfig(termoarredo("sostituisci"), { sceneAnalysis: conTermoarredo() });
    expect(renderConfig.technical_specification.towelWarmer?.finish).toBe("matte black finish");
    expect(renderConfig.replacement_manifest.replacements).toContain("Replace the towel warmer with a vertical-tube towel warmer: a row of slim vertical tubes joined at top and bottom, with a towel bar, wall-mounted, matte black finish.");
    expect(renderConfig.replacement_manifest.removals.map((r) => r.code)).toContain("replace_existing_towel_warmer");
    expect(renderConfig.replacement_manifest.preserveExactly.join(" ")).not.toMatch(/towel warmer/i);
    expect(renderConfig.replacement_manifest.untouchedSurfaces.join(" ")).not.toMatch(/towel warmer/i);
    const prompt = buildBathroomPrompt(termoarredo("sostituisci") as unknown as Record<string, unknown>, conTermoarredo());
    expect(prompt.blocks.J).toContain("Towel warmer (replacement): vertical-tube towel warmer");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("rimuovi: regola di rimozione e niente modello", () => {
    const renderConfig = buildBathroomRenderConfig(termoarredo("rimuovi"), { sceneAnalysis: conTermoarredo() });
    expect(renderConfig.technical_specification.towelWarmer?.typeLabel).toBeNull();
    expect(renderConfig.replacement_manifest.removals.map((r) => r.code)).toContain("remove_existing_towel_warmer");
    expect(renderConfig.replacement_manifest.additions.join(" ")).not.toContain("Install a");
    expect(bathroomQaContext(renderConfig).modificheAutorizzate).toContain("the existing TOWEL WARMER / radiator is REMOVED");
    expect(validateBathroomPromptConfig(renderConfig).isValid).toBe(true);
  });

  it("sezione spenta (o mai toccata): niente termoarredo nella specifica e il vecchio resta da conservare", () => {
    const spento = termoarredo("aggiungi");
    spento.sostituzione.termoarredo = false;
    const renderConfig = buildBathroomRenderConfig(spento, { sceneAnalysis: conTermoarredo() });
    expect(renderConfig.technical_specification.towelWarmer).toBeUndefined();
    expect(renderConfig.replacement_manifest.preserveExactly.join(" ")).toMatch(/towel warmer/i);
  });
});

describe("elemento nuovo: illuminazione (prima il form non aveva il comando)", () => {
  it("faretti a incasso: descrizione inglese e soffitto conservato con le luci nuove", () => {
    const config = cloneConfig();
    config.sostituzione.illuminazione = true;
    config.illuminazione_tipo = "faretti_incasso";
    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt).toContain("Update lighting with recessed ceiling downlights");
    expect(prompt.userPrompt).toContain("Do not alter: ceiling — only the selected light fixtures are added to the ceiling");
    expect(prompt.userPrompt).not.toContain("faretti_incasso");
  });

  it("un testo libero di una configurazione vecchia resta com'era (e il soffitto resta «ceiling»)", () => {
    const config = cloneConfig();
    config.sostituzione.illuminazione = true;
    config.illuminazione_tipo = "faretti caldi sopra lo specchio";
    const prompt = buildBathroomPrompt(config as unknown as Record<string, unknown>, baseAnalysis());
    expect(prompt.userPrompt).toContain("Update lighting with faretti caldi sopra lo specchio.");
    expect(prompt.userPrompt).toContain("Do not alter: ceiling.");
  });
});
