import { describe, expect, it } from "vitest";
import {
  EXTERIOR_BORDER_REFERENCES,
  EXTERIOR_BORDER_SENZA_FOTO,
  EXTERIOR_PAVING_PATTERN_REFERENCES,
  EXTERIOR_PAVING_REFERENCES,
  EXTERIOR_PAVING_SENZA_FOTO,
  EXTERIOR_STEP_REFERENCES,
  EXTERIOR_STEP_SENZA_FOTO,
  GARDEN_HEDGE_REFERENCES,
  GARDEN_LIGHTING_REFERENCES,
  GARDEN_PATH_REFERENCES,
  GARDEN_SENZA_FOTO,
  POOL_COPING_REFERENCES,
  collectExteriorFloorReferenceImages,
  collectGardenReferenceImages,
  listExteriorReferencePaths,
  listGardenReferencePaths,
} from "../../../shared/render-references/exteriorReferences.ts";
import { BLACK_AND_WHITE_RULE, COLOUR_RULE, MAX_SHARED_REFERENCES, isBlackAndWhite } from "../../../shared/render-references/referencePicker.ts";
import {
  EXTERIOR_BORDER_DESCRIPTIONS,
  EXTERIOR_FLOOR_MATERIAL_DESCRIPTIONS,
  EXTERIOR_STEP_DESCRIPTIONS,
} from "../../../shared/render-exterior-floor/promptFragments.ts";
import { buildExteriorFloorPrompt } from "../../../shared/render-exterior-floor/exteriorFloorPromptBuilder.ts";
import { HEDGE_DESCRIPTIONS, LIGHTING_DESCRIPTIONS, PATH_DESCRIPTIONS } from "../../../shared/render-garden/promptFragments.ts";
import { buildGardenPrompt } from "../../../shared/render-garden/gardenPromptBuilder.ts";
import { DEFAULT_EXTERIOR_FLOOR_CONFIG, DEFAULT_GARDEN_CONFIG } from "../../../shared/render-technical/defaults.ts";
import { bridgeTechnicalConfig } from "../../../shared/render-technical/bridge.ts";
import { collectTechnicalReferenceImages, fotoDelPreset, fotoDellOpzione } from "../../../shared/render-technical/referenceImages.ts";
import { OPZIONI_TECNICHE, valoriApplicabili } from "../../../shared/render-technical/opzioni.ts";
import { technicalRenderModuleSpecs } from "@/lib/render/technicalRenderModules";
import { etichetteDiFormaConColore, fileMancanti, fotoBnADColori, fotoColoriInGrigio, miniatureMancanti } from "../lib/referenceGuards";

/**
 * Pavimenti esterni: foto di MATERIA, a colori (superficie, modulo e, se coincide, posa dalla
 * foto; il tono esatto dal testo) e foto di FORMA, in bianco e nero, per gradini e bordi.
 * Giardino: foto di forma per siepe schermante, camminamento a lastre a passo e segnapasso.
 */
const esterno = (preset: string, extra: Record<string, unknown> = {}) =>
  bridgeTechnicalConfig("pavimenti-esterni", { interventionPreset: preset, ...extra });
const giardino = (preset: string, extra: Record<string, unknown> = {}) =>
  bridgeTechnicalConfig("giardini", { interventionPreset: preset, ...extra });
const percorso = (r: { folder: string; filename: string }) => `${r.folder}/${r.filename}`;
const ruolo = (r: { label: string }) => r.label.split(" — ")[0];

const TABELLE_FORMA = [EXTERIOR_STEP_REFERENCES, EXTERIOR_BORDER_REFERENCES, GARDEN_HEDGE_REFERENCES, GARDEN_PATH_REFERENCES, GARDEN_LIGHTING_REFERENCES];

describe("foto di riferimento dei pavimenti esterni: file e colori", () => {
  it("ogni file dichiarato esiste, con la sua miniatura", () => {
    const tabelle = [EXTERIOR_PAVING_REFERENCES, EXTERIOR_PAVING_PATTERN_REFERENCES, POOL_COPING_REFERENCES, EXTERIOR_STEP_REFERENCES, EXTERIOR_BORDER_REFERENCES];
    expect(fileMancanti(...tabelle)).toEqual([]);
    expect(miniatureMancanti(...tabelle)).toEqual([]);
    // 4 foto di pavimentazione (gres e grande formato condividono la stessa) + la pietra a opus incertum + 6 bordi vasca
    // + 3 gradini + 3 bordi (fascia, cordolo, profilo).
    expect(listExteriorReferencePaths()).toHaveLength(17);
  });

  it("gradini, bordi e giardino sono foto di forma: grigio vero, nome «-BN», nessun colore né finitura nel testo", async () => {
    expect(fileMancanti(...TABELLE_FORMA)).toEqual([]);
    expect(miniatureMancanti(...TABELLE_FORMA)).toEqual([]);
    expect(await fotoBnADColori(...TABELLE_FORMA)).toEqual([]);
    expect(etichetteDiFormaConColore(...TABELLE_FORMA)).toEqual([]);
    for (const [chiave, e] of TABELLE_FORMA.flatMap((t) => Object.entries(t))) {
      expect(e.folder, chiave).toBe("exterior");
      expect(e.filename, chiave).toMatch(/-BN\.webp$/);
      expect(isBlackAndWhite(e), chiave).toBe(true);
      expect(e.text.length, chiave).toBeLessThanOrEqual(160);
      // lo scatto ha attorno porte, vasi, rocce, prato o case: il testo dice di prendere solo l'elemento
      expect(e.text, chiave).toMatch(/take only/);
    }
  });

  it("le foto di giardino non hanno una piscina e non ne parlano (era il motivo per cui il giardino non aveva foto)", () => {
    for (const [chiave, e] of [GARDEN_HEDGE_REFERENCES, GARDEN_PATH_REFERENCES, GARDEN_LIGHTING_REFERENCES].flatMap((t) => Object.entries(t))) {
      expect(e.text, chiave).not.toMatch(/pool|water|deck/i);
    }
  });

  it("le liste dei file sono separate: nessuna foto di giardino tra quelle dei pavimenti esterni, e viceversa", () => {
    const esterni = listExteriorReferencePaths();
    const giardino_ = listGardenReferencePaths();
    expect(giardino_).toHaveLength(3);
    expect(giardino_.filter((f) => esterni.includes(f))).toEqual([]);
    expect(giardino_.sort()).toEqual([
      "exterior/Camminamento-Stepping-Stones-Nel-Prato-BN.webp",
      "exterior/Segnapasso-Lungo-Vialetto-BN.webp",
      "exterior/Siepe-Schermante-Sempreverde-BN.webp",
    ]);
  });

  it("sono foto di materia: a colori davvero, nessun file «-BN»", async () => {
    const tutte = [...Object.values(EXTERIOR_PAVING_REFERENCES), ...Object.values(EXTERIOR_PAVING_PATTERN_REFERENCES), ...Object.values(POOL_COPING_REFERENCES)];
    for (const e of tutte) {
      expect(isBlackAndWhite(e), e.filename).toBe(false);
      expect(e.text.length, e.filename).toBeLessThanOrEqual(160);
    }
    expect(await fotoColoriInGrigio([], EXTERIOR_PAVING_REFERENCES, EXTERIOR_PAVING_PATTERN_REFERENCES, POOL_COPING_REFERENCES)).toEqual([]);
  });

  it("ogni materiale ha la sua foto oppure il motivo per cui non ce l'ha", () => {
    for (const m of Object.keys(EXTERIOR_FLOOR_MATERIAL_DESCRIPTIONS)) {
      expect(Boolean(EXTERIOR_PAVING_REFERENCES[m]) !== Boolean(EXTERIOR_PAVING_SENZA_FOTO[m]), m).toBe(true);
    }
  });

  it("ogni tipo di gradino e di bordo ha la sua foto oppure il motivo; le scelte del form sono tipi veri", () => {
    const gradini = Object.keys(EXTERIOR_STEP_DESCRIPTIONS).filter((k) => k !== "nessuno");
    const bordi = Object.keys(EXTERIOR_BORDER_DESCRIPTIONS).filter((k) => k !== "nessuno");
    for (const k of gradini) expect(Boolean(EXTERIOR_STEP_REFERENCES[k]) !== Boolean(EXTERIOR_STEP_SENZA_FOTO[k]), `gradino ${k}`).toBe(true);
    for (const k of bordi) expect(Boolean(EXTERIOR_BORDER_REFERENCES[k]) !== Boolean(EXTERIOR_BORDER_SENZA_FOTO[k]), `bordo ${k}`).toBe(true);
    // niente chiavi inventate né in una tabella né nell'altra
    expect(Object.keys({ ...EXTERIOR_STEP_REFERENCES, ...EXTERIOR_STEP_SENZA_FOTO }).sort()).toEqual([...gradini].sort());
    expect(Object.keys({ ...EXTERIOR_BORDER_REFERENCES, ...EXTERIOR_BORDER_SENZA_FOTO }).sort()).toEqual([...bordi].sort());
    // ogni valore che il form offre è uno di questi tipi (il bordo vasca ha il suo preset e la sua opzione)
    const offerti = (chiave: string) => OPZIONI_TECNICHE["pavimenti-esterni"].find((o) => o.chiave === chiave)!.valori.map((v) => v.value).sort();
    expect(offerti("gradini")).toEqual([...gradini].sort());
    expect(offerti("bordo")).toEqual(bordi.filter((k) => !k.startsWith("coping_piscina")).sort());
  });

  it("ogni tipo di siepe, di camminamento e di luce del giardino ha la sua foto oppure il motivo; le scelte del form sono tipi veri", () => {
    const dimensioni: Array<{ nome: string; tipi: string[]; foto: Record<string, unknown> }> = [
      { nome: "siepi", tipi: Object.keys(HEDGE_DESCRIPTIONS), foto: GARDEN_HEDGE_REFERENCES },
      { nome: "camminamento", tipi: Object.keys(PATH_DESCRIPTIONS), foto: GARDEN_PATH_REFERENCES },
      { nome: "illuminazione", tipi: Object.keys(LIGHTING_DESCRIPTIONS), foto: GARDEN_LIGHTING_REFERENCES },
    ];
    const motiviRestanti = new Set(Object.keys(GARDEN_SENZA_FOTO));
    for (const { nome, tipi, foto } of dimensioni) {
      for (const tipo of tipi) {
        expect(Boolean(foto[tipo]) !== Boolean(GARDEN_SENZA_FOTO[`${nome}/${tipo}`]), `${nome}/${tipo}`).toBe(true);
        motiviRestanti.delete(`${nome}/${tipo}`);
      }
      expect(Object.keys(foto).filter((k) => !tipi.includes(k)), `${nome}: foto per un tipo che non esiste`).toEqual([]);
    }
    expect(Array.from(motiviRestanti), "motivi per tipi che non esistono").toEqual([]);
    const offerti = (chiave: string) => OPZIONI_TECNICHE.giardini.find((o) => o.chiave === chiave)!.valori.map((v) => v.value).sort();
    expect(offerti("camminamento")).toEqual(Object.keys(PATH_DESCRIPTIONS).sort());
    expect(offerti("illuminazione")).toEqual(Object.keys(LIGHTING_DESCRIPTIONS).sort());
  });

  it("le foto prese dalla cartella piscine dicono di ignorare acqua e contesto, o sono primi piani", () => {
    for (const [k, e] of Object.entries({ ...EXTERIOR_PAVING_REFERENCES, ...EXTERIOR_PAVING_PATTERN_REFERENCES, ...POOL_COPING_REFERENCES })) {
      if (e.folder !== "pools") continue;
      expect(e.text, k).toMatch(/take only|ignore/);
    }
  });
});

describe("pavimenti esterni: il preset sceglie la foto della materia", () => {
  const attese: Record<string, string> = {
    gres_outdoor_grande_formato: "exterior/Lastre-Outdoor-In-Gres-Effetto-Pietra.webp",
    deck_wpc: "pools/Decking-WPC-Effetto-Legno-Intorno-Alla-Piscina.webp",
    autobloccanti_carrabili: "exterior/Vialetto-Residenziale-In-Autobloccanti-Grigi.webp",
    coping_piscina: "pools/Bordo-Piscina-In-Pietra-Beige.webp",
  };

  for (const [preset, file] of Object.entries(attese)) {
    it(`${preset} → ${file}`, () => {
      const refs = collectExteriorFloorReferenceImages(esterno(preset));
      expect(refs.map((r) => `${r.folder}/${r.filename}`)).toEqual([file]);
    });
  }

  it("pietra naturale: nessuna foto (l'unica pietra del set è a opus incertum, il preset posa a opus a moduli)", () => {
    expect(collectExteriorFloorReferenceImages(esterno("pietra_naturale"))).toEqual([]);
    expect(EXTERIOR_PAVING_SENZA_FOTO.pietra_naturale).toMatch(/opus/);
  });

  it("etichetta: ruolo, chiave vera della config e coda «materia» (colore dal testo)", () => {
    const [ref] = collectExteriorFloorReferenceImages(esterno("autobloccanti_carrabili"));
    expect(ref.label).toMatch(/^EXTERIOR PAVING MATERIAL TARGET — masselli_autobloccanti: concrete interlocking pavers/);
    expect(ref.label.endsWith(`Copy the surface, pattern and scale; ${COLOUR_RULE}`)).toBe(true);
    expect(ref.label).not.toMatch(/black-and-white/);
  });

  it("la posa della foto si copia solo se è quella scelta: deck a doghe sfalsate → solo superficie e modulo", () => {
    const [ref] = collectExteriorFloorReferenceImages(esterno("deck_wpc"));
    expect(ref.label).toMatch(/Copy the surface and module scale only; the laying pattern and the exact colour tone come from the written specification$/);
    const parallelo = { ...(esterno("deck_wpc") as Record<string, unknown>), pattern_posa: "doga_parallela" };
    expect(collectExteriorFloorReferenceImages(parallelo)[0].label).toMatch(/Copy the surface, pattern and scale;/);
  });

  it("gres di formato standard: dalla foto (lastre grandi) si prende solo la superficie", () => {
    const [ref] = collectExteriorFloorReferenceImages({ ...DEFAULT_EXTERIOR_FLOOR_CONFIG, materiale: "gres_outdoor" });
    expect(ref.label).toMatch(/^EXTERIOR PAVING MATERIAL TARGET — gres_outdoor: /);
    expect(ref.label).toMatch(/Copy the surface texture only; module size, laying pattern/);
  });
});

describe("pavimenti esterni: la foto entra solo se la materia cambia", () => {
  const base = DEFAULT_EXTERIOR_FLOOR_CONFIG;

  it("ricolorazione, solo gradini, fascia di bordo, drenaggio → nessuna foto di pavimentazione", () => {
    for (const operazione of ["recolor_or_refinish_only", "change_steps_only", "add_border_band", "add_drainage_logic"]) {
      expect(collectExteriorFloorReferenceImages({ ...base, materiale: "masselli_autobloccanti", operazione }), operazione).toEqual([]);
    }
  });

  it("solo bordo piscina: la foto è quella del bordo, mai quella della pavimentazione", () => {
    const refs = collectExteriorFloorReferenceImages({ ...base, operazione: "change_coping_only", materiale: "masselli_autobloccanti", coping_materiale: "travertino" });
    expect(refs.map((r) => r.filename)).toEqual(["Bordo-Piscina-In-Travertino-Beige.webp"]);
    expect(refs[0].label).toMatch(/^POOL COPING MATERIAL TARGET — travertino: /);
  });

  it("ogni materiale di bordo vasca ha la sua foto", () => {
    for (const [k, e] of Object.entries(POOL_COPING_REFERENCES)) {
      const refs = collectExteriorFloorReferenceImages({ ...base, operazione: "change_coping_only", coping_materiale: k });
      expect(refs.map((r) => r.filename), k).toEqual([e.filename]);
    }
  });

  it("pavimentazione rifatta con bordo vasca: prima la superficie, poi il bordo", () => {
    const refs = collectExteriorFloorReferenceImages({
      ...base, materiale: "deck_wpc", operazione: "convert_to_deck", bordo: "coping_piscina_moderno", coping_materiale: "pietra_grigia",
    });
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["EXTERIOR PAVING MATERIAL TARGET", "POOL COPING MATERIAL TARGET"]);
  });

  it("config assente o malformata → nessuna foto, nessuna eccezione", () => {
    expect(collectExteriorFloorReferenceImages(null)).toEqual([]);
    expect(collectExteriorFloorReferenceImages({ operazione: 5, materiale: null })).toEqual([]);
  });

  it("ogni preset del form o porta una foto o il suo materiale sta in SENZA_FOTO; mai oltre il tetto", () => {
    for (const p of technicalRenderModuleSpecs["pavimenti-esterni"].presets) {
      const ricca = esterno(p.value) as { materiale: string };
      const refs = collectExteriorFloorReferenceImages(ricca);
      expect(refs.length >= 1 || Boolean(EXTERIOR_PAVING_SENZA_FOTO[ricca.materiale]), p.value).toBe(true);
      expect(refs.length).toBeLessThanOrEqual(MAX_SHARED_REFERENCES);
    }
  });
});

describe("pavimenti esterni: le scelte del form portano la loro foto", () => {
  it("bordo piscina: ogni materiale scelto nel form allega la sua foto, «non specificato» resta pietra chiara", () => {
    for (const [k, e] of Object.entries(POOL_COPING_REFERENCES)) {
      const refs = collectExteriorFloorReferenceImages(esterno("coping_piscina", { opzioni: { coping_materiale: k } }));
      expect(refs.map((r) => `${r.folder}/${r.filename}`), k).toEqual([`pools/${e.filename}`]);
      expect(refs[0].label).toMatch(new RegExp(`^POOL COPING MATERIAL TARGET — ${k}: `));
    }
    expect(collectExteriorFloorReferenceImages(esterno("coping_piscina"))[0].filename).toBe("Bordo-Piscina-In-Pietra-Beige.webp");
  });

  it("pietra a opus incertum (palladiana): la foto della pietra entra solo con quella posa", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("pietra_naturale", { opzioni: { posa: "opus_incertum" } }));
    expect(refs.map((r) => r.filename)).toEqual(["Pietra-Naturale-Intorno-Alla-Piscina.webp"]);
    expect(refs[0].label).toMatch(/^EXTERIOR PAVING MATERIAL TARGET — pietra_naturale\/opus_incertum: irregular polygonal/);
    expect(refs[0].label).toMatch(/Copy the surface, pattern and scale;/);
    expect(collectExteriorFloorReferenceImages(esterno("pietra_naturale", { opzioni: { posa: "opus" } }))).toEqual([]);
    expect(collectExteriorFloorReferenceImages(esterno("pietra_naturale", { opzioni: { posa: "a_correre" } }))).toEqual([]);
  });

  it("i tipi prima irraggiungibili: gres standard e ghiaia hanno la foto, gli altri stanno in SENZA_FOTO", () => {
    const gres = collectExteriorFloorReferenceImages(esterno("gres_outdoor_standard"));
    expect(gres.map((r) => r.filename)).toEqual(["Lastre-Outdoor-In-Gres-Effetto-Pietra.webp"]);
    expect(gres[0].label).toMatch(/Copy the surface texture only; module size/);
    const ghiaia = collectExteriorFloorReferenceImages(esterno("ghiaia_stabilizzata"));
    expect(ghiaia.map((r) => r.filename)).toEqual(["Ghiaia-Drenante-Grigio-Chiaro.webp"]);
    expect(ghiaia[0].label).toMatch(/must read compacted and stable/);
    for (const preset of ["deck_legno", "cotto_esterno", "cemento_architettonico", "cemento_drenante"]) {
      expect(collectExteriorFloorReferenceImages(esterno(preset)), preset).toEqual([]);
    }
  });

  it("posa autobloccanti a correre: la foto a spina resta, ma se ne prende solo il modulo", () => {
    const [ref] = collectExteriorFloorReferenceImages(esterno("autobloccanti_carrabili", { opzioni: { posa: "massello_classico" } }));
    expect(ref.filename).toBe("Vialetto-Residenziale-In-Autobloccanti-Grigi.webp");
    expect(ref.label).toMatch(/Copy the surface and module scale only; the laying pattern/);
  });

  it("gradini e bordo scelti nel form: la loro foto di forma segue quella della superficie", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("gres_outdoor_grande_formato", { opzioni: { gradini: "rivestito_stesso_materiale", bordo: "bordo_pietra" } }));
    expect(refs.map(percorso)).toEqual([
      "exterior/Lastre-Outdoor-In-Gres-Effetto-Pietra.webp",
      "exterior/Gradini-Esterni-Rivestiti-Stesso-Materiale-BN.webp",
      "exterior/Cordolo-In-Pietra-Pavimento-Esterno-BN.webp",
    ]);
    expect(refs.map(ruolo)).toEqual(["EXTERIOR PAVING MATERIAL TARGET", "EXTERIOR STEPS TARGET", "EXTERIOR BORDER TARGET"]);
  });
});

describe("pavimenti esterni: gradini e bordi portano la loro foto di forma", () => {
  const base = DEFAULT_EXTERIOR_FLOOR_CONFIG;
  const OPERAZIONI = [
    "replace_existing_surface", "recolor_or_refinish_only", "change_coping_only", "change_steps_only",
    "add_border_band", "add_drainage_logic", "convert_to_deck", "convert_to_gravel_or_stepping_stones",
  ];
  const AUTOBLOCCANTI = "exterior/Vialetto-Residenziale-In-Autobloccanti-Grigi.webp";

  it("ogni tipo di gradino ha la sua foto, dopo quella della superficie, con etichetta di forma", () => {
    const attese: Record<string, string> = {
      rivestito_stesso_materiale: "Gradini-Esterni-Rivestiti-Stesso-Materiale-BN.webp",
      toro_arrotondato: "Gradino-Esterno-Bordo-Toro-BN.webp",
      gradone_monolitico: "Gradoni-Esterni-Monolitici-BN.webp",
    };
    expect(Object.keys(EXTERIOR_STEP_REFERENCES).sort()).toEqual(Object.keys(attese).sort());
    for (const [gradino, file] of Object.entries(attese)) {
      const refs = collectExteriorFloorReferenceImages({ ...base, materiale: "masselli_autobloccanti", gradino });
      expect(refs.map(percorso), gradino).toEqual([AUTOBLOCCANTI, `exterior/${file}`]);
      const ref = refs[1];
      expect(ref.label).toMatch(new RegExp(`^EXTERIOR STEPS TARGET — ${gradino}: `));
      // nella foto i gradini sono tre davanti a una porta: numero e misura restano quelli della foto da modificare
      expect(ref.label).toMatch(/the number, size and position of the steps stay exactly as in the source photo/);
      expect(ref.label.endsWith(`— ${BLACK_AND_WHITE_RULE}`)).toBe(true);
      expect(ref.label).not.toMatch(COLOUR_RULE);
      expect(ref.url).toMatch(new RegExp(`/render-references/exterior/${file.replace(/\./g, "\\.")}$`));
    }
  });

  it("pedata e alzata coordinate: nessuna foto di gradino (è un abbinamento di finiture, la forma resta quella esistente)", () => {
    const refs = collectExteriorFloorReferenceImages({ ...base, gradino: "pedata_alzata_coordinate" });
    expect(refs.map(ruolo)).toEqual(["EXTERIOR PAVING MATERIAL TARGET"]);
    expect(EXTERIOR_STEP_SENZA_FOTO.pedata_alzata_coordinate).toMatch(/abbinamento di finiture/);
  });

  it("ogni tipo di bordo ha la sua foto, con etichetta di forma che non copia il tono tra bordo e campo", () => {
    const attese: Record<string, string> = {
      fascia_perimetrale: "Fascia-Perimetrale-Pavimento-Esterno-BN.webp",
      bordo_pietra: "Cordolo-In-Pietra-Pavimento-Esterno-BN.webp",
      bordo_alluminio: "Profilo-Alluminio-Bordo-Ghiaia-BN.webp",
    };
    expect(Object.keys(EXTERIOR_BORDER_REFERENCES).sort()).toEqual(Object.keys(attese).sort());
    for (const [bordo, file] of Object.entries(attese)) {
      const refs = collectExteriorFloorReferenceImages({ ...base, materiale: "masselli_autobloccanti", bordo });
      expect(refs.map(percorso), bordo).toEqual([AUTOBLOCCANTI, `exterior/${file}`]);
      const ref = refs[1];
      expect(ref.label).toMatch(new RegExp(`^EXTERIOR BORDER TARGET — ${bordo}: `));
      expect(ref.label).toMatch(/any tone difference between edge and field in the photo is not to be copied/);
      expect(ref.label.endsWith(`— ${BLACK_AND_WHITE_RULE}`)).toBe(true);
    }
    // il cordolo in masselli non ha foto
    expect(collectExteriorFloorReferenceImages({ ...base, bordo: "bordo_massello" }).map(ruolo)).toEqual(["EXTERIOR PAVING MATERIAL TARGET"]);
    expect(EXTERIOR_BORDER_SENZA_FOTO.bordo_massello).toMatch(/nessuna foto/);
  });

  it("i gradini entrano solo dove il prompt li costruisce: superficie rifatta e «solo gradini»", () => {
    const conFoto = OPERAZIONI.filter((operazione) =>
      collectExteriorFloorReferenceImages({ ...base, operazione, gradino: "toro_arrotondato", coping_materiale: "travertino" })
        .some((r) => ruolo(r) === "EXTERIOR STEPS TARGET"));
    expect(conFoto.sort()).toEqual(["change_steps_only", "convert_to_deck", "convert_to_gravel_or_stepping_stones", "replace_existing_surface"]);
    // «solo gradini» cambia solo il gradino: la foto della pavimentazione non entra, resta quella dei gradini
    const soloGradini = collectExteriorFloorReferenceImages({ ...base, operazione: "change_steps_only", gradino: "gradone_monolitico" });
    expect(soloGradini.map(percorso)).toEqual(["exterior/Gradoni-Esterni-Monolitici-BN.webp"]);
  });

  it("il bordo di perimetro entra solo dove il prompt lo costruisce: superficie rifatta e «fascia di bordo»", () => {
    const conFoto = OPERAZIONI.filter((operazione) =>
      collectExteriorFloorReferenceImages({ ...base, operazione, bordo: "fascia_perimetrale", coping_materiale: "travertino" })
        .some((r) => ruolo(r) === "EXTERIOR BORDER TARGET"));
    expect(conFoto.sort()).toEqual(["add_border_band", "convert_to_deck", "convert_to_gravel_or_stepping_stones", "replace_existing_surface"]);
    const soloFascia = collectExteriorFloorReferenceImages({ ...base, operazione: "add_border_band", bordo: "bordo_pietra" });
    expect(soloFascia.map(percorso)).toEqual(["exterior/Cordolo-In-Pietra-Pavimento-Esterno-BN.webp"]);
  });

  it("il bordo vasca non è un bordo di perimetro: porta la foto del materiale del bordo, e i gradini vengono dopo", () => {
    const refs = collectExteriorFloorReferenceImages({
      ...base, materiale: "deck_wpc", operazione: "convert_to_deck", bordo: "coping_piscina_moderno", coping_materiale: "travertino", gradino: "toro_arrotondato",
    });
    expect(refs.map(ruolo)).toEqual(["EXTERIOR PAVING MATERIAL TARGET", "POOL COPING MATERIAL TARGET", "EXTERIOR STEPS TARGET"]);
  });

  it("dal form: superficie, gradini e bordo insieme sono tre foto, nell'ordine superficie → gradini → bordo", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("deck_wpc", { opzioni: { gradini: "gradone_monolitico", bordo: "fascia_perimetrale" } }));
    expect(refs.map(percorso)).toEqual([
      "pools/Decking-WPC-Effetto-Legno-Intorno-Alla-Piscina.webp",
      "exterior/Gradoni-Esterni-Monolitici-BN.webp",
      "exterior/Fascia-Perimetrale-Pavimento-Esterno-BN.webp",
    ]);
    expect(refs).toHaveLength(MAX_SHARED_REFERENCES);
  });

  it("anche dove la superficie non ha foto (cotto, cemento) i gradini e il bordo entrano", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("cotto_esterno", { opzioni: { gradini: "toro_arrotondato", bordo: "bordo_alluminio" } }));
    expect(refs.map(percorso)).toEqual(["exterior/Gradino-Esterno-Bordo-Toro-BN.webp", "exterior/Profilo-Alluminio-Bordo-Ghiaia-BN.webp"]);
  });

  it("ghiaia con profilo in alluminio: ghiaia e profilo; i gradini non si offrono sulla ghiaia e il ponte li scarta", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("ghiaia_stabilizzata", { opzioni: { bordo: "bordo_alluminio", gradini: "toro_arrotondato" } }));
    expect(refs.map(percorso)).toEqual(["pools/Ghiaia-Drenante-Grigio-Chiaro.webp", "exterior/Profilo-Alluminio-Bordo-Ghiaia-BN.webp"]);
  });

  it("solo bordo piscina: gradini e bordo non sono scelte di quel preset, il ponte li scarta", () => {
    const refs = collectExteriorFloorReferenceImages(esterno("coping_piscina", { opzioni: { gradini: "toro_arrotondato", bordo: "bordo_pietra" } }));
    expect(refs.map(percorso)).toEqual(["pools/Bordo-Piscina-In-Pietra-Beige.webp"]);
  });

  it("tipi sconosciuti, chiavi di Object e valori non testuali → nessuna foto di gradino o bordo, nessuna eccezione", () => {
    for (const gradino of ["constructor", "__proto__", "toString", "", 7, null]) {
      for (const bordo of ["hasOwnProperty", "__proto__", "", 3, null]) {
        const refs = collectExteriorFloorReferenceImages({ ...base, gradino, bordo });
        expect(refs.map(ruolo), `${String(gradino)} / ${String(bordo)}`).toEqual(["EXTERIOR PAVING MATERIAL TARGET"]);
      }
    }
  });

  it("la foto entra se e solo se il prompt chiede quel gradino o quel bordo (replacement manifest), per ogni operazione", () => {
    // Il form dà sempre un materiale al bordo vasca: senza, il manifest di «solo bordo vasca» ripiega sulla descrizione del bordo.
    const conBordoVasca = { ...base, coping_materiale: "travertino" };
    for (const operazione of OPERAZIONI) {
      for (const gradino of Object.keys(EXTERIOR_STEP_REFERENCES)) {
        const config = { ...conBordoVasca, operazione, gradino };
        const manifest = buildExteriorFloorPrompt(config as Record<string, unknown>).normalizedConfig.replacement_manifest;
        const descrizione = EXTERIOR_STEP_DESCRIPTIONS[gradino as keyof typeof EXTERIOR_STEP_DESCRIPTIONS];
        const chiesto = [...manifest.replacements, ...manifest.additions].some((riga) => riga.includes(descrizione));
        const foto = collectExteriorFloorReferenceImages(config).some((r) => ruolo(r) === "EXTERIOR STEPS TARGET");
        expect(foto, `${operazione} / gradino ${gradino}`).toBe(chiesto);
      }
      for (const bordo of Object.keys(EXTERIOR_BORDER_REFERENCES)) {
        const config = { ...conBordoVasca, operazione, bordo };
        const manifest = buildExteriorFloorPrompt(config as Record<string, unknown>).normalizedConfig.replacement_manifest;
        const descrizione = EXTERIOR_BORDER_DESCRIPTIONS[bordo as keyof typeof EXTERIOR_BORDER_DESCRIPTIONS];
        const chiesto = [...manifest.replacements, ...manifest.additions].some((riga) => riga.includes(descrizione));
        const foto = collectExteriorFloorReferenceImages(config).some((r) => ruolo(r) === "EXTERIOR BORDER TARGET");
        expect(foto, `${operazione} / bordo ${bordo}`).toBe(chiesto);
      }
    }
  });

  it("una config di giardino letta come pavimento esterno non porta foto", () => {
    expect(collectExteriorFloorReferenceImages(giardino("moderno_minimale"))).toEqual([]);
    expect(collectExteriorFloorReferenceImages(giardino("siepe_schermante", { opzioni: { illuminazione: "segnapasso" } }))).toEqual([]);
  });
});

describe("giardino: la foto entra solo se il prompt chiede quell'elemento", () => {
  const base = DEFAULT_GARDEN_CONFIG;
  const PRESET = technicalRenderModuleSpecs.giardini.presets.map((p) => p.value);

  it("il preset sceglie la foto: siepe schermante → siepe, moderno minimale → stepping stones, gli altri nessuna", () => {
    const attese: Record<string, string | null> = {
      solo_prato: null,
      aiuole_perimetrali: null,
      siepe_schermante: "exterior/Siepe-Schermante-Sempreverde-BN.webp",
      moderno_minimale: "exterior/Camminamento-Stepping-Stones-Nel-Prato-BN.webp",
      premium_relax: null,
    };
    expect([...PRESET].sort()).toEqual(Object.keys(attese).sort());
    for (const [preset, file] of Object.entries(attese)) {
      expect(collectGardenReferenceImages(giardino(preset)).map(percorso), preset).toEqual(file ? [file] : []);
    }
  });

  it("etichette: ruolo, chiave vera della config, coda di forma; i segnapasso tengono l'orario della scena", () => {
    const [siepe] = collectGardenReferenceImages(giardino("siepe_schermante"));
    expect(siepe.label).toMatch(/^GARDEN HEDGE TARGET — schermante_media: dense evergreen hedge about 2 m tall/);
    expect(siepe.label.endsWith(`Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`)).toBe(true);
    expect(siepe.url).toMatch(/\/render-references\/exterior\/Siepe-Schermante-Sempreverde-BN\.webp$/);
    const [passi] = collectGardenReferenceImages(giardino("moderno_minimale"));
    expect(passi.label).toMatch(/^GARDEN PATH TARGET — stepping_stones: stepping-stone path/);
    expect(passi.label.endsWith(`Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`)).toBe(true);
    // lo scatto dei segnapasso è al crepuscolo: il modello non deve portare quell'atmosfera nella scena
    const [luci] = collectGardenReferenceImages(giardino("solo_prato", { opzioni: { illuminazione: "segnapasso" } }));
    expect(luci.label).toMatch(/^GARDEN LIGHTING TARGET — segnapasso: low path bollard lights/);
    expect(luci.label).toMatch(/the time of day, sky and overall light of the source photo stay unchanged/);
    expect(luci.label.endsWith(`— ${BLACK_AND_WHITE_RULE}`)).toBe(true);
  });

  it("le opzioni del form: stepping stones e segnapasso portano la loro foto, gli altri valori nessuna", () => {
    for (const preset of ["aiuole_perimetrali", "siepe_schermante", "moderno_minimale", "premium_relax"]) {
      expect(collectGardenReferenceImages(giardino(preset, { opzioni: { camminamento: "stepping_stones" } })).map(ruolo), preset).toContain("GARDEN PATH TARGET");
      for (const altro of ["pietra_naturale", "ghiaia", "betonelle", "lastre_modulari", "deck_path"]) {
        expect(collectGardenReferenceImages(giardino(preset, { opzioni: { camminamento: altro } })).map(ruolo), `${preset} / ${altro}`).not.toContain("GARDEN PATH TARGET");
      }
    }
    for (const preset of PRESET) {
      expect(collectGardenReferenceImages(giardino(preset, { opzioni: { illuminazione: "segnapasso" } })).map(ruolo), preset).toContain("GARDEN LIGHTING TARGET");
      for (const altro of ["nessuna", "uplight_vegetazione", "luce_perimetrale", "mix_soft"]) {
        expect(collectGardenReferenceImages(giardino(preset, { opzioni: { illuminazione: altro } })).map(ruolo), `${preset} / ${altro}`).not.toContain("GARDEN LIGHTING TARGET");
      }
    }
  });

  it("siepe, camminamento e segnapasso insieme sono tre foto, nell'ordine siepe → camminamento → luci", () => {
    const refs = collectGardenReferenceImages(giardino("siepe_schermante", { opzioni: { camminamento: "stepping_stones", illuminazione: "segnapasso" } }));
    expect(refs.map(percorso)).toEqual([
      "exterior/Siepe-Schermante-Sempreverde-BN.webp",
      "exterior/Camminamento-Stepping-Stones-Nel-Prato-BN.webp",
      "exterior/Segnapasso-Lungo-Vialetto-BN.webp",
    ]);
    expect(refs).toHaveLength(MAX_SHARED_REFERENCES);
  });

  it("il camminamento ha di default il tipo stepping_stones ma non è attivo: se nessuno lo chiede non entra foto", () => {
    expect(DEFAULT_GARDEN_CONFIG.camminamenti).toEqual({ attivo: false, tipo: "stepping_stones" });
    expect(collectGardenReferenceImages(DEFAULT_GARDEN_CONFIG)).toEqual([]);
    // l'intervento «aggiunta_camminamenti» basta a farlo chiedere al prompt, e allora la foto entra
    expect(collectGardenReferenceImages({ ...base, interventi: ["aggiunta_camminamenti"] }).map(ruolo)).toEqual(["GARDEN PATH TARGET"]);
  });

  it("siepe: solo la schermante di media altezza; bassa formale, naturale, alta o un'altra altezza → nessuna foto", () => {
    const siepe = (tipo: string, altezza?: string) => ({ ...base, siepi: { attivo: true, tipo, ...(altezza ? { altezza } : {}) } });
    expect(collectGardenReferenceImages(siepe("schermante_media")).map(ruolo)).toEqual(["GARDEN HEDGE TARGET"]);
    expect(collectGardenReferenceImages(siepe("schermante_media", "media")).map(ruolo)).toEqual(["GARDEN HEDGE TARGET"]);
    for (const [tipo, altezza] of [["schermante_alta", undefined], ["bassa_formale", undefined], ["naturale_morbida", undefined], ["schermante_media", "alta"], ["schermante_media", "bassa"]] as const) {
      expect(collectGardenReferenceImages(siepe(tipo, altezza)), `${tipo} / ${altezza}`).toEqual([]);
    }
    // l'intervento «aggiunta_siepi» basta a farla chiedere (come nel prompt), anche col flag spento
    expect(collectGardenReferenceImages({ ...base, interventi: ["aggiunta_siepi"] }).map(ruolo)).toEqual(["GARDEN HEDGE TARGET"]);
    // nessuna siepe chiesta → nessuna foto
    expect(collectGardenReferenceImages({ ...base, siepi: { attivo: false, tipo: "schermante_media" } })).toEqual([]);
  });

  it("il testo libero vince sul preset come nel prompt: «siepe» accende la siepe, «vialetto in pietra» toglie le stepping stones", () => {
    expect(collectGardenReferenceImages(giardino("solo_prato", { technicalDetails: "una siepe lungo il confine" })).map(ruolo)).toEqual(["GARDEN HEDGE TARGET"]);
    expect(collectGardenReferenceImages(giardino("moderno_minimale", { materialOrSystem: "vialetto in pietra naturale, largo 90cm" }))).toEqual([]);
  });

  it("ogni modulo solo le sue foto: i preset del giardino non allegano foto dei pavimenti esterni, e viceversa (anche col testo libero)", () => {
    const generico = {
      targetArea: "la zona davanti al deck di legno",
      materialOrSystem: "sistema richiesto dal cliente",
      colorAndFinish: "grigio caldo opaco",
      technicalDetails: "bordi in acciaio corten",
      preserveNotes: "casa, deck in legno, ulivo a sinistra",
      intensity: "media",
    };
    const proprie = { giardini: listGardenReferencePaths(), "pavimenti-esterni": listExteriorReferencePaths() } as const;
    for (const modulo of ["giardini", "pavimenti-esterni"] as const) {
      for (const p of technicalRenderModuleSpecs[modulo].presets) {
        for (const g of [{ ...generico, interventionPreset: p.value }, { interventionPreset: p.value }]) {
          for (const r of collectTechnicalReferenceImages(modulo, bridgeTechnicalConfig(modulo, g))) {
            expect(proprie[modulo], `${modulo}/${p.value}: ${percorso(r)}`).toContain(percorso(r));
          }
        }
      }
    }
  });

  it("config assente o malformata → nessuna foto, nessuna eccezione; una config di porta o di pavimento non porta foto di giardino", () => {
    for (const raw of [null, undefined, {}, "giardino", 5]) expect(collectGardenReferenceImages(raw)).toEqual([]);
    expect(collectGardenReferenceImages({ siepi: 5, camminamenti: "x", illuminazione: 3, interventi: "aggiunta_siepi" })).toEqual([]);
    expect(collectGardenReferenceImages({ siepi: { attivo: true, tipo: "constructor" }, camminamenti: { attivo: true, tipo: "__proto__" }, illuminazione: "toString" })).toEqual([]);
    expect(collectGardenReferenceImages(bridgeTechnicalConfig("porte-interne", { interventionPreset: "battente_liscia" }))).toEqual([]);
    expect(collectGardenReferenceImages(esterno("gres_outdoor_grande_formato", { opzioni: { gradini: "toro_arrotondato" } }))).toEqual([]);
  });

  it("la foto entra se e solo se il prompt la chiede: siepe, percorso e luci coincidono con «Hedges active», «Path active» e «Lighting»", () => {
    const valori = (chiave: string) => OPZIONI_TECNICHE.giardini.find((o) => o.chiave === chiave)!.valori.map((v) => v.value);
    for (const preset of PRESET) {
      for (const camminamento of [undefined, ...valori("camminamento")]) {
        for (const illuminazione of [undefined, ...valori("illuminazione")]) {
          const opzioni = { ...(camminamento ? { camminamento } : {}), ...(illuminazione ? { illuminazione } : {}) };
          const config = giardino(preset, { opzioni });
          const prompt = buildGardenPrompt(config).userPrompt;
          const ricca = config as unknown as typeof DEFAULT_GARDEN_CONFIG;
          const ruoli = collectGardenReferenceImages(config).map(ruolo);
          const id = `${preset} / ${camminamento ?? "-"} / ${illuminazione ?? "-"}`;
          expect(ruoli.includes("GARDEN HEDGE TARGET"), id).toBe(prompt.includes("Hedges active: true") && ricca.siepi.tipo === "schermante_media");
          expect(ruoli.includes("GARDEN PATH TARGET"), id).toBe(prompt.includes("Path active: true") && ricca.camminamenti.tipo === "stepping_stones");
          expect(ruoli.includes("GARDEN LIGHTING TARGET"), id).toBe(prompt.includes(`Lighting: ${LIGHTING_DESCRIPTIONS.segnapasso}`));
        }
      }
    }
  });
});

describe("miniature del form di pavimenti esterni e giardino: la stessa foto che va al modello", () => {
  const perPreset: Record<string, string | null> = {
    gres_outdoor_grande_formato: "exterior/Lastre-Outdoor-In-Gres-Effetto-Pietra.webp",
    gres_outdoor_standard: "exterior/Lastre-Outdoor-In-Gres-Effetto-Pietra.webp",
    pietra_naturale: null,
    autobloccanti_carrabili: "exterior/Vialetto-Residenziale-In-Autobloccanti-Grigi.webp",
    cotto_esterno: null,
    cemento_architettonico: null,
    cemento_drenante: null,
    ghiaia_stabilizzata: "pools/Ghiaia-Drenante-Grigio-Chiaro.webp",
    deck_wpc: "pools/Decking-WPC-Effetto-Legno-Intorno-Alla-Piscina.webp",
    deck_legno: null,
    coping_piscina: "pools/Bordo-Piscina-In-Pietra-Beige.webp",
  };

  it("ogni preset dei pavimenti esterni ha in tabella la sua miniatura (o nessuna)", () => {
    expect(technicalRenderModuleSpecs["pavimenti-esterni"].presets.map((p) => p.value).sort()).toEqual(Object.keys(perPreset).sort());
    for (const [preset, file] of Object.entries(perPreset)) {
      const foto = fotoDelPreset("pavimenti-esterni", preset);
      expect(foto ? `${foto.folder}/${foto.filename}` : null, preset).toBe(file);
    }
  });

  it("ogni valore di opzione con miniatura mostra una foto che il motore allega davvero con quel valore", () => {
    const conFoto: string[] = [];
    for (const p of technicalRenderModuleSpecs["pavimenti-esterni"].presets) {
      for (const o of OPZIONI_TECNICHE["pavimenti-esterni"]) {
        for (const v of valoriApplicabili(o, p.value)) {
          const foto = fotoDellOpzione("pavimenti-esterni", p.value, o.chiave, v.value);
          if (!foto) continue;
          conFoto.push(`${p.value}/${o.chiave}=${v.value}`);
          const motore = collectTechnicalReferenceImages("pavimenti-esterni", esterno(p.value, { opzioni: { [o.chiave]: v.value } }));
          expect(motore.map((r) => `${r.folder}/${r.filename}`), `${p.value}/${o.chiave}=${v.value}`).toContain(`${foto.folder}/${foto.filename}`);
        }
      }
    }
    const per = (chiave: string) => conFoto.filter((x) => x.includes(`/${chiave}=`)).sort();
    const preset = (chiave: string) => OPZIONI_TECNICHE["pavimenti-esterni"].find((o) => o.chiave === chiave)!.preset!;
    // i 6 materiali del bordo vasca e la palladiana; le altre pose riusano la foto del materiale e non hanno miniatura propria
    expect(per("coping_materiale")).toEqual([
      "coping_piscina/coping_materiale=cemento_spazzolato",
      "coping_piscina/coping_materiale=gres_2cm",
      "coping_piscina/coping_materiale=legno_wpc",
      "coping_piscina/coping_materiale=pietra_chiara",
      "coping_piscina/coping_materiale=pietra_grigia",
      "coping_piscina/coping_materiale=travertino",
    ]);
    expect(per("posa")).toEqual(["pietra_naturale/posa=opus_incertum"]);
    // i 3 gradini e i 3 bordi con foto, in ognuno dei preset che offre l'opzione; pedata coordinata e cordolo in masselli no
    expect(per("gradini")).toEqual(preset("gradini").flatMap((p) => Object.keys(EXTERIOR_STEP_REFERENCES).map((k) => `${p}/gradini=${k}`)).sort());
    expect(per("bordo")).toEqual(preset("bordo").flatMap((p) => Object.keys(EXTERIOR_BORDER_REFERENCES).map((k) => `${p}/bordo=${k}`)).sort());
    expect(conFoto).toHaveLength(6 + 1 + per("gradini").length + per("bordo").length);
    expect(fotoDellOpzione("pavimenti-esterni", "coping_piscina", "coping_materiale", "travertino")?.filename).toBe("Bordo-Piscina-In-Travertino-Beige.webp");
    expect(fotoDellOpzione("pavimenti-esterni", "deck_wpc", "gradini", "toro_arrotondato")?.filename).toBe("Gradino-Esterno-Bordo-Toro-BN.webp");
    expect(fotoDellOpzione("pavimenti-esterni", "ghiaia_stabilizzata", "bordo", "bordo_alluminio")?.filename).toBe("Profilo-Alluminio-Bordo-Ghiaia-BN.webp");
    expect(fotoDellOpzione("pavimenti-esterni", "deck_wpc", "gradini", "pedata_alzata_coordinate")).toBeNull();
    expect(fotoDellOpzione("pavimenti-esterni", "deck_wpc", "bordo", "bordo_massello")).toBeNull();
  });

  it("giardino: la miniatura è la foto che il motore allega per quel preset o per quel valore", () => {
    const perPresetGiardino: Record<string, string | null> = {
      solo_prato: null,
      aiuole_perimetrali: null,
      siepe_schermante: "exterior/Siepe-Schermante-Sempreverde-BN.webp",
      moderno_minimale: "exterior/Camminamento-Stepping-Stones-Nel-Prato-BN.webp",
      premium_relax: null,
    };
    expect(technicalRenderModuleSpecs.giardini.presets.map((p) => p.value).sort()).toEqual(Object.keys(perPresetGiardino).sort());
    for (const [preset, file] of Object.entries(perPresetGiardino)) {
      const foto = fotoDelPreset("giardini", preset);
      expect(foto ? percorso(foto) : null, preset).toBe(file);
    }
    const conFoto: string[] = [];
    for (const p of technicalRenderModuleSpecs.giardini.presets) {
      for (const o of OPZIONI_TECNICHE.giardini) {
        for (const v of valoriApplicabili(o, p.value)) {
          const foto = fotoDellOpzione("giardini", p.value, o.chiave, v.value);
          if (!foto) continue;
          conFoto.push(`${p.value}/${o.chiave}=${v.value}`);
          const motore = collectTechnicalReferenceImages("giardini", giardino(p.value, { opzioni: { [o.chiave]: v.value } }));
          expect(motore.map(percorso), `${p.value}/${o.chiave}=${v.value}`).toContain(percorso(foto));
        }
      }
    }
    // stepping stones nei 4 preset che offrono il camminamento, segnapasso in tutti e 5; stile, prato, copertura e alberi non hanno foto
    expect(conFoto.sort()).toEqual([
      ...["aiuole_perimetrali", "moderno_minimale", "premium_relax", "siepe_schermante"].map((p) => `${p}/camminamento=stepping_stones`),
      ...["aiuole_perimetrali", "moderno_minimale", "premium_relax", "siepe_schermante", "solo_prato"].map((p) => `${p}/illuminazione=segnapasso`),
    ].sort());
    expect(fotoDelPreset("ristrutturazioni", "outdoor_completo")).toBeNull();
  });
});
