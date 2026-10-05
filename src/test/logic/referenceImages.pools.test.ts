import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PISCINE_CONFIG } from "@/components/render-piscine/defaultPiscineConfig";
import type { ConfigurazionePiscine } from "@/modules/render-piscine/lib/types";
import {
  POOL_ACCESS_REFERENCES,
  POOL_COPING_REFERENCES,
  POOL_EDGE_SYSTEM_REFERENCES,
  POOL_FEATURE_REFERENCES,
  POOL_INTERIOR_FINISH_REFERENCES,
  POOL_RESTORED_SURFACE_REFERENCES,
  POOL_SURROUND_REFERENCES,
  POOL_TYPE_PHOTO_EDGE_SYSTEMS,
  POOL_TYPE_REFERENCES,
  POOL_WATER_COLOUR_REFERENCES,
  SENZA_FOTO,
  collectPoolReferenceImages,
  listPoolReferencePaths,
  type PoolReferenceConfig,
} from "../../../shared/render-references/poolReferences.ts";
import { MAX_SHARED_REFERENCES, isBlackAndWhite, type PhotoTable } from "../../../shared/render-references/referencePicker.ts";
import {
  ACCESS_DESCRIPTIONS,
  ACCESSORY_DESCRIPTIONS,
  AREA_DESCRIPTIONS,
  COPING_DESCRIPTIONS,
  INTERIOR_FINISH_DESCRIPTIONS,
  POOL_TYPE_DESCRIPTIONS,
  WATER_LOOK_DESCRIPTIONS,
  WATER_SYSTEM_DESCRIPTIONS,
} from "../../../shared/render-piscine/promptFragments.ts";
import { RIVESTIMENTI_ESTERNI_PISCINA, SUPERFICI_RIPRISTINO_PISCINA } from "../../../shared/render-piscine/types.ts";
import {
  etichetteDiFormaConColore,
  fileMancanti,
  fotoBnADColori,
  fotoColoriInGrigio,
  miniatureMancanti,
} from "../lib/referenceGuards";

/**
 * Foto di riferimento del render piscine: una tabella per ogni scelta del form che
 * si vede in foto, allegate solo se l'operazione cambia quell'elemento
 * (shared/render-piscine/piscineOperationScope.ts) e al massimo 3 per render.
 */
const TABELLE: PhotoTable[] = [
  POOL_TYPE_REFERENCES,
  POOL_EDGE_SYSTEM_REFERENCES,
  POOL_INTERIOR_FINISH_REFERENCES,
  POOL_COPING_REFERENCES,
  POOL_ACCESS_REFERENCES,
  POOL_FEATURE_REFERENCES,
  POOL_SURROUND_REFERENCES,
  POOL_WATER_COLOUR_REFERENCES,
  POOL_RESTORED_SURFACE_REFERENCES,
];

/**
 * Le voci di FORMA (file «-BN», testo senza colori): gli accessi alla vasca e, dal 05/10/2026,
 * sei tipologie, lo sfioro nascosto e la recinzione in vetro. Tutte le altre sono a colori.
 */
const TIPI_CON_FOTO_DI_FORMA = ["lap_pool", "plunge_pool", "semi_incassata", "fuori_terra_premium", "minipiscina", "terrazzo_compatta"];
const FORMA: Array<{ tabella: PhotoTable; chiavi: string[] }> = [
  { tabella: POOL_ACCESS_REFERENCES, chiavi: Object.keys(POOL_ACCESS_REFERENCES) },
  { tabella: POOL_TYPE_REFERENCES, chiavi: TIPI_CON_FOTO_DI_FORMA },
  { tabella: POOL_EDGE_SYSTEM_REFERENCES, chiavi: ["sfioro_nascosto"] },
  { tabella: POOL_FEATURE_REFERENCES, chiavi: ["recinzione_vetro"] },
];
const voceDiForma = (tabella: PhotoTable, chiave: string) => FORMA.some((f) => f.tabella === tabella && f.chiavi.includes(chiave));

/** Il paesaggio che le scene di forma mostrano intorno alla vasca: nel testo di una foto di forma non ci deve stare. */
const PAESAGGIO = /\b(gardens?|lawns?|grass|trees?|hedges?|sea|lake|mountains?|hills?|views?|sky|houses?|villas?|buildings?|plants?|flowers?|olive|cypress)\b/i;

/** Dimensione del form → tutte le sue opzioni (le chiavi delle descrizioni del prompt) e la tabella delle foto. */
const DIMENSIONI: Record<string, { opzioni: string[]; foto: PhotoTable }> = {
  tipo: { opzioni: Object.keys(POOL_TYPE_DESCRIPTIONS), foto: POOL_TYPE_REFERENCES },
  sistema_bordo: { opzioni: Object.keys(WATER_SYSTEM_DESCRIPTIONS), foto: POOL_EDGE_SYSTEM_REFERENCES },
  rivestimento: { opzioni: Object.keys(INTERIOR_FINISH_DESCRIPTIONS), foto: POOL_INTERIOR_FINISH_REFERENCES },
  coping: { opzioni: Object.keys(COPING_DESCRIPTIONS), foto: POOL_COPING_REFERENCES },
  accesso: { opzioni: Object.keys(ACCESS_DESCRIPTIONS), foto: POOL_ACCESS_REFERENCES },
  accessori: { opzioni: Object.keys(ACCESSORY_DESCRIPTIONS), foto: POOL_FEATURE_REFERENCES },
  area_perimetrale: { opzioni: Object.keys(AREA_DESCRIPTIONS), foto: POOL_SURROUND_REFERENCES },
  colore_acqua: { opzioni: Object.keys(WATER_LOOK_DESCRIPTIONS), foto: POOL_WATER_COLOUR_REFERENCES },
  // campi nuovi del 04/10/2026
  superficie_ripristino: { opzioni: [...SUPERFICI_RIPRISTINO_PISCINA], foto: POOL_RESTORED_SURFACE_REFERENCES },
  rivestimento_esterno: { opzioni: [...RIVESTIMENTI_ESTERNI_PISCINA], foto: {} },
};

function config(over: {
  operazione?: ConfigurazionePiscine["operazione"];
  piscina?: Partial<ConfigurazionePiscine["piscina"]>;
  finiture?: Partial<ConfigurazionePiscine["finiture"]>;
  comfort?: Partial<ConfigurazionePiscine["comfort"]>;
} = {}): PoolReferenceConfig {
  return {
    ...DEFAULT_PISCINE_CONFIG,
    operazione: over.operazione ?? DEFAULT_PISCINE_CONFIG.operazione,
    piscina: { ...DEFAULT_PISCINE_CONFIG.piscina, ...over.piscina },
    finiture: { ...DEFAULT_PISCINE_CONFIG.finiture, ...over.finiture },
    comfort: { ...DEFAULT_PISCINE_CONFIG.comfort, ...over.comfort },
  };
}

/** «RUOLO — chiave» di ogni foto scelta, nell'ordine in cui va al modello. */
const ruoli = (c: PoolReferenceConfig) => collectPoolReferenceImages(c).map((r) => r.label.split(":")[0]);

describe("foto piscine: i file", () => {
  it("ogni file dichiarato esiste, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
    expect(listPoolReferencePaths().length).toBeGreaterThanOrEqual(40);
  });

  it("le foto di forma (accessi, sei tipologie, sfioro nascosto, recinzione) sono in grigi veri, le altre davvero a colori", async () => {
    for (const t of TABELLE) {
      for (const [chiave, e] of Object.entries(t)) expect(isBlackAndWhite(e), `${chiave} (${e.filename})`).toBe(voceDiForma(t, chiave));
    }
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio([], ...TABELLE)).toEqual([]);
  }, 30_000);

  it("nessun colore né finitura nel testo delle foto in bianco e nero", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
  });

  it("le foto di forma sono scene piene di contesto (giardino, mare, siepi): il testo descrive solo la costruzione", () => {
    for (const t of TABELLE) {
      for (const [chiave, e] of Object.entries(t)) {
        if (isBlackAndWhite(e)) expect(e.text, `${chiave} (${e.filename})`).not.toMatch(PAESAGGIO);
      }
    }
  });

  it("testi in inglese, brevi (≤ 160 caratteri), senza punto finale (lo mette l'etichetta)", () => {
    for (const t of TABELLE) {
      for (const [chiave, e] of Object.entries(t)) {
        expect(e.text.length, chiave).toBeLessThanOrEqual(160);
        expect(e.text, chiave).not.toMatch(/\.\s*$/);
        expect(e.text, chiave).not.toMatch(/\b(della|piscina|bordo|acqua)\b/i);
      }
    }
  });

  it("ogni opzione del form ha la sua foto o un motivo scritto in SENZA_FOTO, mai tutte e due", () => {
    for (const [dim, { opzioni, foto }] of Object.entries(DIMENSIONI)) {
      const senza = SENZA_FOTO[dim] ?? {};
      for (const opzione of opzioni) {
        const haFoto = Object.prototype.hasOwnProperty.call(foto, opzione);
        const haMotivo = Object.prototype.hasOwnProperty.call(senza, opzione);
        expect(haFoto || haMotivo, `${dim}=${opzione}: né foto né motivo`).toBe(true);
        expect(haFoto && haMotivo, `${dim}=${opzione}: foto E motivo`).toBe(false);
      }
      // niente chiavi morte: ogni foto e ogni motivo corrispondono a un'opzione vera
      for (const chiave of [...Object.keys(foto), ...Object.keys(senza)]) expect(opzioni, `${dim}=${chiave}`).toContain(chiave);
    }
  });

  it("ogni foto di tipologia dichiara su quale sistema di bordo è costruita la vasca", () => {
    for (const tipo of Object.keys(POOL_TYPE_REFERENCES)) {
      expect(POOL_TYPE_PHOTO_EDGE_SYSTEMS[tipo]?.length, tipo).toBeGreaterThan(0);
      for (const s of POOL_TYPE_PHOTO_EDGE_SYSTEMS[tipo]) expect(Object.keys(WATER_SYSTEM_DESCRIPTIONS)).toContain(s);
    }
  });

  it("le foto vecchie sbagliate non tornano: la vasca a fagiolo non fa più da rettangolare, l'infinity non fa da lap pool", () => {
    expect(POOL_TYPE_REFERENCES.interrata_rettangolare.filename).not.toBe("Piscina-Interrata-Rettangolare-Giardino.webp");
    expect(POOL_TYPE_REFERENCES.interrata_organica.filename).toBe("Piscina-Interrata-Rettangolare-Giardino.webp");
    // lap pool, plunge e semi-incassata ora hanno la loro foto di forma (pools/…-BN): nessuna delle vecchie di outdoor/
    for (const tipo of ["lap_pool", "plunge_pool", "semi_incassata"]) {
      const foto = POOL_TYPE_REFERENCES[tipo];
      expect(foto.folder, tipo).toBe("pools");
      expect(foto.filename, tipo).toMatch(/-BN\.webp$/);
      expect(ruoli(config({ piscina: { tipo: tipo as ConfigurazionePiscine["piscina"]["tipo"] } }))[0], tipo).toBe(`POOL TYPE TARGET — ${tipo}`);
    }
  });
});

describe("foto piscine: quali vanno al modello", () => {
  it("nuova piscina col form di default: tipologia, gradini e rivestimento (il tetto è 3; prima era una foto sola)", () => {
    expect(ruoli(config())).toEqual([
      "POOL TYPE TARGET — interrata_rettangolare",
      "POOL ACCESS TARGET — gradini_angolo",
      "INTERIOR FINISH TARGET — mosaico_grigio",
    ]);
  });

  it("con tutto scelto restano le 3 più importanti: vasca, accesso, rivestimento; poi bordo, area, acqua, accessori", () => {
    const tutto = config({
      operazione: "replace_existing_pool",
      piscina: { tipo: "sfioro_rettangolare", sistema_bordo: "sfioro", colore_acqua: "turchese" },
      finiture: { rivestimento_interno: "gres_effetto_sabbia", coping: "pietra_chiara", area_perimetrale: "deck_wpc" },
      comfort: { accesso: "spiaggetta", accessori: ["lama_dacqua", "doccia_esterna"], illuminazione: "subacquea_soft" },
    });
    expect(collectPoolReferenceImages(tutto)).toHaveLength(MAX_SHARED_REFERENCES);
    expect(ruoli(tutto)).toEqual([
      "POOL TYPE TARGET — sfioro_rettangolare",
      "POOL ACCESS TARGET — spiaggetta",
      "INTERIOR FINISH TARGET — gres_effetto_sabbia",
    ]);
    // senza accesso (e con la lap pool, che dal 05/10/2026 ha la sua foto) sale il bordo al posto dei gradini
    expect(ruoli({ ...tutto, piscina: { tipo: "lap_pool", sistema_bordo: "skimmer", colore_acqua: "turchese" }, comfort: { accesso: "nessuno", accessori: ["lama_dacqua"] } })).toEqual([
      "POOL TYPE TARGET — lap_pool",
      "INTERIOR FINISH TARGET — gres_effetto_sabbia",
      "COPING TARGET — pietra_chiara",
    ]);
  });

  it("ogni operazione allega solo le foto di ciò che cambia", () => {
    const pieno = {
      piscina: { tipo: "interrata_rettangolare" as const, colore_acqua: "azzurra_classica" as const },
      finiture: { rivestimento_interno: "mosaico_bianco" as const, coping: "travertino" as const, area_perimetrale: "deck_wpc" as const },
      comfort: { accesso: "scala_inox" as const, accessori: ["lama_dacqua" as const], illuminazione: "nessuna" as const },
    };
    expect(ruoli(config({ ...pieno, operazione: "remove_existing_pool" }))).toEqual([]);
    expect(ruoli(config({ ...pieno, operazione: "recolor_waterlook_or_liner_only" }))).toEqual([
      "INTERIOR FINISH TARGET — mosaico_bianco",
      "WATER COLOUR TARGET — azzurra_classica",
    ]);
    // Comportamento nuovo: prima «solo bordo» non allegava niente (la vecchia tabella aveva
    // solo la tipologia, e solo per nuova piscina o sostituzione). Ora il bordo che cambia ha la sua foto.
    expect(ruoli(config({ ...pieno, operazione: "change_coping_only" }))).toEqual(["COPING TARGET — travertino"]);
    expect(ruoli(config({ ...pieno, operazione: "add_access_system" }))).toEqual(["POOL ACCESS TARGET — scala_inox"]);
    expect(ruoli(config({ ...pieno, operazione: "add_access_system", comfort: { ...pieno.comfort, accesso: "nessuno" } }))).toEqual([]);
    expect(ruoli(config({ ...pieno, operazione: "add_pool_features" }))).toEqual(["POOL FEATURE TARGET — lama_dacqua"]);
  });

  it("accessori nell'ordine scelto; le luci subacquee valgono una volta anche se scelte due volte", () => {
    const c = config({
      operazione: "add_pool_features",
      comfort: { accessori: ["doccia_esterna", "illuminazione_subacquea", "cascata"], illuminazione: "subacquea_e_perimetrale" },
    });
    expect(ruoli(c)).toEqual([
      "POOL FEATURE TARGET — doccia_esterna",
      "POOL FEATURE TARGET — illuminazione_subacquea",
      "POOL FEATURE TARGET — cascata",
    ]);
    const luci = collectPoolReferenceImages(config({ operazione: "add_pool_features", comfort: { accessori: [], illuminazione: "subacquea_soft" } }));
    expect(luci.map((r) => r.filename)).toEqual(["Piscina-Crepuscolare-Con-Luci-LED-Subacquee.webp"]);
    // foto scattata al crepuscolo: l'etichetta dice di tenere l'ora del giorno della foto da modificare
    expect(luci[0].label).toMatch(/keep the time of day and the exposure of the source photo/);
    // mai due volte lo stesso file, qualunque cosa si scelga
    const paths = collectPoolReferenceImages(c).map((r) => `${r.folder}/${r.filename}`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("la foto della vasca segue il sistema di bordo: la tipologia vince sullo skimmer di default", () => {
    // «Interrata a sfioro» lasciando «Skimmer»: vince la tipologia, la foto è quella dello sfioro
    expect(ruoli(config({ piscina: { tipo: "sfioro_rettangolare", sistema_bordo: "skimmer" } }))[0]).toBe("POOL TYPE TARGET — sfioro_rettangolare");
    expect(ruoli(config({ piscina: { tipo: "infinity_pool", sistema_bordo: "skimmer" } }))[0]).toBe("POOL TYPE TARGET — infinity_pool");
    // rettangolare con bordo a sfioro: la foto della rettangolare (a skimmer) mostrerebbe il bordo sbagliato
    expect(ruoli(config({ piscina: { tipo: "interrata_rettangolare", sistema_bordo: "sfioro" } }))[0]).toBe("POOL EDGE SYSTEM TARGET — sfioro");
    expect(ruoli(config({ piscina: { tipo: "interrata_organica", sistema_bordo: "infinity_edge" } }))[0]).toBe("POOL EDGE SYSTEM TARGET — infinity_edge");
    // sfioro nascosto: la foto della rettangolare (a skimmer) mostrerebbe il bordo sbagliato, vince la foto del sistema
    const nascosto = ruoli(config({ piscina: { tipo: "interrata_rettangolare", sistema_bordo: "sfioro_nascosto" } }));
    expect(nascosto.filter((r) => /^POOL (TYPE|EDGE SYSTEM) TARGET/.test(r))).toEqual(["POOL EDGE SYSTEM TARGET — sfioro_nascosto"]);
    expect(nascosto[0]).toBe("POOL EDGE SYSTEM TARGET — sfioro_nascosto");
    expect(nascosto[1]).toBe("POOL ACCESS TARGET — gradini_angolo");
  });

  it("acqua impossibile su quel rivestimento: il rivestimento vince, la foto dell'acqua non va", () => {
    expect(ruoli(config({ operazione: "recolor_waterlook_or_liner_only", finiture: { rivestimento_interno: "liner_scuro" }, piscina: { colore_acqua: "turchese" } })))
      .toEqual(["INTERIOR FINISH TARGET — liner_scuro"]);
    expect(ruoli(config({ operazione: "recolor_waterlook_or_liner_only", finiture: { rivestimento_interno: "liner_scuro" }, piscina: { colore_acqua: "blu_profondo" } })))
      .toEqual(["INTERIOR FINISH TARGET — liner_scuro", "WATER COLOUR TARGET — blu_profondo"]);
  });

  it("etichetta «RUOLO — chiave: testo. Cosa copiare»: le scene dicono di prendere solo l'elemento", () => {
    const refs = collectPoolReferenceImages(config({ operazione: "recolor_waterlook_or_liner_only", piscina: { colore_acqua: "turchese" } }));
    for (const r of refs) {
      expect(r.label).toMatch(/^[A-Z ]+ — [a-z_]+: [^.]+\. .+/);
      expect(r.url).toMatch(new RegExp(`/render-references/${r.folder}/${encodeURIComponent(r.filename)}$`));
    }
    const acqua = refs.find((r) => r.label.startsWith("WATER COLOUR TARGET"));
    expect(acqua?.label).toMatch(/only as the reference for the water tone and clarity; ignore the pool shape/);
    const tipo = collectPoolReferenceImages(config())[0];
    expect(tipo.label).toMatch(/Copy only the basin construction .* ignore its colours, finishes, house and landscape/);
    const accesso = collectPoolReferenceImages(config())[1];
    expect(accesso.label).toMatch(/Copy the shape and construction only — the photo is deliberately black-and-white/);
  });

  it("firma vecchia (operazione + tipologia al livello alto) ancora accettata", () => {
    expect(collectPoolReferenceImages({ operazione: "add_new_pool", tipo: "infinity_pool" })[0].label).toMatch(/^POOL TYPE TARGET — infinity_pool/);
    expect(collectPoolReferenceImages({ operazione: "change_coping_only", tipo: "infinity_pool" })).toEqual([]);
  });

  it("l'edge sceglie le foto dallo stesso config del prompt (piatto: il wizard non usa legacy_config)", () => {
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-pool-render", "index.ts"), "utf8");
    expect(src).toMatch(/collectPoolReferenceImages\(rawConfig as PoolReferenceConfig\)/);
    expect(src).not.toMatch(/collectPoolReferenceImages\(\(\(\) => \{ const c = asRecord\(session\.config\)/);
    // le foto condivise sono le uniche immagini oltre alla sorgente: la legenda parte da Image 2
    expect(src).toMatch(/buildSharedReferenceLegend\(fetched\.references\)/);
  });
});

describe("foto piscine: elementi nuovi", () => {
  it("biopiscina: la foto del set nata per l'acqua grigio-verde fa da tipologia (una volta sola anche se servirebbe due volte)", () => {
    const c = config({ piscina: { tipo: "biopiscina", sistema_bordo: "skimmer", colore_acqua: "grigio_verde_naturale" }, comfort: { accesso: "nessuno" } });
    const refs = collectPoolReferenceImages(c);
    expect(refs[0].label).toMatch(/^POOL TYPE TARGET — biopiscina: .*Copy only the layout: open swimming water, the planted regeneration margin/);
    expect(refs.filter((r) => r.filename === "Acqua-Naturale-In-Biopiscina-Elegante.webp")).toHaveLength(1);
  });

  it("rimozione: solo la ghiaia ha una foto senza piscina; prato, deck e pietra no (spingerebbero a lasciare la vasca)", () => {
    expect(ruoli(config({ operazione: "remove_existing_pool", finiture: { superficie_ripristino: "ghiaia_drenante" } }))).toEqual(["RESTORED SURFACE TARGET — ghiaia_drenante"]);
    expect(ruoli(config({ operazione: "remove_existing_pool", finiture: { superficie_ripristino: "prato_raccordato" } }))).toEqual([]);
    // la superficie di ripristino conta solo nella rimozione
    expect(ruoli(config({ finiture: { superficie_ripristino: "ghiaia_drenante" } })).some((r) => r.startsWith("RESTORED"))).toBe(false);
  });

  it("recinzione in vetro: ha la sua foto di forma e non sta più in SENZA_FOTO", () => {
    const refs = collectPoolReferenceImages(config({ operazione: "add_pool_features", comfort: { accessori: ["recinzione_vetro"] } }));
    expect(refs.map((r) => r.filename)).toEqual(["Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina-BN.webp"]);
    expect(SENZA_FOTO.accessori?.recinzione_vetro).toBeUndefined();
  });
});

describe("foto piscine: le otto foto di forma del 05/10/2026", () => {
  /** Tipologia → file della foto di forma e frase che dice cosa la rende quella vasca. */
  const TIPOLOGIE: Array<[ConfigurazionePiscine["piscina"]["tipo"], string, RegExp]> = [
    ["lap_pool", "Piscina-Lap-Pool-Lunga-E-Stretta-BN.webp", /many times longer than wide/],
    ["plunge_pool", "Piscina-Plunge-Compatta-Da-Patio-BN.webp", /small rectangular plunge pool set into a patio/],
    ["semi_incassata", "Piscina-Semi-Interrata-Con-Muretto-BN.webp", /wall about 60 cm high shows above the ground/],
    ["fuori_terra_premium", "Piscina-Fuori-Terra-Premium-Rivestita-BN.webp", /above-ground .* two-rail ladder/],
    ["minipiscina", "Minipiscina-Su-Terrazzo-BN.webp", /spa-style mini pool on a terrace/],
    ["terrazzo_compatta", "Piscina-Compatta-Su-Tetto-Terrazza-BN.webp", /resting directly on the terrace floor beside the parapet/],
  ];

  it("ogni tipologia ha la sua foto in pools/ (B/N, con la miniatura a colori) e nessuna sta in SENZA_FOTO", () => {
    for (const [tipo, file, descrizione] of TIPOLOGIE) {
      const e = POOL_TYPE_REFERENCES[tipo];
      expect(e.folder, tipo).toBe("pools");
      expect(e.filename, tipo).toBe(file);
      expect(e.text, tipo).toMatch(descrizione);
      expect(isBlackAndWhite(e), tipo).toBe(true);
      expect(POOL_TYPE_PHOTO_EDGE_SYSTEMS[tipo], tipo).toEqual(["skimmer"]);
      expect(SENZA_FOTO.tipo?.[tipo], tipo).toBeUndefined();
    }
    expect(fileMancanti(POOL_TYPE_REFERENCES, POOL_EDGE_SYSTEM_REFERENCES, POOL_FEATURE_REFERENCES)).toEqual([]);
    expect(miniatureMancanti(POOL_TYPE_REFERENCES, POOL_EDGE_SYSTEM_REFERENCES, POOL_FEATURE_REFERENCES)).toEqual([]);
    // tutte le 11 tipologie del form hanno ormai una foto: l'elenco SENZA_FOTO non ha più la dimensione «tipo»
    expect(Object.keys(POOL_TYPE_REFERENCES).sort()).toEqual(Object.keys(POOL_TYPE_DESCRIPTIONS).sort());
  });

  it("una foto per file: nessuna delle otto è usata da due voci diverse", () => {
    const nuove = [...TIPOLOGIE.map(([tipo]) => POOL_TYPE_REFERENCES[tipo]), POOL_EDGE_SYSTEM_REFERENCES.sfioro_nascosto, POOL_FEATURE_REFERENCES.recinzione_vetro]
      .map((e) => `${e.folder}/${e.filename}`);
    expect(new Set(nuove).size).toBe(8);
    const tutte = TABELLE.flatMap((t) => Object.values(t)).map((e) => `${e.folder}/${e.filename}`);
    for (const n of nuove) expect(tutte.filter((x) => x === n), n).toHaveLength(1);
  });

  it("nuova piscina o sostituzione: la foto della tipologia parte per prima, con la frase su cosa copiare", () => {
    for (const operazione of ["add_new_pool", "replace_existing_pool"] as const) {
      for (const [tipo, file] of TIPOLOGIE) {
        const [prima] = collectPoolReferenceImages(config({ operazione, piscina: { tipo, sistema_bordo: "skimmer" } }));
        expect(prima.label, `${operazione} ${tipo}`).toMatch(new RegExp(`^POOL TYPE TARGET — ${tipo}: `));
        expect(prima.filename, tipo).toBe(file);
      }
    }
    // lap pool e plunge stanno nel terreno: contano sagoma, bordo e livello dell'acqua, e il colore arriva dal testo
    for (const tipo of ["lap_pool", "plunge_pool"] as const) {
      const [prima] = collectPoolReferenceImages(config({ piscina: { tipo } }));
      expect(prima.label, tipo).toMatch(/Copy only the basin construction — outline, edge and water level; ignore its colours, finishes, house and landscape/);
    }
    // semi-incassata, fuori terra, minipiscina e da terrazzo stanno sopra il terreno: si copia anche quanto
    for (const tipo of ["semi_incassata", "fuori_terra_premium", "minipiscina", "terrazzo_compatta"] as const) {
      const [prima] = collectPoolReferenceImages(config({ piscina: { tipo } }));
      expect(prima.label, tipo).toMatch(/how its walls stand above the ground, the rim or coping on top/);
      expect(prima.label, tipo).toMatch(/ignore its colours, wall finishes, house and landscape/);
    }
  });

  it("un altro sistema di bordo: la foto della tipologia (a skimmer) lascia il posto a quella del sistema", () => {
    for (const [tipo] of TIPOLOGIE) {
      expect(ruoli(config({ piscina: { tipo, sistema_bordo: "sfioro" } }))[0], tipo).toBe("POOL EDGE SYSTEM TARGET — sfioro");
      expect(ruoli(config({ piscina: { tipo, sistema_bordo: "sfioro_nascosto" } }))[0], tipo).toBe("POOL EDGE SYSTEM TARGET — sfioro_nascosto");
    }
  });

  it("la tipologia si fotografa solo se l'operazione cambia la vasca: solo bordo, accesso, acqua, accessori e rimozione no", () => {
    for (const [tipo] of TIPOLOGIE) {
      for (const operazione of ["change_coping_only", "add_access_system", "recolor_waterlook_or_liner_only", "add_pool_features", "remove_existing_pool"] as const) {
        expect(ruoli(config({ operazione, piscina: { tipo } })).filter((r) => /^POOL (TYPE|EDGE SYSTEM) TARGET/.test(r)), `${operazione} ${tipo}`).toEqual([]);
      }
    }
  });

  it("sfioro nascosto: la foto dice «a filo con una fessura» e non porta l'idea di un bordo che sparisce nel panorama", () => {
    const [prima] = collectPoolReferenceImages(config({ piscina: { sistema_bordo: "sfioro_nascosto" } }));
    expect(prima.filename).toBe("Bordo-A-Sfioro-Con-Canale-Nascosto-BN.webp");
    expect(prima.label).toMatch(/^POOL EDGE SYSTEM TARGET — sfioro_nascosto: hidden overflow edge: the water brims level with the coping and only a hairline slot separates them/);
    expect(prima.label).toMatch(/Copy only how the edge holds the water — flush with the coping on every side, no grating, skimmer or gutter in view/);
    expect(prima.label).not.toMatch(/vanishing edge/);
    // gli altri sistemi continuano a dire «vanishing edge»
    const [sfioro] = collectPoolReferenceImages(config({ piscina: { tipo: "interrata_rettangolare", sistema_bordo: "sfioro" } }));
    expect(sfioro.label).toMatch(/Copy only how the edge holds the water \(water level, overflow, vanishing edge\)/);
    // la biopiscina tiene la sua foto anche con lo sfioro nascosto (bordo naturale: vedi POOL_TYPE_PHOTO_EDGE_SYSTEMS)
    expect(ruoli(config({ piscina: { tipo: "biopiscina", sistema_bordo: "sfioro_nascosto" } }))[0]).toBe("POOL TYPE TARGET — biopiscina");
  });

  it("recinzione in vetro: parte solo se è scelta e se l'operazione cambia gli accessori; dell'immagine conta la sola recinzione", () => {
    const recinzione = ["recinzione_vetro" as const];
    const [foto] = collectPoolReferenceImages(config({ operazione: "add_pool_features", comfort: { accessori: recinzione } }));
    expect(foto.label).toMatch(/^POOL FEATURE TARGET — recinzione_vetro: pool safety fence of frameless glass panels about 120 cm high on slim floor spigots/);
    expect(foto.label).toMatch(/Copy only the fence .* the photo is deliberately black-and-white and its pool, paving and garden are not part of the brief/);
    expect(foto.url).toMatch(/\/render-references\/pools\/Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina-BN\.webp$/);
    // nuova piscina: dopo vasca, accesso e rivestimento (tetto 3) la recinzione non entra
    expect(ruoli(config({ comfort: { accessori: recinzione } }))).toEqual([
      "POOL TYPE TARGET — interrata_rettangolare",
      "POOL ACCESS TARGET — gradini_angolo",
      "INTERIOR FINISH TARGET — mosaico_grigio",
    ]);
    // «aggiungi accessori»: ognuno col suo posto, nell'ordine scelto
    expect(ruoli(config({ operazione: "add_pool_features", comfort: { accessori: ["lama_dacqua", "recinzione_vetro"] } }))).toEqual([
      "POOL FEATURE TARGET — lama_dacqua",
      "POOL FEATURE TARGET — recinzione_vetro",
    ]);
    // senza la scelta, o con un'operazione che non tocca gli accessori, niente foto
    expect(ruoli(config({ operazione: "add_pool_features", comfort: { accessori: [] } }))).toEqual([]);
    for (const operazione of ["remove_existing_pool", "change_coping_only", "add_access_system", "recolor_waterlook_or_liner_only"] as const) {
      expect(ruoli(config({ operazione, comfort: { accessori: recinzione } })).some((r) => /recinzione_vetro/.test(r)), operazione).toBe(false);
    }
  });
});
