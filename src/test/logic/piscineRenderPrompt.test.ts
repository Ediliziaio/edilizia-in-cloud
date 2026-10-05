import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_PISCINE_CONFIG } from "@/components/render-piscine/defaultPiscineConfig";
import { conDimensione, conTipo, misuraDaInput } from "@/components/render-piscine/aggiornaConfigPiscina";
import { buildPiscinePrompt } from "@/modules/render-piscine/lib/piscinePromptBuilder";
import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";
import { buildPoolPrompt } from "../../../supabase/functions/generate-pool-render/poolPrompt.ts";
import { configPerAmbito } from "../../../shared/render-piscine/piscineOperationScope.ts";
import { avvisiConfigurazionePiscina } from "../../../shared/render-piscine/piscineValidation.ts";

function baseConfig(overrides: Partial<ConfigurazionePiscine> = {}): ConfigurazionePiscine {
  return {
    ...DEFAULT_PISCINE_CONFIG,
    ...overrides,
    inserimento: {
      ...DEFAULT_PISCINE_CONFIG.inserimento,
      ...overrides.inserimento,
    },
    piscina: {
      ...DEFAULT_PISCINE_CONFIG.piscina,
      ...overrides.piscina,
    },
    finiture: {
      ...DEFAULT_PISCINE_CONFIG.finiture,
      ...overrides.finiture,
    },
    comfort: {
      ...DEFAULT_PISCINE_CONFIG.comfort,
      ...overrides.comfort,
      accessori: overrides.comfort?.accessori ?? DEFAULT_PISCINE_CONFIG.comfort.accessori,
    },
  };
}

function promptText(config: ConfigurazionePiscine) {
  const result = buildPiscinePrompt(config as unknown as Record<string, unknown>);
  return {
    result,
    text: `${result.systemPrompt}\n${result.userPrompt}`.toLowerCase(),
  };
}

describe("piscine render prompt", () => {
  it("creates an in-ground rectangular lawn pool with target map, buildability envelope and no floating pool", () => {
    const { result, text } = promptText(baseConfig());

    expect(text).toContain("target pool insertion map");
    expect(text).toContain("buildability envelope");
    expect(text).toContain("in-ground rectangular");
    expect(text).toContain("in-ground relation");
    expect(text).toContain("no floating shell");
    expect(text).toContain("coping must be visible");
    expect(result.validation.isValid).toBe(true);
  });

  it("replaces an existing rectangular pool with an organic one without hybrid edge states", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "replace_existing_pool",
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "interrata_organica", forma: "organica" },
    }));

    expect(text).toContain("remove the existing pool");
    expect(text).toContain("freeform organic pool");
    expect(text).toContain("no hybrid state");
    expect(text).toContain("old coping");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes overflow pools with high water level and no skimmer ambiguity", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "sfioro_rettangolare", sistema_bordo: "sfioro" },
    }));

    expect(text).toContain("overflow system");
    expect(text).toContain("water level very close");
    expect(text).toContain("no skimmer ambiguity");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes skimmer pools without inappropriate infinity or overflow rules", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, sistema_bordo: "skimmer" },
    }));

    expect(text).toContain("skimmer system");
    expect(text).toContain("waterline sits slightly below coping");
    expect(text).toContain("do not render an overflow/infinity edge");
    expect(result.validation.isValid).toBe(true);
  });

  it("makes beach shelf and lounge steps explicit as shallow and visible through water", () => {
    const { result, text } = promptText(baseConfig({
      comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, accesso: "spiaggetta" },
    }));

    expect(text).toContain("baja shelf");
    expect(text).toContain("shallow");
    expect(text).toContain("thinner transparent water");
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps geometry untouched when changing only water look or liner", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "recolor_waterlook_or_liner_only",
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro" },
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, colore_acqua: "blu_profondo" },
    }));

    expect(text).toContain("waterlook/liner-only");
    expect(text).toContain("preserve exact pool shape");
    expect(text).toContain("footprint");
    expect(text).toContain("coping");
    expect(result.validation.isValid).toBe(true);
  });

  it("changes only coping while preserving basin and footprint", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "change_coping_only",
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, coping: "bordo_sottile_moderno" },
    }));

    expect(text).toContain("coping-only");
    expect(text).toContain("no footprint change");
    expect(text).toContain("no basin shape change");
    expect(text).toContain("strict scope");
    expect(text).toContain("preserve existing access features exactly");
    expect(text).not.toContain("access detail:");
    expect(result.normalizedConfig.replacement_manifest.additions.join(" ").toLowerCase()).not.toContain("access");
    expect(result.validation.isValid).toBe(true);
  });

  it("keeps waterlook-only free from access, coping, lighting and furniture additions", () => {
    const { result, text } = promptText(baseConfig({
      operazione: "recolor_waterlook_or_liner_only",
      comfort: {
        ...DEFAULT_PISCINE_CONFIG.comfort,
        accesso: "spiaggetta",
        illuminazione: "subacquea_soft",
        arredo: "aggiungi_minimo",
      },
    }));

    expect(text).toContain("waterlook/liner-only");
    expect(text).toContain("strict scope");
    expect(result.normalizedConfig.replacement_manifest.additions).toHaveLength(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("removes an existing pool with ground or hardscape restoration and no ghost remnants", () => {
    const { result, text } = promptText(baseConfig({ operazione: "remove_existing_pool" }));

    expect(text).toContain("remove the existing pool completely");
    expect(text).toContain("restore");
    expect(text).toContain("no residual basin ghost");
    expect(result.validation.isValid).toBe(true);
  });

  it("describes premium above-ground pool with base/support integration, not cheap inflatable output", () => {
    const { result, text } = promptText(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "fuori_terra_premium" },
      inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "fuori_terra" },
    }));

    expect(text).toContain("above-ground");
    expect(text).toContain("premium base");
    expect(text).toContain("never cheap or inflatable");
    expect(result.validation.isValid).toBe(true);
  });

  it("flags an infinity edge in an incompatible flat garden context", () => {
    const { result, text } = promptText(baseConfig({
      inserimento: {
        ...DEFAULT_PISCINE_CONFIG.inserimento,
        zona: "giardino_centrale",
        posizione_descrittiva: "giardino piatto chiuso da recinzioni senza vista o dislivello",
      },
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "infinity_pool", sistema_bordo: "infinity_edge" },
    }));

    expect(text).toContain("infinity feasibility: limited");
    expect(text).toContain("if context is flat and enclosed");
    expect(result.validation.isValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Audit del 04/10/2026: ambito per operazione, coerenza delle scelte, controlli
// che non arrivavano al prompt, campi nuovi. Sia sulla libreria condivisa (sopra)
// sia sul prompt che l'edge manda davvero (generate-pool-render/poolPrompt.ts).
// ---------------------------------------------------------------------------

function edgeText(config: ConfigurazionePiscine) {
  const r = buildPoolPrompt({ config: config as unknown as Record<string, unknown> }, { width: 1600, height: 1200 });
  return { r, prompt: `${r.systemPrompt}\n\n${r.userPrompt}` };
}

const sha256 = (testo: string) => createHash("sha256").update(testo).digest("hex");

describe("prompt dell'edge piscine: compatibilità", () => {
  // Hash del prompt prodotto dal commit e8370a2d2 (prima di questo lavoro), stessa foto 1600x1200.
  it("nuova piscina e sostituzione coi campi nuovi vuoti: prompt identico, carattere per carattere", () => {
    expect(sha256(edgeText(baseConfig()).prompt)).toBe("2cc1cc31ec91627f6370c4bee2f17bbba3933c5a047554f667c01a72da158b21");
    const villa = baseConfig({
      operazione: "replace_existing_pool",
      piscina: { tipo: "sfioro_rettangolare", forma: "rettangolare", dimensione_apparente: "ampia", sistema_bordo: "sfioro", colore_acqua: "cristallina_chiara" },
      finiture: { rivestimento_interno: "mosaico_bianco", coping: "pietra_chiara", area_perimetrale: "solarium_gres", fuga_bordo: "sottile" },
      comfort: { accesso: "gradoni_lounge", accessori: ["illuminazione_subacquea", "zona_prendisole"], illuminazione: "subacquea_soft", arredo: "aggiungi_minimo" },
    });
    expect(sha256(edgeText(villa).prompt)).toBe("0e191a72aff8ad87033e0ca62fb5fb71b3b7441d9bddbc4fa78d58226350cae9");
  });

  it("il rewriter riceve lo stesso oggetto per nuova piscina e sostituzione, solo i campi in ambito per le altre", () => {
    const nuova = baseConfig() as unknown as Record<string, unknown>;
    expect(configPerAmbito(nuova)).toBe(nuova);
    const bordo = configPerAmbito(baseConfig({ operazione: "change_coping_only" }) as unknown as Record<string, unknown>) as Record<string, Record<string, unknown>>;
    expect(bordo.finiture).toEqual({ coping: "travertino", fuga_bordo: "sottile" });
    expect(bordo.piscina).toBeUndefined();
    expect(bordo.comfort).toBeUndefined();
    expect(bordo.elementi_da_preservare).toEqual(DEFAULT_PISCINE_CONFIG.elementi_da_preservare);
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-pool-render", "index.ts"), "utf8");
    expect(src).toMatch(/legacy_config: configPerAmbito\(asRecord\(session\.config\)\)/);
  });
});

describe("prompt piscine: ogni operazione cambia solo ciò che deve", () => {
  it("solo bordo: niente gradini di default, niente tipologia né rivestimento né prato da costruire", () => {
    const config = baseConfig({ operazione: "change_coping_only", finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, coping: "legno_wpc" } });
    const { prompt, r } = edgeText(config);
    // prima: «Access detail: corner entry steps…» tra le aggiunte e «Pool typology: interrata_rettangolare»
    expect(prompt).not.toContain("Access detail");
    expect(prompt).not.toContain("corner entry steps");
    expect(prompt).not.toContain("Pool typology: interrata_rettangolare");
    expect(prompt).not.toContain("contemporary grey mosaic");
    expect(prompt).not.toContain("lawn restored");
    expect(prompt).toContain("Pool typology: existing pool, unchanged");
    expect(prompt).toContain("WPC/wood deck coping transition");
    expect(prompt).toContain("rebuild only the narrow strip that meets the new coping");
    expect(prompt).toContain("Strict scope");
    expect(r.promptPayload.replacement_manifest.additions).toEqual([]);
    const shared = promptText(config).text;
    expect(shared).not.toContain("pool typology: interrata_rettangolare");
    expect(shared).not.toContain("water look must follow interior finish");
  });

  it("solo acqua/rivestimento: il coping di default non diventa un obiettivo", () => {
    const { prompt, r } = edgeText(baseConfig({ operazione: "recolor_waterlook_or_liner_only", finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro" }, piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, colore_acqua: "blu_profondo" } }));
    expect(prompt).not.toContain("travertine");
    expect(prompt).not.toContain("Access detail");
    expect(prompt).toContain("Coping: keep the existing coping exactly as photographed");
    expect(prompt).toContain("premium dark liner");
    expect(prompt).toContain("Strict scope: do not add or modify steps");
    expect(r.promptPayload.replacement_manifest.recolors.join(" ")).toContain("deeper blue water tone");
  });

  it("aggiungi accessori: gli accessori sì, i gradini di default no; aggiungi accesso: l'accesso sì, gli accessori no", () => {
    const features = edgeText(baseConfig({ operazione: "add_pool_features", comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, accessori: ["lama_dacqua"], illuminazione: "perimetrale_calda" } }));
    expect(features.prompt).toContain("linear water blade feature");
    expect(features.prompt).toContain("Lighting detail");
    expect(features.prompt).not.toContain("Access detail");
    expect(features.prompt).toContain("preserve existing access geometry exactly");
    const access = edgeText(baseConfig({ operazione: "add_access_system", comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, accesso: "scala_inox", accessori: ["cascata"], illuminazione: "subacquea_soft" } }));
    expect(access.prompt).toContain("Access detail: stainless-steel pool ladder");
    expect(access.prompt).not.toContain("small architectural waterfall");
    expect(access.prompt).not.toContain("Lighting detail");
    expect(access.prompt).toContain("Interior finish: existing interior finish, unchanged");
  });

  it("rimozione: nessuna vasca da costruire, nessuna acqua da mostrare", () => {
    const { prompt } = edgeText(baseConfig({ operazione: "remove_existing_pool", comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, arredo: "aggiungi_minimo" } }));
    expect(prompt).toContain("Pool typology: none - the existing pool is removed");
    expect(prompt).toContain("no water may remain");
    expect(prompt).not.toContain("in-ground rectangular residential pool");
    expect(prompt).not.toContain("water must show realistic specular reflections");
    expect(prompt).not.toContain("sun loungers");
    expect(prompt).toContain("Restore the target area as coherent lawn, patio, deck or hardscape");
  });
});

describe("prompt piscine: scelte che si contraddicono", () => {
  it("la tipologia vince: «Interrata a sfioro» lasciata su «Skimmer» è uno sfioro, «Forma libera» resta organica", () => {
    const sfioro = edgeText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "sfioro_rettangolare", sistema_bordo: "skimmer" } })).prompt;
    expect(sfioro).toContain("Water system: sfioro");
    expect(sfioro).not.toContain("skimmer pool: waterline must sit slightly below coping");
    const organica = edgeText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "interrata_organica", forma: "rettangolare" } })).prompt;
    expect(organica).toContain("shape organica");
    expect(organica).not.toContain("shape rettangolare");
    expect(promptText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "interrata_organica", forma: "rettangolare" } })).text).toContain("shape organica");
  });

  it("rivestimento scuro e acqua turchese: vince il rivestimento, detto in chiaro", () => {
    const config = baseConfig({ finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro" }, piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, colore_acqua: "turchese" } });
    const { prompt } = edgeText(config);
    expect(prompt).toContain("cannot appear over this interior finish (liner scuro): the finish wins");
    expect(prompt).not.toContain("turquoise water influenced by light interior finish");
    expect(promptText(config).text).toContain("the finish wins");
  });

  it("copertura: si vede in parte, così acqua, rivestimento e gradini restano visibili", () => {
    const { prompt } = edgeText(baseConfig({ comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, accessori: ["copertura_isotermica", "copertura_rigida"] } }));
    expect(prompt).toContain("thermal bubble cover shown partly deployed");
    expect(prompt).toContain("slatted rigid cover shown partly closed over about a third of the pool");
    expect(prompt).not.toContain("stored/closed coherently");
  });

  it("quota del bordo e note tecniche arrivano al prompt (prima no); a filo terreno e note vuote non aggiungono niente", () => {
    const { prompt } = edgeText(baseConfig({ inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "leggermente_rialzata", interferenze_note: "non toccare ulivo a sinistra" } }));
    expect(prompt).toContain("Edge height: coping raised slightly above the surrounding ground");
    expect(prompt).toContain("Installer notes (must be respected): non toccare ulivo a sinistra");
    const contraddittoria = edgeText(baseConfig({ inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "fuori_terra" } })).prompt;
    expect(contraddittoria).not.toContain("Edge height");
    const base = edgeText(baseConfig()).prompt;
    expect(base).not.toContain("Edge height");
    expect(base).not.toContain("Installer notes");
    expect(promptText(baseConfig({ inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, interferenze_note: "non toccare ulivo" } })).text).toContain("installer notes (must be respected): non toccare ulivo");
  });
});

describe("prompt piscine: elementi nuovi", () => {
  it("misure reali: entrano nell'impronta e nella geometria; vuote o fuori scala non cambiano niente", () => {
    const { prompt } = edgeText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, lunghezza_m: 4, larghezza_m: 8 } }));
    expect(prompt).toContain("real size about 8 x 4 m inside the coping, overriding the apparent size class");
    expect(prompt).toContain("apparent size media; real size about 8 x 4 m");
    expect(edgeText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, lunghezza_m: 80 } })).prompt).not.toContain("real ");
    expect(promptText(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, lunghezza_m: 10 } })).text).toContain("real length about 10 m");
  });

  it("biopiscina: tipologia naturale con zona di rigenerazione", () => {
    const config = baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "biopiscina", forma: "organica" } });
    expect(edgeText(config).prompt).toContain("natural swimming pool (biopiscina)");
    expect(promptText(config).text).toContain("planted regeneration zone");
  });

  it("recinzione in vetro: è un accessorio, quindi c'è con nuova piscina e «aggiungi accessori», non con «solo bordo»", () => {
    const comfort = { ...DEFAULT_PISCINE_CONFIG.comfort, accessori: ["recinzione_vetro" as const] };
    expect(edgeText(baseConfig({ comfort })).prompt).toContain("glass pool safety fence");
    expect(edgeText(baseConfig({ operazione: "add_pool_features", comfort })).prompt).toContain("glass pool safety fence");
    expect(edgeText(baseConfig({ operazione: "change_coping_only", comfort })).prompt).not.toContain("glass pool safety fence");
  });

  it("rivestimento esterno: solo su una vasca rialzata", () => {
    const rialzata = baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "fuori_terra_premium" },
      inserimento: { ...DEFAULT_PISCINE_CONFIG.inserimento, quota_bordo: "fuori_terra" },
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_esterno: "doghe_legno_wpc" },
    });
    expect(edgeText(rialzata).prompt).toContain("exterior cladding: wood-look WPC boards");
    expect(edgeText(rialzata).prompt).toContain("Edge height: basin standing fully above ground");
    expect(promptText(rialzata).text).toContain("exterior cladding: wood-look wpc boards");
    const interrata = baseConfig({ finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_esterno: "doghe_legno_wpc" } });
    expect(edgeText(interrata).prompt).not.toContain("exterior cladding");
  });

  it("rimozione: si può dire cosa va al posto della piscina; senza scelta il ripristino di sempre", () => {
    const prato = baseConfig({ operazione: "remove_existing_pool", finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, superficie_ripristino: "prato_raccordato" } });
    expect(edgeText(prato).prompt).toContain("Restore the target area as continuous lawn over the former pool area");
    expect(promptText(prato).text).toContain("restore the target area as continuous lawn over the former pool area");
    expect(edgeText(baseConfig({ operazione: "remove_existing_pool" })).prompt).toContain("Restore the target area as coherent lawn, patio, deck or hardscape matching the photographed context.");
  });
});

describe("form piscine: avvisi e aggiornamenti", () => {
  it("il form di default non ha avvisi; le contraddizioni sì, in italiano", () => {
    expect(avvisiConfigurazionePiscina(baseConfig())).toEqual([]);
    const avvisi = avvisiConfigurazionePiscina(baseConfig({
      piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, tipo: "sfioro_rettangolare", sistema_bordo: "skimmer", colore_acqua: "turchese", lunghezza_m: 80 },
      finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, rivestimento_interno: "liner_scuro", rivestimento_esterno: "pietra_naturale" },
    }));
    expect(avvisi.join("\n")).toMatch(/non va con il bordo «skimmer»: il render userà «sfioro»/);
    expect(avvisi.join("\n")).toMatch(/l'acqua non può sembrare «turchese»/);
    expect(avvisi.join("\n")).toMatch(/Misure fuori scala/);
    expect(avvisi.join("\n")).toMatch(/rivestimento esterno si vede solo su una vasca rialzata/);
  });

  it("«Dimensione apparente» cambia davvero la dimensione (prima il secondo setter cancellava il primo)", () => {
    const c = conDimensione(baseConfig(), "ampia");
    expect(c.piscina.dimensione_apparente).toBe("ampia");
    expect(c.inserimento.footprint_apparente).toBe("ampia");
  });

  it("scegliere la tipologia adegua forma, bordo e quota solo se la contraddicono", () => {
    const sfioro = conTipo(baseConfig(), "sfioro_rettangolare");
    expect(sfioro.piscina.sistema_bordo).toBe("sfioro");
    expect(sfioro.piscina.forma).toBe("rettangolare");
    const organica = conTipo(baseConfig(), "interrata_organica");
    expect(organica.piscina.forma).toBe("organica");
    expect(conTipo(baseConfig(), "fuori_terra_premium").inserimento.quota_bordo).toBe("fuori_terra");
    const nascosto = conTipo(baseConfig({ piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, sistema_bordo: "sfioro_nascosto" } }), "sfioro_rettangolare");
    expect(nascosto.piscina.sistema_bordo).toBe("sfioro_nascosto");
    expect(misuraDaInput("8,5")).toBe(8.5);
    expect(misuraDaInput("  ")).toBeUndefined();
  });
});
