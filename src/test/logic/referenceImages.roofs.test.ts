import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLASHING_PHOTOS,
  GUTTER_MATERIAL_PHOTOS,
  ROOF_COVERING_OVERVIEW_PHOTOS,
  ROOF_COVERING_PHOTOS,
  ROOF_SENZA_FOTO,
  SKYLIGHT_TYPE_PHOTOS,
  SNOW_GUARD_PHOTOS,
  SOLAR_TYPE_PHOTOS,
  collectRoofReferenceImages,
  listRoofReferencePaths,
  type RoofReferenceConfig,
} from "../../../shared/render-references/roofReferences.ts";
import { MAX_SHARED_REFERENCES } from "../../../shared/render-references/referencePicker.ts";
import { etichetteDiFormaConColore, fileMancanti, fotoBnADColori, fotoColoriInGrigio, miniatureMancanti } from "../lib/referenceGuards";

const TABELLE = [ROOF_COVERING_PHOTOS, ROOF_COVERING_OVERVIEW_PHOTOS, GUTTER_MATERIAL_PHOTOS, SKYLIGHT_TYPE_PHOTOS, SOLAR_TYPE_PHOTOS, FLASHING_PHOTOS, SNOW_GUARD_PHOTOS];

/** Le opzioni del wizard (TettoConfigForm / types.ts). */
const MANTI = ["tegole_coppi", "tegole_marsigliesi", "tegole_portoghesi", "tegole_piane", "ardesia_naturale", "ardesia_sintetica", "lamiera_grecata", "lamiera_aggraffata", "lamiera_zinco_titanio", "guaina_bituminosa", "guaina_tpo", "tegole_fotovoltaiche"];
const GRONDAIE = ["alluminio", "rame", "acciaio_zincato", "pvc", "zinco_titanio"];
const LUCERNARI = ["piatto", "sporgente", "abbaino"];
const PANNELLI = ["fotovoltaico_nero", "fotovoltaico_blu", "tegola_solare_integrata"];
/** `MaterialeLattoneria` (le grondaie senza il PVC) e `ConfigFermaneve["tipo"]`. */
const LATTONERIE = ["rame", "zinco_titanio", "acciaio_zincato", "alluminio"];
const FERMANEVE = ["ganci", "griglia"];

const ruoli = (cfg: RoofReferenceConfig) => collectRoofReferenceImages(cfg).map((r) => r.label.split(":")[0]);

describe("foto di riferimento condivise: tetto — i file", () => {
  it("ogni file dichiarato esiste su disco, con la sua miniatura", () => {
    expect(fileMancanti(...TABELLE)).toEqual([]);
    expect(miniatureMancanti(...TABELLE)).toEqual([]);
    expect(listRoofReferencePaths().every((p) => p.startsWith("roofs/"))).toBe(true);
  });

  it("le foto di forma (lucernari, fotovoltaico, scossaline, fermaneve) sono davvero in bianco e nero, quelle di materia davvero a colori", async () => {
    expect(await fotoBnADColori(...TABELLE)).toEqual([]);
    expect(await fotoColoriInGrigio([], ...TABELLE)).toEqual([]);
    for (const e of [...Object.values(SKYLIGHT_TYPE_PHOTOS), ...Object.values(SOLAR_TYPE_PHOTOS), ...Object.values(FLASHING_PHOTOS), ...Object.values(SNOW_GUARD_PHOTOS)]) expect(e.filename).toMatch(/-BN\.webp$/);
    for (const e of Object.values(GUTTER_MATERIAL_PHOTOS)) expect(e.filename).not.toMatch(/-BN\.webp$/);
  });

  it("le etichette delle foto di forma non dicono colori né finiture", () => {
    expect(etichetteDiFormaConColore(...TABELLE)).toEqual([]);
  });

  it("ogni testo sta sotto i 160 caratteri", () => {
    for (const t of TABELLE) for (const [k, e] of Object.entries(t)) expect(e.text.length, k).toBeLessThanOrEqual(160);
  });

  it("ogni opzione del wizard ha una foto o sta in ROOF_SENZA_FOTO con il motivo", () => {
    // Prima: «ogni TipoManto ha una foto». Ora tegole_piane e guaina_bituminosa stanno in
    // ROOF_SENZA_FOTO: le foto vecchie le contraddicevano (coda di castoro, ghiaia di zavorra).
    const senza = (dim: string, valori: string[], tabella: Record<string, unknown>) =>
      valori.filter((v) => !tabella[v] && !ROOF_SENZA_FOTO[`${dim}.${v}`]).map((v) => `${dim}.${v}`);
    expect(senza("manto", MANTI, ROOF_COVERING_PHOTOS)).toEqual([]);
    expect(senza("grondaie", GRONDAIE, GUTTER_MATERIAL_PHOTOS)).toEqual([]);
    expect(senza("lucernari", LUCERNARI, SKYLIGHT_TYPE_PHOTOS)).toEqual([]);
    expect(senza("pannelli_solari", PANNELLI, SOLAR_TYPE_PHOTOS)).toEqual([]);
    // elementi aggiunti nel 10/2026: scossaline e fermaneve hanno la foto; comignoli e linea vita ancora no, con il motivo
    expect(senza("scossaline", LATTONERIE, FLASHING_PHOTOS)).toEqual([]);
    expect(senza("fermaneve", FERMANEVE, SNOW_GUARD_PHOTOS)).toEqual([]);
    expect(senza("comignoli", ["rinnova"], {})).toEqual([]);
    expect(senza("linea_vita", ["attivo"], {})).toEqual([]);
    for (const motivo of Object.values(ROOF_SENZA_FOTO)) expect(motivo.length).toBeGreaterThan(20);
  });

  it("un'opzione che ha la foto non resta anche in ROOF_SENZA_FOTO (motivo scaduto)", () => {
    const tabelle: Record<string, Record<string, unknown>> = {
      manto: ROOF_COVERING_PHOTOS, grondaie: GUTTER_MATERIAL_PHOTOS, lucernari: SKYLIGHT_TYPE_PHOTOS,
      pannelli_solari: SOLAR_TYPE_PHOTOS, scossaline: FLASHING_PHOTOS, fermaneve: SNOW_GUARD_PHOTOS,
    };
    const doppie = Object.keys(ROOF_SENZA_FOTO).filter((chiave) => {
      const [dimensione, valore] = chiave.split(".");
      return Boolean(tabelle[dimensione]?.[valore]);
    });
    expect(doppie).toEqual([]);
  });

  it("marsigliesi: il primo piano è il file «-Falda», la veduta dei tetti è «-Dettaglio» (prima erano scambiati)", () => {
    expect(ROOF_COVERING_PHOTOS.tegole_marsigliesi.filename).toBe("Tetto-Tegole-Marsigliesi-Falda.webp");
    expect(ROOF_COVERING_OVERVIEW_PHOTOS.tegole_marsigliesi.filename).toBe("Tetto-Tegole-Marsigliesi-Dettaglio.webp");
  });
});

describe("foto di riferimento condivise: tetto — scelta e gating per elemento", () => {
  it("coppi: dettaglio (foto nuova) + vista d'insieme, etichette distinte", () => {
    const refs = collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "sostituzione_manto" });
    expect(refs).toHaveLength(2);
    expect(refs[0].filename).toBe("Tegole-Italiane-In-Terracotta.webp");
    expect(refs[0].label).toMatch(/^ROOF COVERING TARGET \(close-up\) — tegole_coppi/);
    expect(refs[1].label).toMatch(/^ROOF COVERING TARGET \(whole slope\)/);
    expect(refs[1].label).toMatch(/do NOT copy this building/);
  });

  it("la configurazione salvata dal wizard (manto.tipo) vale quanto il vecchio tipo_manto", () => {
    expect(collectRoofReferenceImages({ manto: { tipo: "tegole_coppi" } }).map((r) => r.filename))
      .toEqual(collectRoofReferenceImages({ tipo_manto: "tegole_coppi" }).map((r) => r.filename));
  });

  it("solo colore o solo lattonerie → nessuna foto del manto", () => {
    expect(collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "solo_colore" })).toEqual([]);
    expect(collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "lattonerie_accessori" })).toEqual([]);
  });

  it("solo lattonerie con grondaie, abbaino e tegole solari: le foto di quegli elementi arrivano (prima non arrivava niente)", () => {
    expect(ruoli({
      tipo_intervento: "lattonerie_accessori",
      manto: { tipo: "tegole_coppi" },
      grondaie: { attivo: true, materiale: "rame" },
      lucernari: { attivo: true, azione: "aggiungi", tipo: "abbaino" },
      pannelli_solari: { attivo: true, tipo: "tegola_solare_integrata" },
    })).toEqual(["SKYLIGHT TYPE TARGET — abbaino", "SOLAR TILE TARGET — tegola_solare_integrata", "GUTTER MATERIAL TARGET — rame"]);
  });

  it("un elemento che non cambia non porta foto", () => {
    const base: RoofReferenceConfig = { tipo_intervento: "lattonerie_accessori", manto: { tipo: "tegole_coppi" } };
    expect(collectRoofReferenceImages({ ...base, grondaie: { attivo: false, materiale: "rame" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, lucernari: { attivo: true, azione: "mantieni", tipo: "abbaino" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, lucernari: { attivo: true, azione: "rimuovi", tipo: "piatto" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, lucernari: { attivo: false, azione: "aggiungi", tipo: "piatto" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, pannelli_solari: { attivo: false, tipo: "fotovoltaico_nero" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, pannelli_solari: { attivo: false, tipo: "tegola_solare_integrata" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, scossaline: { azione: "mantieni", materiale: "rame" } })).toEqual([]);
    expect(collectRoofReferenceImages({ ...base, fermaneve: { attivo: false, tipo: "griglia" } })).toEqual([]);
  });

  it("stessi default del prompt: lucernario senza tipo = piatto, grondaia senza materiale = alluminio", () => {
    expect(collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", lucernari: { attivo: true, azione: "aggiungi" } })[0].filename).toBe("Lucernario-A-Filo-Del-Tetto-In-Tegole-BN.webp");
    expect(collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", grondaie: { attivo: true } })[0].filename).toBe("Grondaia-Semicircolare-Con-Staffa.webp");
  });

  it("fotovoltaico con cornice: una sola foto di forma per nero e blu, col ruolo dei moduli (non quello delle tegole)", () => {
    const base: RoofReferenceConfig = { tipo_intervento: "lattonerie_accessori" };
    const nero = collectRoofReferenceImages({ ...base, pannelli_solari: { attivo: true, tipo: "fotovoltaico_nero" } });
    const blu = collectRoofReferenceImages({ ...base, pannelli_solari: { attivo: true, tipo: "fotovoltaico_blu" } });
    expect(nero).toHaveLength(1);
    expect(`${nero[0].folder}/${nero[0].filename}`).toBe("roofs/Pannelli-Fotovoltaici-Su-Binari-BN.webp");
    expect(blu[0].filename).toBe(nero[0].filename);
    expect(nero[0].label).toMatch(/^SOLAR PANEL TARGET — fotovoltaico_nero: framed rectangular solar modules/);
    expect(blu[0].label).toMatch(/^SOLAR PANEL TARGET — fotovoltaico_blu: framed rectangular solar modules/);
    // la foto ha dodici moduli in due file e un tetto intorno: il testo dice di non copiarli
    expect(nero[0].label).toMatch(/ignore this roof, its covering and the building/);
    expect(nero[0].label).toMatch(/the number, rows and position of the modules come from the written specification/);
    expect(nero[0].label).toMatch(/black-and-white: colour, finish and material come from the written specification$/);
    // la tegola solare integrata resta com'era: stesso ruolo, altra foto
    const tegola = collectRoofReferenceImages({ ...base, pannelli_solari: { attivo: true, tipo: "tegola_solare_integrata" } });
    expect(tegola[0].label).toMatch(/^SOLAR TILE TARGET — tegola_solare_integrata: integrated solar tiles/);
    expect(tegola[0].filename).not.toBe(nero[0].filename);
  });

  it("stesso default del prompt: fotovoltaico attivo senza tipo = nero, con la foto dei moduli", () => {
    const refs = collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", pannelli_solari: { attivo: true } });
    expect(refs.map((r) => r.label.split(":")[0])).toEqual(["SOLAR PANEL TARGET — fotovoltaico_nero"]);
    // un tipo che non è una chiave (testo libero) non allega niente, senza errori
    expect(collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", pannelli_solari: { attivo: true, tipo: "pannelli neri" } })).toEqual([]);
  });

  it("scossaline: solo se si sostituiscono; una foto per tutti i metalli, alluminio se il materiale manca", () => {
    for (const materiale of LATTONERIE) {
      const refs = collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", scossaline: { azione: "sostituisci", materiale } });
      expect(refs, materiale).toHaveLength(1);
      expect(`${refs[0].folder}/${refs[0].filename}`, materiale).toBe("roofs/Scossalina-Di-Bordo-Falda-E-Colmo-BN.webp");
      expect(refs[0].label, materiale).toMatch(new RegExp(`^ROOF FLASHING TARGET — ${materiale}: roof flashings: wide folded verge trim`));
    }
    const [senzaMateriale] = collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", scossaline: { azione: "sostituisci" } });
    expect(senzaMateriale.label).toMatch(/^ROOF FLASHING TARGET — alluminio:/);
    // la foto ha un camino, un timpano e le tegole: il testo dice di non portarli nel tetto del cliente
    expect(senzaMateriale.label).toMatch(/add no flashing line, chimney or gable that the source photo does not already have/);
    expect(senzaMateriale.label).toMatch(/black-and-white: colour, finish and material come from the written specification$/);
    // il PVC non è una lattoneria: niente foto, nessun errore
    expect(collectRoofReferenceImages({ tipo_intervento: "lattonerie_accessori", scossaline: { azione: "sostituisci", materiale: "pvc" } })).toEqual([]);
  });

  it("fermaneve: attivi → la foto del tipo (ganci se manca); spenti → niente", () => {
    const base: RoofReferenceConfig = { tipo_intervento: "lattonerie_accessori" };
    const ganci = collectRoofReferenceImages({ ...base, fermaneve: { attivo: true, tipo: "ganci" } });
    const griglia = collectRoofReferenceImages({ ...base, fermaneve: { attivo: true, tipo: "griglia" } });
    expect(ganci.map((r) => `${r.folder}/${r.filename}`)).toEqual(["roofs/Fermaneve-A-Ganci-Su-Tegole-BN.webp"]);
    expect(griglia.map((r) => `${r.folder}/${r.filename}`)).toEqual(["roofs/Fermaneve-A-Barra-Continua-BN.webp"]);
    expect(ganci[0].label).toMatch(/^SNOW GUARD TARGET — ganci: small snow-guard hooks/);
    expect(griglia[0].label).toMatch(/^SNOW GUARD TARGET — griglia: continuous snow-guard grille rail/);
    expect(collectRoofReferenceImages({ ...base, fermaneve: { attivo: true } }).map((r) => r.filename)).toEqual(ganci.map((r) => r.filename));
    // le foto mostrano un tetto e una gronda: il testo dice di non copiarli
    for (const r of [...ganci, ...griglia]) expect(r.label).toMatch(/ignore the roof covering, gutter and building of this sample/);
    // la linea vita non ha ancora la foto: da sola non allega niente
    expect(collectRoofReferenceImages({ ...base, linea_vita: { attivo: true } } as RoofReferenceConfig)).toEqual([]);
  });

  it("fermaneve prima delle grondaie, scossaline dopo; la vista d'insieme del manto resta l'ultima", () => {
    // lucernario (10), fotovoltaico (30), fermaneve (35): grondaie (40) e scossaline (45) restano fuori
    expect(ruoli({
      tipo_intervento: "lattonerie_accessori",
      lucernari: { attivo: true, azione: "aggiungi", tipo: "piatto" },
      pannelli_solari: { attivo: true, tipo: "fotovoltaico_blu" },
      fermaneve: { attivo: true, tipo: "ganci" },
      grondaie: { attivo: true, materiale: "rame" },
      scossaline: { azione: "sostituisci", materiale: "rame" },
    })).toEqual(["SKYLIGHT TYPE TARGET — piatto", "SOLAR PANEL TARGET — fotovoltaico_blu", "SNOW GUARD TARGET — ganci"]);
    expect(ruoli({
      tipo_intervento: "lattonerie_accessori",
      fermaneve: { attivo: true, tipo: "griglia" },
      grondaie: { attivo: true, materiale: "rame" },
      scossaline: { azione: "sostituisci", materiale: "rame" },
    })).toEqual(["SNOW GUARD TARGET — griglia", "GUTTER MATERIAL TARGET — rame", "ROOF FLASHING TARGET — rame"]);
    expect(ruoli({
      tipo_intervento: "sostituzione_manto",
      manto: { tipo: "tegole_marsigliesi" },
      grondaie: { attivo: true, materiale: "pvc" },
      scossaline: { azione: "sostituisci", materiale: "alluminio" },
    })).toEqual(["ROOF COVERING TARGET (close-up) — tegole_marsigliesi", "GUTTER MATERIAL TARGET — pvc", "ROOF FLASHING TARGET — alluminio"]);
  });

  it(`al massimo ${MAX_SHARED_REFERENCES}: prima la sagoma (lucernario), poi il manto, le tegole solari; grondaie e vista d'insieme restano fuori`, () => {
    const refs = collectRoofReferenceImages({
      tipo_intervento: "rifacimento_completo",
      manto: { tipo: "tegole_coppi" },
      grondaie: { attivo: true, materiale: "zinco_titanio" },
      lucernari: { attivo: true, azione: "aggiungi", tipo: "piatto" },
      pannelli_solari: { attivo: true, tipo: "tegola_solare_integrata" },
    });
    expect(refs).toHaveLength(MAX_SHARED_REFERENCES);
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["SKYLIGHT TYPE TARGET", "ROOF COVERING TARGET (close-up)", "SOLAR TILE TARGET"]);
  });

  it("la vista d'insieme del manto prende l'ultimo posto libero, dopo le grondaie", () => {
    expect(ruoli({ tipo_intervento: "sostituzione_manto", manto: { tipo: "tegole_marsigliesi" }, grondaie: { attivo: true, materiale: "pvc" } }))
      .toEqual(["ROOF COVERING TARGET (close-up) — tegole_marsigliesi", "GUTTER MATERIAL TARGET — pvc", "ROOF COVERING TARGET (whole slope) — tegole_marsigliesi"]);
  });

  it("manto a tegole fotovoltaiche + tegola solare integrata: la stessa foto non entra due volte", () => {
    const refs = collectRoofReferenceImages({
      tipo_intervento: "sostituzione_manto",
      manto: { tipo: "tegole_fotovoltaiche" },
      pannelli_solari: { attivo: true, tipo: "tegola_solare_integrata" },
    });
    const file = refs.map((r) => r.filename);
    expect(new Set(file).size).toBe(file.length);
    expect(refs[0].label).toMatch(/^ROOF COVERING TARGET \(close-up\) — tegole_fotovoltaiche: .*the photo is deliberately black-and-white/);
  });

  it("manti senza foto valida non allegano niente (tegole piane, guaina bituminosa)", () => {
    expect(collectRoofReferenceImages({ tipo_intervento: "sostituzione_manto", manto: { tipo: "tegole_piane" } })).toEqual([]);
    expect(collectRoofReferenceImages({ tipo_intervento: "sostituzione_manto", manto: { tipo: "guaina_bituminosa" } })).toEqual([]);
  });

  it("formato dell'etichetta «RUOLO — chiave: testo. Cosa copiare»", () => {
    const refs = collectRoofReferenceImages({ tipo_intervento: "rifacimento_completo", manto: { tipo: "lamiera_aggraffata" }, grondaie: { attivo: true, materiale: "rame" } });
    for (const r of refs) expect(r.label).toMatch(/^[A-Z][A-Za-z ()-]+ — [a-z_]+: .+\. .+$/);
    expect(refs.find((r) => r.label.startsWith("GUTTER"))?.label).toMatch(/Copy the gutter and downpipe profile, material and joints only/);
  });
});

describe("generate-roof-render: le foto partono dalla stessa configurazione del prompt", () => {
  it("il collector riceve tutta la configurazione (manto, grondaie, lucernari, pannelli), non solo manto e intervento", () => {
    const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-roof-render", "index.ts"), "utf8");
    expect(src).toMatch(/collectRoofReferenceImages\(rawConfig as RoofReferenceConfig\)/);
    // il retry del QA passa da generateCandidate, che allega le stesse foto citate dalla legenda
    expect(src).toMatch(/referenceImages: sharedReferences\.length > 0 \? sharedReferences : undefined/);
  });
});
