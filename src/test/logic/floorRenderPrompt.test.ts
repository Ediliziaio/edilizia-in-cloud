import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PAVIMENTO_CONFIG } from "@/components/render-pavimento/defaultPavimentoConfig";
import { PavimentoConfigForm } from "@/components/render-pavimento/PavimentoConfigForm";
import { buildFloorPrompt } from "../../../shared/render-floor/floorPromptBuilder.ts";
import { buildFloorRenderConfig, normalizeFloorLegacyConfig } from "../../../shared/render-floor/floorRenderConfig.ts";
import { validateFloorPromptConfig } from "../../../shared/render-floor/floorPromptValidation.ts";
import { collectFloorReferenceImages } from "../../../shared/render-references/floorReferences.ts";
import type { ConfigurazionePavimento } from "../../../shared/render-floor/types.ts";

function cloneConfig(): ConfigurazionePavimento {
  return structuredClone(DEFAULT_PAVIMENTO_CONFIG);
}

function baseAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    tipo_stanza: "soggiorno",
    pavimento_attuale: "old beige ceramic tiles",
    colore_attuale: "beige",
    dimensione_stimata: "medium living room",
    stato_conservazione: "worn but regular",
    battiscopa_presente: true,
    current_floor_format: "30x30 ceramic tiles",
    has_visible_joints: true,
    visible_floor_area: "entire living-room floor from foreground to back wall",
    floor_perimeter_geometry: "floor bounded by two walls, sofa legs and a door threshold",
    thresholds_visible: true,
    steps_visible: false,
    rugs_present: false,
    obstacles: ["sofa legs", "coffee table", "low cabinet"],
    light_quality: "soft daylight from left window with mild floor reflections",
    preserved_elements: ["walls", "sofa", "coffee table", "window", "door"],
    note: "keep the room unchanged and replace only the floor",
    ...overrides,
  };
}

describe("floor render pipeline", () => {
  it("removes old tile grout completely when resin is selected", () => {
    const config = cloneConfig();
    config.tipo = "resina_continua";
    config.effetto_visivo = "resina";
    config.fuga_larghezza_mm = 0;

    const renderConfig = buildFloorRenderConfig(config, { sceneAnalysis: baseAnalysis() });
    expect(renderConfig.technical_specification.isSeamless).toBe(true);
    expect(renderConfig.replacement_manifest.removals.join(" ").toLowerCase()).toContain("old grout");

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("absolutely no grout lines");
    expect(prompt.userPrompt.toLowerCase()).toContain("ghost grid");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes classic parquet herringbone without confusing it with Hungarian point", () => {
    const config = cloneConfig();
    config.tipo = "parquet_massello";
    config.effetto_visivo = "legno";
    config.essenza_legno = "rovere_naturale";
    config.pattern_posa = "spina_di_pesce";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("classic herringbone");
    expect(prompt.userPrompt.toLowerCase()).toContain("90 degrees");
    expect(prompt.userPrompt.toLowerCase()).toContain("not chevron-cut ends");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes Hungarian point with angled chevron-cut ends", () => {
    const config = cloneConfig();
    config.tipo = "parquet_prefinito";
    config.effetto_visivo = "legno";
    config.pattern_posa = "spina_ungherese";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("hungarian point");
    expect(prompt.userPrompt.toLowerCase()).toContain("chevron");
    expect(prompt.userPrompt.toLowerCase()).toContain("strip ends are cut");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("preserves large slab scale for 120x120 gres with 2mm tone-on-tone grout", () => {
    const config = cloneConfig();
    config.tipo = "gres_porcellanato";
    config.formato_piastrella = "120x120";
    config.scala_pattern = "maxi_lastre";
    config.fuga_larghezza_mm = 2;
    config.fuga_colore = "tono_su_tono";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("120x120 cm modules");
    expect(prompt.userPrompt.toLowerCase()).toContain("large-format scale");
    expect(prompt.userPrompt.toLowerCase()).toContain("tone-on-tone grout");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("treats carpet as a continuous textile surface with no modules", () => {
    const config = cloneConfig();
    config.tipo = "moquette";
    config.effetto_visivo = "tessile";
    config.fuga_larghezza_mm = 0;

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("wall-to-wall carpet");
    expect(prompt.userPrompt.toLowerCase()).toContain("continuous textile");
    expect(prompt.userPrompt.toLowerCase()).toContain("no modules");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("adds continuous baseboard rules when skirting is replaced", () => {
    const config = cloneConfig();
    config.battiscopa = {
      azione: "sostituisci",
      tipo: "coordinato_pavimento",
      altezza_cm: 8,
    };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("replace baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("run the new baseboard continuously");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("removes skirting with clean wall-floor repair", () => {
    const config = cloneConfig();
    config.battiscopa = { azione: "rimuovi" };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("remove the visible baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("repair the wall-floor junction");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("keeps existing skirting unchanged when requested", () => {
    const config = cloneConfig();
    config.battiscopa = { azione: "mantieni" };

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("keep the existing baseboard");
    expect(prompt.userPrompt.toLowerCase()).toContain("same color, material, height");
    expect(prompt.validation.isValid).toBe(true);
  });

  it("describes marble with natural veining and polished depth", () => {
    const config = cloneConfig();
    config.tipo = "marmo";
    config.effetto_visivo = "marmo";
    config.finitura = "lucido";
    config.formato_piastrella = "120x240";
    config.scala_pattern = "maxi_lastre";

    const prompt = buildFloorPrompt(config, baseAnalysis());
    expect(prompt.userPrompt.toLowerCase()).toContain("natural marble");
    expect(prompt.userPrompt.toLowerCase()).toContain("natural veining");
    expect(prompt.userPrompt.toLowerCase()).toContain("polished depth");
    expect(prompt.validation.isValid).toBe(true);
  });
});

/** Monta il form del pavimento e restituisce il contenitore, l'onChange e lo smontaggio. */
function montaForm(value: ConfigurazionePavimento) {
  const onChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(PavimentoConfigForm, { value, onChange }));
  });
  const clicca = (testo: string) => {
    const bottone = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(testo));
    if (!bottone) throw new Error(`bottone non trovato: ${testo}`);
    act(() => bottone.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };
  return { container, onChange, clicca, smonta: () => { act(() => root.unmount()); container.remove(); } };
}

describe("floor render pipeline: correzioni (A)", () => {
  it("un pavimento continuo non riceve una posa a griglia (prima: «joints form uninterrupted parallel grid lines»)", () => {
    for (const tipo of ["microcemento", "resina_continua", "cemento_resina", "moquette"] as const) {
      const config = cloneConfig();
      config.tipo = tipo;
      config.pattern_posa = "spina_di_pesce"; // rimasta da un tipo precedente
      const prompt = buildFloorPrompt(config, baseAnalysis());
      const text = prompt.userPrompt.toLowerCase();
      expect(text, tipo).toContain("pattern: none — the selected floor is one continuous seamless surface");
      expect(text, tipo).not.toContain("joints form uninterrupted parallel grid lines");
      expect(text, tipo).not.toContain("classic herringbone");
      expect(text, tipo).not.toContain("standard residential module scale");
      expect(text, tipo).toContain("absolutely no grout lines");
      expect(prompt.validation.isValid, tipo).toBe(true);
    }
  });

  it("il terrazzo veneziano è continuo come nel form (prima: «60x60 cm modules» con fughe da 0 mm)", () => {
    const config = cloneConfig();
    config.tipo = "terrazzo_veneziano";
    config.effetto_visivo = "terrazzo";
    config.fuga_larghezza_mm = 0;
    const prompt = buildFloorPrompt(config, baseAnalysis());
    const text = prompt.userPrompt.toLowerCase();
    expect(text).toContain("venetian terrazzo");
    expect(text).toContain("seamless continuous surface");
    expect(text).not.toContain("cm modules");
    expect(prompt.normalizedConfig.legacy_config.formato_piastrella).toBeUndefined();
    expect(prompt.validation.isValid).toBe(true);
  });

  it("un'essenza rimasta da un parquet non entra su un pavimento che non si presenta come legno", () => {
    const essenzaIn = (patch: Partial<ConfigurazionePavimento>) => {
      const prompt = buildFloorPrompt({ ...cloneConfig(), essenza_legno: "noce", ...patch }, baseAnalysis());
      return { testo: prompt.userPrompt, legacy: prompt.normalizedConfig.legacy_config };
    };
    const gres = essenzaIn({ tipo: "gres_porcellanato", effetto_visivo: "cemento" });
    expect(gres.testo).not.toContain("Wood essence");
    expect(gres.legacy.essenza_legno).toBeUndefined(); // nemmeno il rewriter la vede
    expect(essenzaIn({ tipo: "laminato", effetto_visivo: "pietra" }).testo).not.toContain("Wood essence");
    expect(essenzaIn({ tipo: "marmo", effetto_visivo: "legno" }).testo).not.toContain("Wood essence");
    // dove il pavimento è legno (o effetto legno) l'essenza resta
    expect(essenzaIn({ tipo: "parquet_massello", effetto_visivo: "legno" }).testo).toContain("Wood essence: walnut");
    expect(essenzaIn({ tipo: "gres_porcellanato", effetto_visivo: "legno" }).testo).toContain("Wood essence: walnut");
  });

  it("il formato in centimetri vale solo per le piastrelle (prima un parquet si portava dietro il 120x120 del gres)", () => {
    const parquet = buildFloorPrompt({ ...cloneConfig(), tipo: "parquet_prefinito", effetto_visivo: "legno", formato_piastrella: "120x120", scala_pattern: "standard", larghezza_listello_mm: 160, lunghezza_listello_mm: 1400 }, baseAnalysis());
    expect(parquet.normalizedConfig.legacy_config.formato_piastrella).toBeUndefined();
    expect(parquet.userPrompt).toContain("160mm x 1400mm planks");
    expect(parquet.validation.isValid).toBe(true); // prima: «large tile formats must preserve large slab scale»
    expect(parquet.userPrompt).not.toContain("Prompt validation warnings");
    // listoni in gres effetto legno: il formato nuovo arriva al prompt
    const listoni = buildFloorPrompt({ ...cloneConfig(), effetto_visivo: "legno", formato_piastrella: "20x120" }, baseAnalysis());
    expect(listoni.userPrompt).toContain("20x120 cm modules");
    // valori che non sono un formato (dal pavimento della stanza) non diventano «continuo cm modules»
    const continuo = buildFloorPrompt({ ...cloneConfig(), formato_piastrella: "continuo" }, baseAnalysis());
    expect(continuo.userPrompt).not.toContain("continuo cm");
    expect(continuo.userPrompt).toContain("module dimensions must be plausible for the room scale");
    // assente resta 60x60, come prima
    const { formato_piastrella: _omesso, ...senzaFormato } = cloneConfig();
    expect(normalizeFloorLegacyConfig(senzaFormato).formato_piastrella).toBe("60x60");
  });

  it("la nota dell'analisi resta tra le note, non diventa la prospettiva della fotocamera", () => {
    const prompt = buildFloorPrompt(cloneConfig(), baseAnalysis());
    expect(prompt.userPrompt).toContain("Camera / perspective: photographed room perspective with visible floor plane and vanishing points");
    expect(prompt.userPrompt).toContain("Notes: keep the room unchanged and replace only the floor");
    expect(prompt.userPrompt).not.toContain("Camera / perspective: keep the room unchanged");
  });

  it("form: cambiando materiale il colore segue il materiale (prima restava «Gres cemento grigio chiaro»)", () => {
    const { onChange, clicca, smonta } = montaForm(cloneConfig());
    clicca("Parquet massello");
    const parquet = onChange.mock.calls.at(-1)?.[0] as ConfigurazionePavimento;
    expect(parquet).toMatchObject({ tipo: "parquet_massello", essenza_legno: "rovere_naturale", colore_nome: "Rovere naturale", colore_hex: "#c49a63" });
    const prompt = buildFloorPrompt(parquet, baseAnalysis()).userPrompt;
    expect(prompt).toContain("Use Rovere naturale, hex #c49a63");
    expect(prompt).not.toContain("Gres cemento");
    smonta();

    // dal parquet al cotto: niente essenza rimasta, colore del cotto
    const dalParquet = montaForm({ ...cloneConfig(), ...parquet, essenza_legno: "noce", colore_nome: "Noce", colore_hex: "#6d442b" });
    dalParquet.clicca("Cotto");
    expect(dalParquet.onChange.mock.calls.at(-1)?.[0]).toMatchObject({ tipo: "cotto", essenza_legno: undefined, colore_nome: "Cotto naturale", colore_hex: "#b85a35" });
    dalParquet.smonta();
  });

  it("form: formato acceso solo per le piastrelle, listello solo per legno/laminato/LVT, essenza solo se il prompt la usa", () => {
    const campiListello = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type="number"][placeholder="mm"]'));
    const gresLegno = montaForm({ ...cloneConfig(), effetto_visivo: "legno" });
    expect(campiListello(gresLegno.container).every((i) => i.disabled)).toBe(true);
    expect(gresLegno.container.textContent).toContain("Essenza legno");
    gresLegno.smonta();
    const parquet = montaForm({ ...cloneConfig(), tipo: "parquet_prefinito", effetto_visivo: "legno" });
    expect(campiListello(parquet.container).every((i) => !i.disabled)).toBe(true);
    parquet.smonta();
    const laminatoPietra = montaForm({ ...cloneConfig(), tipo: "laminato", effetto_visivo: "pietra" });
    expect(laminatoPietra.container.textContent).not.toContain("Essenza legno");
    laminatoPietra.smonta();
  });
});

describe("floor render pipeline: tappeti (B)", () => {
  it("assente o «mantieni»: il prompt resta identico a prima (i tappeti restano)", () => {
    const prima = buildFloorPrompt(cloneConfig(), baseAnalysis({ rugs_present: true }));
    const mantieni = buildFloorPrompt({ ...cloneConfig(), tappeti: "mantieni" }, baseAnalysis({ rugs_present: true }));
    expect(mantieni.userPrompt).toBe(prima.userPrompt);
    expect(prima.userPrompt).toContain("areas under existing rugs must stay occluded by the same rugs");
    expect(prima.userPrompt).toContain("no moved rugs");
    // un valore sconosciuto non cambia niente
    expect(buildFloorPrompt({ ...cloneConfig(), tappeti: "boh" as never }, baseAnalysis({ rugs_present: true })).userPrompt).toBe(prima.userPrompt);
  });

  it("«rimuovi»: i tappeti si tolgono e il pavimento si vede sotto; nessuna regola dice il contrario", () => {
    const prompt = buildFloorPrompt({ ...cloneConfig(), tappeti: "rimuovi" }, baseAnalysis({ rugs_present: true }));
    const text = prompt.userPrompt;
    expect(text).toContain("Remove every loose rug, runner and mat lying on the floor and show the new floor continuously where they were");
    expect(text).toContain("areas currently under loose rugs become visible new floor");
    expect(text).toContain("all furniture, appliances and objects (loose rugs excepted: they are removed)");
    expect(text).toContain("except removing the loose rugs as instructed");
    expect(text).toContain("now resting directly on the new floor");
    expect(text).toContain("only the loose rugs are removed");
    expect(text).not.toContain("no moved rugs");
    expect(text).not.toContain("must stay occluded by the same rugs");
    expect(text).not.toContain("rugs and objects");
    expect(prompt.validation.isValid).toBe(true);
    // il rewriter legge le rimozioni: la richiesta gli arriva
    expect(prompt.normalizedConfig.replacement_manifest.removals.join(" ")).toContain("loose rug");
  });

  it("la validazione segnala un manifest che toglie i tappeti a parole ma li conserva nelle regole", () => {
    const cfg = buildFloorRenderConfig({ ...cloneConfig(), tappeti: "rimuovi" }, { sceneAnalysis: baseAnalysis() });
    const rotto = { ...cfg, replacement_manifest: { ...cfg.replacement_manifest, removals: cfg.replacement_manifest.removals.filter((r) => !r.includes("rug")) } };
    expect(validateFloorPromptConfig(rotto).missingBusinessRules).toContain("rug removal must be explicit and not contradicted by rug preservation rules");
  });

  it("i tappeti non portano foto: le foto restano quelle del pavimento", () => {
    expect(collectFloorReferenceImages({ ...cloneConfig(), tappeti: "rimuovi" })).toEqual(collectFloorReferenceImages(cloneConfig()));
  });

  it("il controllo qualità sa che i tappeti tolti sono voluti (solo quando li si toglie)", () => {
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-floor-render", "index.ts"), "utf8");
    const qa = src.slice(src.indexOf("const qaPrompt"), src.indexOf("const sourceDataUrl"));
    expect(qa).toMatch(/normalizedConfig\.legacy_config\.tappeti === "rimuovi"[\s\S]{0,200}removed on purpose/);
  });

  it("form: la scelta c'è e parte da «Lasciali dove sono»", () => {
    const { container, smonta } = montaForm(cloneConfig());
    expect(container.textContent).toContain("Tappeti sul pavimento");
    const trigger = container.querySelector('[aria-label="Tappeti sul pavimento"]');
    expect(trigger?.textContent).toContain("Lasciali dove sono");
    smonta();
  });
});
