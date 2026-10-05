import { describe, expect, it } from "vitest";

import { DEFAULT_FACCIATA_CONFIG } from "@/components/render-facciata/defaultFacciataConfig";
import { buildFacciataRenderConfig } from "@/modules/render-facciata/lib/facciataRenderConfig";
import { buildFacciataPrompt } from "../../../shared/render-facciata/facciataPromptBuilder";
import { normalizeFacciataSceneAnalysis } from "@/modules/render-facciata/lib/facciataSceneAnalysis";
import type { ConfigurazioneFacciata } from "@/modules/render-facciata/lib/types";

function cloneConfig(): ConfigurazioneFacciata {
  return structuredClone(DEFAULT_FACCIATA_CONFIG);
}

function baseAnalysis(overrides: Record<string, unknown> = {}) {
  return normalizeFacciataSceneAnalysis({
    building_type: "residential facade",
    building_style: "traditional italian townhouse",
    floors_count: 3,
    openings_visible: 6,
    camera_angle: "front-facing facade shot",
    lighting_condition: "soft afternoon daylight",
    wall_texture: "fine mineral plaster",
    current_plaster_finish: "smooth plaster",
    current_facade_color: "#D8D2C7",
    current_condition: "weathered but regular",
    preserved_context: ["sky", "road", "vegetation"],
    preserve_rigidly: ["same building geometry", "same facade crop"],
    window_cornices: true,
    string_courses: true,
    sills: true,
    base_course: true,
    gutters: true,
    downpipes: true,
    balconies: true,
    railings: true,
    shutters: true,
    note_analisi: "preserve the same residential building identity",
    openings: [
      {
        id: "A",
        label: "Main opening",
        position: "center",
        floor_hint: "upper floor",
        opening_kind: "window",
        apparent_size: "medium",
        has_cornice: true,
        has_sill: true,
        sill_material: "stone",
        has_shutter: true,
        shutter_type: "persiane verdi",
        has_balcony: false,
        has_railing: false,
        reveal_depth: "medium reveal",
        lighting_notes: "soft daylight from the left",
        shadow_notes: "thin contact shadows under sills",
        preserve_notes: "keep the opening geometry unchanged",
      },
    ],
    tipo_edificio: "residenziale",
    numero_piani: 3,
    numero_finestre: 6,
    intonaco_attuale: "intonaco civile",
    colore_attuale_hex: "#D8D2C7",
    stato_conservazione: "usura media",
    elementi_presenti: ["cornici", "marcapiani", "ringhiere"],
    ...overrides,
  });
}

describe("facciata render pipeline", () => {
  it("keeps the intervention superficial for paint-only", () => {
    const config = cloneConfig();
    config.tipo_intervento = "tinteggiatura";
    config.intonaco.attivo = true;
    config.rivestimento.attivo = false;
    config.cappotto.attivo = false;
    config.elementi.cornici_finestre.azione = "mantieni";
    config.elementi.marcapiani.azione = "mantieni";
    config.elementi.davanzali.azione = "mantieni";
    config.elementi.zoccolatura.azione = "mantieni";
    config.elementi.gronde.azione = "mantieni";
    config.elementi.balconi_ringhiere.azione = "mantieni";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint only");
    expect(prompt.userPrompt.toLowerCase()).not.toContain("advance the facade plane");
    expect(prompt.userPrompt.toLowerCase()).toContain("no cladding must be introduced");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("makes reveal depth and sill adaptation explicit for 10cm insulation", () => {
    const config = cloneConfig();
    config.tipo_intervento = "cappotto";
    config.cappotto.attivo = true;
    config.cappotto.spessore_cm = 10;
    config.cappotto.zona = "tutta";

    const renderConfig = buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.replacements.some((line) => line.includes("10cm"))).toBe(true);

    const prompt = buildFacciataPrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("reveal depth logic");
    expect(prompt.userPrompt.toLowerCase()).toContain("sill extension logic");
    expect(prompt.userPrompt.toLowerCase()).toContain("edge profile logic");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("limits cladding to the ground floor when requested", () => {
    const config = cloneConfig();
    config.tipo_intervento = "rivestimento";
    config.rivestimento.attivo = true;
    config.rivestimento.zona = "piano_terra";
    config.intonaco.zona = "piani_superiori";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("apply cladding only to ground floor");
    expect(prompt.userPrompt.toLowerCase()).toContain("upper floors must remain untouched");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes window cornices and restores the wall cleanly", () => {
    const config = cloneConfig();
    config.elementi.cornici_finestre.azione = "rimuovi";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("remove all existing window cornices completely");
    expect(prompt.userPrompt.toLowerCase()).toContain("patch and re-finish the wall");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes sill replacement without altering windows", () => {
    const config = cloneConfig();
    config.elementi.davanzali.azione = "sostituisci";
    config.elementi.davanzali.materiale = "marmo";
    config.elementi.davanzali.colore_hex = "#D9D7D1";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("replace existing sills");
    expect(prompt.userPrompt.toLowerCase()).toContain("without altering the windows");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("repaints railings without changing balcony geometry", () => {
    const config = cloneConfig();
    config.elementi.balconi_ringhiere.azione = "vernicia";
    config.elementi.balconi_ringhiere.colore_hex = "#2E3136";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint balcony railings only");
    expect(prompt.userPrompt.toLowerCase()).toContain("keeping the exact geometry");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("coordinates mixed intervention without conflicts", () => {
    const config = cloneConfig();
    config.tipo_intervento = "misto";
    config.intonaco.attivo = true;
    config.intonaco.zona = "piani_superiori";
    config.rivestimento.attivo = true;
    config.rivestimento.zona = "piano_terra";
    config.cappotto.attivo = true;
    config.cappotto.spessore_cm = 8;
    config.elementi.zoccolatura.azione = "aggiungi";
    config.elementi.balconi_ringhiere.azione = "vernicia";

    const renderConfig = buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.replacement_manifest.transitionRules.length).toBeGreaterThan(0);

    const prompt = buildFacciataPrompt(renderConfig as unknown as Record<string, unknown>);
    expect(prompt.userPrompt.toLowerCase()).toContain("ground-floor cladding");
    expect(prompt.userPrompt.toLowerCase()).toContain("upper-floor plaster");
    expect(prompt.userPrompt.toLowerCase()).toContain("base course");
    expect(prompt.userPrompt.toLowerCase()).toContain("repaint balcony railings only");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps finish identity explicit for textured plaster selections", () => {
    const config = cloneConfig();
    config.tipo_intervento = "misto";
    config.intonaco.attivo = true;
    config.intonaco.finitura = "bugnato";

    const prompt = buildFacciataPrompt(
      buildFacciataRenderConfig(config, { sceneAnalysis: baseAnalysis() }) as unknown as Record<string, unknown>,
    );
    expect(prompt.userPrompt.toLowerCase()).toContain("raised ashlar-like geometry");
    expect(prompt.userPrompt.toLowerCase()).toContain("must stay visually exact");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("normalizes legacy or alternate analysis keys without losing facade context", () => {
    const analysis = normalizeFacciataSceneAnalysis({
      building_type: "residential apartment building",
      architectural_style: "contemporary residential",
      floors_count: 4,
      visible_openings: 8,
      primary_color: "#E5DED2",
      current_finish: "fine scratched plaster",
      features: {
        balconies: true,
        railings: true,
        sills: true,
      },
    });

    expect(analysis.buildingStyle).toBe("contemporary residential");
    expect(analysis.openingsVisible).toBe(8);
    expect(analysis.currentFacadeColor).toBe("#E5DED2");
    expect(analysis.currentPlasterFinish).toBe("fine scratched plaster");
    expect(analysis.features.balconi).toBe(true);
    expect(analysis.features.ringhiere).toBe(true);
    expect(analysis.features.davanzali).toBe(true);
  });
});

/** Il percorso vero: analisi normalizzata dall'edge, rinormalizzata dal client, piano salvato, edge di nuovo. */
function promptDalPercorsoVero(config: ConfigurazioneFacciata) {
  const server = normalizeFacciataSceneAnalysis(baseAnalysis(), null);
  const client = normalizeFacciataSceneAnalysis(server, null);
  const plan = buildFacciataRenderConfig(config, { sceneAnalysis: client });
  return buildFacciataPrompt(plan as unknown as Record<string, unknown>);
}

const bloccoG = (prompt: { blocks: Record<string, string> }) => prompt.blocks.G;

describe("facciata: correzioni (audit 10/2026)", () => {
  it("l'analisi della scena si può normalizzare più volte senza perdere piani, aperture, finitura e cornici", () => {
    const una = normalizeFacciataSceneAnalysis(baseAnalysis(), null);
    const due = normalizeFacciataSceneAnalysis(una, null);
    expect(due).toEqual(una);
    expect(due.floorsCount).toBe(3);
    expect(due.openingsVisible).toBe(6);
    expect(due.currentPlasterFinish).toBe("smooth plaster");
    expect(due.features.corniciFinestre).toBe(true);
    // prima ogni facciata diventava di due piani: il QA boccia proprio i piani aggiunti o tolti
    const prompt = promptDalPercorsoVero(cloneConfig());
    expect(prompt.userPrompt).toContain("Floors: 3");
    expect(prompt.userPrompt).toContain("Visible openings: 6");
    expect(prompt.userPrompt).toMatch(/Detected architectural details: window cornices/);
  });

  it("zone: «entire facade» toccata non lascia «ground floor» e «upper floors» tra le intatte, e viceversa", () => {
    const tutta = promptDalPercorsoVero(cloneConfig());
    expect(tutta.userPrompt).toMatch(/Zones affected: entire facade\n/);
    expect(tutta.userPrompt).not.toMatch(/Zones untouched:[^\n]*(ground floor|upper floors)/);

    const config = cloneConfig();
    config.tipo_intervento = "misto";
    config.intonaco.zona = "piani_superiori";
    config.rivestimento.attivo = true;
    config.rivestimento.zona = "piano_terra";
    const divisa = promptDalPercorsoVero(config);
    expect(divisa.userPrompt).not.toMatch(/Zones untouched:[^\n]*entire facade/);

    // solo un elemento (ringhiere): la parete resta intatta, come prima
    const soloRinghiere = cloneConfig();
    soloRinghiere.intonaco.attivo = false;
    soloRinghiere.elementi.balconi_ringhiere = { azione: "vernicia", colore_hex: "#2E3136" };
    expect(promptDalPercorsoVero(soloRinghiere).userPrompt).toMatch(/Zones untouched: entire facade, ground floor, upper floors/);
  });

  it("i colori scelti nel form arrivano al prompt: ringhiere, cornici, marcapiani", () => {
    const config = cloneConfig();
    config.elementi.balconi_ringhiere = { azione: "vernicia", colore_hex: "#2E3136" };
    config.elementi.cornici_finestre = { azione: "aggiungi", colore_hex: "#FFFFFF" };
    config.elementi.marcapiani = { azione: "aggiungi", spessore: "6 cm", colore_hex: "grigio perla" };
    const g = bloccoG(promptDalPercorsoVero(config));
    expect(g).toContain("keeping the exact geometry, rhythm and metal design; new railing colour #2E3136");
    expect(g).toContain("without altering the opening size; cornice colour #FFFFFF");
    expect(g).toContain("aligned across the facade; string course colour grigio perla");
    // senza colore il testo resta quello di prima
    const senza = bloccoG(promptDalPercorsoVero(cloneConfig()));
    expect(senza).not.toMatch(/colour/);
  });

  it("cappotto senza intonaco: il colore della finitura entra nel prompt; con l'intonaco comanda l'intonaco", () => {
    const config = cloneConfig();
    config.tipo_intervento = "cappotto";
    config.intonaco.attivo = false;
    config.cappotto = { attivo: true, spessore_cm: 12, sistema: "lana_roccia", colore_finitura_hex: "#E6DCCB", zona: "tutta" };
    expect(promptDalPercorsoVero(config).blocks.F).toContain("System: ETICS thermal insulation with mineral wool boards and reinforced render finish, final render coloured #E6DCCB.");
    config.intonaco.attivo = true;
    expect(promptDalPercorsoVero(config).blocks.F).not.toContain("final render coloured");
  });
});

describe("facciata: elementi aggiunti (audit 10/2026)", () => {
  it("gronde e pluviali: cinque materiali in inglese; i metalli restano al naturale, alluminio e PVC prendono il colore", () => {
    const config = cloneConfig();
    config.elementi.gronde = { azione: "sostituisci", materiale: "rame", colore_hex: "#8b4513" };
    const rame = bloccoG(promptDalPercorsoVero(config));
    expect(rame).toContain("Gutters/eaves: replace gutters and downpipes with natural copper half-round gutters and round downpipes with soldered joints and copper hangers, left in the natural unpainted metal colour");
    expect(rame).not.toContain("#8b4513");
    config.elementi.gronde = { azione: "sostituisci", materiale: "alluminio", colore_hex: "testa di moro" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("pre-painted aluminium half-round gutters and downpipes with slim hangers, painted in colour testa di moro");
    for (const m of ["zinco_titanio", "acciaio_zincato", "pvc"] as const) {
      config.elementi.gronde = { azione: "sostituisci", materiale: m };
      expect(bloccoG(promptDalPercorsoVero(config)), m).toMatch(/replace gutters and downpipes with /);
    }
  });

  it("gronde: senza materiale o con il testo libero dei form vecchi il testo resta quello di prima", () => {
    const config = cloneConfig();
    config.elementi.gronde = { azione: "sostituisci" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("replace gutters/eaves accessories with alluminio in a coherent architectural finish");
    config.elementi.gronde = { azione: "sostituisci", materiale: "lamiera" as never };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("replace gutters/eaves accessories with lamiera in a coherent architectural finish");
  });

  it("persiane: riverniciare quelle esistenti, stesso modello, col colore; senza la voce il prompt non cambia", () => {
    const config = cloneConfig();
    config.elementi.persiane = { azione: "vernicia", colore_hex: "verde vagone RAL 6009" };
    const prompt = promptDalPercorsoVero(config);
    expect(prompt.blocks.G).toContain("Window shutters: repaint the existing window shutters only, keeping their type, slats, frames, hinges, size and open or closed position exactly; new shutter colour verde vagone RAL 6009");
    expect(prompt.blocks.C).toContain("Repaint the existing window shutters only in colour verde vagone RAL 6009; preserve their type, slats");
    expect(prompt.blocks.C).toMatch(/Active systems: [^\n]*persiane/);
    expect(prompt.blocks.C).toMatch(/Zones affected: [^\n]*window shutters/);
    expect(prompt.validation.isValid).toBe(true);

    // senza colore: avviso di validazione
    config.elementi.persiane = { azione: "vernicia" };
    expect(promptDalPercorsoVero(config).validation.missingBusinessRules).toContain("shutter repaint must state the new colour");

    // «mantieni» o voce assente: nessuna riga, nessun sistema nuovo tra gli inattivi
    for (const persiane of [{ azione: "mantieni" as const }, undefined]) {
      const c = cloneConfig();
      c.elementi.persiane = persiane;
      const p = promptDalPercorsoVero(c);
      expect(p.blocks.G).not.toContain("Window shutters");
      expect(p.blocks.C).not.toMatch(/persiane|window shutters/);
    }
  });

  it("zoccolatura: materiale e colore in inglese; senza materiale il testo resta quello di prima", () => {
    const config = cloneConfig();
    config.elementi.zoccolatura = { azione: "aggiungi", tipo: "pietra", altezza_cm: 60, colore_hex: "grigio pietra" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("Base course: add a natural stone slab plinth with thin joints, about 60cm high; plinth colour grigio pietra");
    config.elementi.zoccolatura = { azione: "aggiungi" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("Base course: add a base course plinth with height about 40cm");
  });

  it("davanzali: materiale e colore in inglese (prima «marmo sills»)", () => {
    const config = cloneConfig();
    config.elementi.davanzali = { azione: "sostituisci", materiale: "alluminio", colore_hex: "RAL 7016" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("Window sills: replace sills with folded aluminium sills (thin pressed-metal profile) in colour RAL 7016 showing a credible nose");
    config.elementi.davanzali = { azione: "sostituisci", materiale: "marmo" };
    expect(bloccoG(promptDalPercorsoVero(config))).toContain("replace sills with marble sills showing");
  });

  it("un piano salvato prima di queste modifiche (senza persiane, senza colori) dà lo stesso blocco G di sei righe", () => {
    const vecchio = cloneConfig();
    delete vecchio.elementi.persiane;
    const g = bloccoG(promptDalPercorsoVero(vecchio));
    expect(g.split("\n").filter((r) => r.startsWith("- "))).toHaveLength(6);
  });
});
