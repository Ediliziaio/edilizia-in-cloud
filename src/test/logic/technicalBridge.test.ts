import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bridgeTechnicalConfig } from "../../../shared/render-technical/bridge";
import { collectTechnicalReferenceImages } from "../../../shared/render-technical/referenceImages";
import { listDoorReferencePaths } from "../../../shared/render-references/doorReferences";
import { listExteriorReferencePaths, listGardenReferencePaths } from "../../../shared/render-references/exteriorReferences";
import { buildGardenPrompt } from "../../../shared/render-garden/gardenPromptBuilder";
import { buildExteriorFloorPrompt } from "../../../shared/render-exterior-floor/exteriorFloorPromptBuilder";
import { buildInteriorDoorPrompt } from "../../../shared/render-interior-door/interiorDoorPromptBuilder";
import { buildSecurityDoorPrompt } from "../../../shared/render-security-door/securityDoorPromptBuilder";
import {
  applicaSceltaTecnica,
  cambiaOpzioneTecnica,
  technicalRenderModuleSpecs,
  testoPredefinito,
} from "@/lib/render/technicalRenderModules";
import { OPZIONI_TECNICHE, leggiOpzione, valoriApplicabili } from "../../../shared/render-technical/opzioni";

/**
 * Il ponte generico->ricco deve produrre, per OGNI preset di OGNI modulo, una
 * configurazione che la libreria di prompt giudica valida. Non e' pignoleria:
 * l'edge tecnica abortisce il render quando `validation.is_valid` e' falso,
 * quindi un preset che produce una config invalida e' un modulo che non
 * funziona per quel preset — e nessuno se ne accorgerebbe fino al primo
 * cliente.
 * Verifica anche che il testo libero dell'utente arrivi nel prompt: l'audit
 * ha trovato due campi raccolti dal form e mai letti (persiane, pergole); qui
 * ci si assicura che non succeda per i moduli tecnici.
 */
const builders = {
  giardini: buildGardenPrompt,
  "pavimenti-esterni": buildExteriorFloorPrompt,
  "porte-interne": buildInteriorDoorPrompt,
  "porte-blindate": buildSecurityDoorPrompt,
} as const;

const generico = {
  targetArea: "la zona davanti al deck di legno",
  materialOrSystem: "sistema richiesto dal cliente",
  colorAndFinish: "grigio caldo opaco",
  technicalDetails: "bordi in acciaio corten",
  preserveNotes: "casa, deck in legno, ulivo a sinistra",
  intensity: "media",
};

describe("ponte config generica -> librerie di prompt dei moduli tecnici", () => {
  for (const modulo of Object.keys(builders) as Array<keyof typeof builders>) {
    const presets = technicalRenderModuleSpecs[modulo].presets.map((p) => p.value);

    it(`${modulo}: ha preset da coprire`, () => {
      expect(presets.length).toBeGreaterThan(0);
    });

    for (const preset of presets) {
      it(`${modulo} / ${preset}: config valida e testo libero nel prompt`, () => {
        const ricca = bridgeTechnicalConfig(modulo, { ...generico, interventionPreset: preset });
        const built = builders[modulo](ricca as Record<string, unknown>);
        expect(built.validation.isValid, JSON.stringify(built.validation)).toBe(true);
        const prompt = `${built.systemPrompt}\n${built.userPrompt}`;
        expect(prompt).toContain("ulivo a sinistra");
        expect(prompt).toContain("corten");
      });
    }
  }
});

/**
 * Una sola edge serve cinque moduli: ogni modulo deve leggere SOLO le proprie foto.
 * Una porta nel render di un giardino (o un deck nel render di una porta) spingerebbe
 * il modello a costruire nella scena proprio quella cosa.
 */
describe("foto condivise dei moduli tecnici: ogni modulo solo le sue", () => {
  const ammesse: Record<string, string[]> = {
    "porte-interne": listDoorReferencePaths().filter((p) => p.startsWith("doors/Porta-Interna") || p.startsWith("doors/Porta-Scorrevole") || p.startsWith("doors/Porta-Rasomuro")),
    "porte-blindate": listDoorReferencePaths().filter((p) => p.startsWith("doors/Porta-Blindata")),
    "pavimenti-esterni": listExteriorReferencePaths(),
    giardini: listGardenReferencePaths(),
    ristrutturazioni: [],
  };

  for (const modulo of Object.keys(ammesse)) {
    it(`${modulo}: per ogni preset, solo foto della propria libreria`, () => {
      const presets = technicalRenderModuleSpecs[modulo as keyof typeof technicalRenderModuleSpecs].presets.map((p) => p.value);
      for (const preset of presets) {
        for (const g of [{ ...generico, interventionPreset: preset }, { interventionPreset: preset }]) {
          const ricca = modulo === "ristrutturazioni" ? null : bridgeTechnicalConfig(modulo as keyof typeof builders, g);
          const refs = collectTechnicalReferenceImages(modulo, ricca);
          for (const r of refs) expect(ammesse[modulo], `${modulo}/${preset}: ${r.folder}/${r.filename}`).toContain(`${r.folder}/${r.filename}`);
        }
      }
    });
  }

  it("le porte interne non usano mai le foto delle blindate e viceversa (le tabelle non si sovrappongono)", () => {
    const interne = new Set(ammesse["porte-interne"]);
    expect(ammesse["porte-blindate"].filter((p) => interne.has(p))).toEqual([]);
    expect(ammesse["porte-interne"].length + ammesse["porte-blindate"].length).toBe(listDoorReferencePaths().length);
  });

  it("modulo sconosciuto, ristrutturazioni o config assente → nessuna foto", () => {
    const porta = bridgeTechnicalConfig("porte-interne", { interventionPreset: "battente_liscia" });
    expect(collectTechnicalReferenceImages("ristrutturazioni", porta)).toEqual([]);
    expect(collectTechnicalReferenceImages("boh", porta)).toEqual([]);
    expect(collectTechnicalReferenceImages("porte-interne", null)).toEqual([]);
    // Lo stesso preset di porta letto come giardino o come pavimento esterno: nessuna foto di porta.
    expect(collectTechnicalReferenceImages("giardini", porta)).toEqual([]);
    expect(collectTechnicalReferenceImages("pavimenti-esterni", porta)).toEqual([]);
  });
});

describe("generate-technical-render: foto condivise dopo il catalogo, numerate come le immagini vere", () => {
  const src = readFileSync(join(process.cwd(), "supabase", "functions", "generate-technical-render", "index.ts"), "utf8");

  it("le foto si scelgono dalla config ricca da cui nasce il prompt, per modulo", () => {
    expect(src).toMatch(/collectTechnicalReferenceImages\(moduleType, costruito\.configRicca\)/);
    expect(src).toMatch(/configRicca: \(built\.normalizedConfig\.legacy_config \?\? null\)/);
  });

  it("riempiono solo gli slot lasciati liberi dal catalogo (4 immagini in tutto)", () => {
    expect(src).toMatch(/const slotLiberi = 4 - catalogReferences\.length;/);
    expect(src).toMatch(/refsCondivise\.slice\(0, slotLiberi\)/);
    // il catalogo si carica PRIMA delle condivise
    expect(src.indexOf("loadCatalogReferences({")).toBeLessThan(src.indexOf("collectTechnicalReferenceImages(moduleType"));
  });

  it("la legenda parte da 2 + le foto del catalogo, contate PRIMA di concatenare", () => {
    expect(src).toMatch(/const primaCondivisa = 2 \+ catalogReferences\.length;/);
    expect(src).toMatch(/buildSharedReferenceLegend\(fetched\.references, primaCondivisa\)/);
    expect(src.indexOf("const primaCondivisa")).toBeLessThan(src.indexOf("catalogReferences = [...catalogReferences, ...fetched.references]"));
    expect(src).toMatch(/if \(fetched\.references\.length > 0\) \{[\s\S]{0,400}buildSharedReferenceLegend\(fetched\.references/);
  });

  it("la legenda si accoda dopo la riscrittura in prosa e prima del primo tentativo", () => {
    const riscrittura = src.indexOf("rewriteDomainPrompt(");
    const legenda = src.indexOf("buildSharedReferenceLegend(fetched.references");
    const primoTentativo = src.indexOf("providerResult = await generateCandidate(finalPrompt, true)");
    expect(riscrittura).toBeGreaterThan(-1);
    expect(riscrittura).toBeLessThan(legenda);
    expect(legenda).toBeLessThan(primoTentativo);
  });

  it("anche il secondo tentativo (QA) riceve le stesse immagini citate dalla legenda", () => {
    // generateCandidate legge catalogReferences al momento della chiamata, e il retry passa da lì.
    const generate = src.slice(src.indexOf("const generateCandidate"), src.indexOf("const generateCandidate") + 1200);
    expect(generate).toMatch(/referenceImages: catalogReferences\.length > 0 \? catalogReferences : undefined/);
    const retry = src.slice(src.indexOf("qa_failed_retry_corrective"), src.indexOf("[QC FAILURE"));
    expect(retry).toMatch(/providerResult = await generateCandidate\(`\$\{finalPrompt\}/);
  });
});

/**
 * Scelte strutturate oltre al preset (shared/render-technical/opzioni.ts). Regole:
 * assenti o non ammesse = prompt identico a prima; ogni valore arriva al prompt col suo
 * frammento; nessuna combinazione rende invalido il prompt (l'edge abortirebbe il render).
 */
function promptDi(modulo: keyof typeof builders, g: Record<string, unknown>) {
  const built = builders[modulo](bridgeTechnicalConfig(modulo, g) as Record<string, unknown>);
  return { built, testo: `${built.systemPrompt}\n${built.userPrompt}` };
}

describe("opzioni dei moduli tecnici: compatibilità con le sessioni salvate", () => {
  for (const modulo of Object.keys(builders) as Array<keyof typeof builders>) {
    it(`${modulo}: opzioni assenti, vuote, sconosciute o di un altro preset → stesso prompt`, () => {
      for (const p of technicalRenderModuleSpecs[modulo].presets) {
        const g = { ...generico, interventionPreset: p.value };
        const prima = promptDi(modulo, g).testo;
        expect(promptDi(modulo, { ...g, opzioni: {} }).testo, p.value).toBe(prima);
        expect(promptDi(modulo, { ...g, opzioni: null }).testo, p.value).toBe(prima);
        expect(promptDi(modulo, { ...g, opzioni: ["x"] }).testo, p.value).toBe(prima);
        expect(promptDi(modulo, { ...g, opzioni: { inventata: "x", finitura_anta: "oro_zecchino", posa: 3 } }).testo, p.value).toBe(prima);
        // un'opzione che questo preset non prevede (rimasta nella config dall'API) non entra
        const altrove = OPZIONI_TECNICHE[modulo].find((o) => valoriApplicabili(o, p.value).length === 0 && o.valori.length > 0);
        if (altrove) expect(promptDi(modulo, { ...g, opzioni: { [altrove.chiave]: altrove.valori[0].value } }).testo, `${p.value}/${altrove.chiave}`).toBe(prima);
      }
    });
  }

  it("leggiOpzione accetta solo valori ammessi per il preset", () => {
    expect(leggiOpzione({ interventionPreset: "coping_piscina", opzioni: { coping_materiale: "travertino" } }, "pavimenti-esterni", "coping_materiale")).toBe("travertino");
    expect(leggiOpzione({ interventionPreset: "deck_wpc", opzioni: { coping_materiale: "travertino" } }, "pavimenti-esterni", "coping_materiale")).toBeUndefined();
    expect(leggiOpzione({ interventionPreset: "deck_wpc", opzioni: { posa: "diagonale" } }, "pavimenti-esterni", "posa")).toBeUndefined();
    expect(leggiOpzione({ interventionPreset: "deck_wpc", opzioni: { posa: "doga_parallela" } }, "pavimenti-esterni", "posa")).toBe("doga_parallela");
    expect(leggiOpzione({ interventionPreset: "vetrata_satinata", opzioni: { finitura_anta: "laminato" } }, "porte-interne", "finitura_anta")).toBeUndefined();
  });
});

describe("opzioni dei moduli tecnici: ogni scelta arriva al prompt e lo lascia valido", () => {
  for (const modulo of Object.keys(builders) as Array<keyof typeof builders>) {
    it(`${modulo}: ogni preset × ogni valore di ogni opzione → prompt valido, testo libero intatto`, () => {
      for (const p of technicalRenderModuleSpecs[modulo].presets) {
        const tutte: Record<string, string> = {};
        for (const o of OPZIONI_TECNICHE[modulo]) {
          const valori = valoriApplicabili(o, p.value);
          for (const v of valori) {
            const { built, testo } = promptDi(modulo, { ...generico, interventionPreset: p.value, opzioni: { [o.chiave]: v.value } });
            expect(built.validation.isValid, `${p.value}/${o.chiave}=${v.value}: ${JSON.stringify(built.validation)}`).toBe(true);
            expect(testo).toContain("ulivo a sinistra");
          }
          if (valori.length) tutte[o.chiave] = valori[valori.length - 1].value;
        }
        // tutte le opzioni insieme
        const { built } = promptDi(modulo, { ...generico, interventionPreset: p.value, opzioni: tutte });
        expect(built.validation.isValid, `${p.value} tutte: ${JSON.stringify(built.validation)}`).toBe(true);
      }
    });
  }

  const casi: Array<[keyof typeof builders, string, Record<string, string>, RegExp[]]> = [
    ["porte-interne", "battente_liscia", { finitura_anta: "effetto_legno_scuro" }, [/Finish: dark wood-effect finish with believable depth/]],
    ["porte-interne", "vetrata_satinata", { vetro: "trasparente" }, [/clear glass with realistic reflections/, /glass type trasparente, privacy basso/]],
    ["porte-interne", "vetrata_satinata", { vetro: "fume" }, [/smoked glass with controlled transparency/, /glass type fume/]],
    ["porte-interne", "rasomuro", { maniglia: "ottone" }, [/finish ottone; correctly scaled and mounted/]],
    ["porte-interne", "battente_classica", {}, [/classic hinged interior door with balanced pantographed paneling/, /classic casing\/coprifiilo/, /finish ottone/]],
    ["porte-interne", "a_libro", {}, [/folding interior door/, /folding\/book mechanism: visible fold line/]],
    ["porte-interne", "doppia_anta", {}, [/double-leaf interior door with coherent central split/, /double-leaf width plausibility mandatory/]],
    ["porte-interne", "tutta_altezza", {}, [/full-height interior door/, /full-height ceiling relation mandatory/, /anta a tutta altezza fino al soffitto visibile/]],
    ["porte-blindate", "moderna_liscia", { lato_foto: "pianerottolo" }, [/Visible side is EXTERIOR/, /condominium landing with visible apartment entrance door/, /Exterior reference: smooth matte slab finish[^.]*, grigio caldo opaco/]],
    ["porte-blindate", "moderna_liscia", { lato_foto: "esterno_villa" }, [/Visible side is EXTERIOR/, /ingresso_villa - covered or semi-covered villa entrance context/]],
    ["porte-blindate", "solo_finitura", { finitura_pannello: "laccato" }, [/Recolor\/refinish only the visible door panel as lacquered finish/, /Internal reference: lacquered finish[^.]*, grigio caldo opaco/]],
    ["porte-blindate", "rasomuro", { maniglia: "cromo" }, [/finish cromo; position standard/]],
    ["pavimenti-esterni", "coping_piscina", { coping_materiale: "travertino" }, [/change only pool coping\/border to travertino; preserve pool basin/]],
    ["pavimenti-esterni", "gres_outdoor_grande_formato", { posa: "diagonale" }, [/Pattern: diagonal laying pattern/]],
    ["pavimenti-esterni", "pietra_naturale", { posa: "opus_incertum" }, [/irregular polygonal natural stone flagging \(opus incertum/]],
    ["pavimenti-esterni", "deck_wpc", { gradini: "rivestito_stesso_materiale" }, [/also clad the visible exterior steps: steps clad with the same selected material/, /Step type: rivestito_stesso_materiale/]],
    ["pavimenti-esterni", "autobloccanti_carrabili", { bordo: "bordo_pietra" }, [/finish the new surface with a border\/perimeter band: stone border with visible thickness/]],
    ["pavimenti-esterni", "gres_outdoor_standard", {}, [/Flooring type: gres_outdoor/, /Format \/ scale: 60x60/]],
    ["pavimenti-esterni", "ghiaia_stabilizzata", {}, [/stabilized gravel surface/, /continuous cast or compacted surface with no modular laying grid/, /Joint width: coherent with selected outdoor system/]],
    ["pavimenti-esterni", "deck_legno", {}, [/natural exterior timber deck boards/, /convert target surface to exterior deck/]],
    ["pavimenti-esterni", "cotto_esterno", {}, [/outdoor terracotta\/cotto paving/]],
    ["pavimenti-esterni", "cemento_architettonico", {}, [/architectural concrete paving/, /continuous-looking systems must eliminate old grout/]],
    ["pavimenti-esterni", "cemento_drenante", {}, [/draining washed\/permeable concrete/]],
    ["giardini", "solo_prato", { stile: "mediterraneo", prato: "sintetico_premium" }, [/Mediterranean garden/, /premium synthetic turf only if selected/]],
    ["giardini", "aiuole_perimetrali", { camminamento: "ghiaia" }, [/Path active: true/, /gravel path with compacted edge/, /aggiunta_camminamenti/]],
    ["giardini", "premium_relax", { illuminazione: "nessuna" }, [/Lighting: do not add garden lights/]],
    ["giardini", "siepe_schermante", { illuminazione: "segnapasso", alberi: "2" }, [/subtle path marker lights/, /Add 2 ornamental tree\(s\)/, /Trees active: true/]],
    ["giardini", "moderno_minimale", { copertura_aiuole: "corteccia" }, [/Ground cover active: true/, /bark mulch ground cover/]],
  ];

  for (const [modulo, preset, opzioni, attesi] of casi) {
    it(`${modulo} / ${preset} ${JSON.stringify(opzioni)}`, () => {
      const { built, testo } = promptDi(modulo, { ...generico, interventionPreset: preset, opzioni });
      expect(built.validation.isValid, JSON.stringify(built.validation)).toBe(true);
      for (const re of attesi) expect(testo).toMatch(re);
    });
  }

  it("giardino: «solo prato» non offre camminamenti né alberi (resterebbe «solo prato» solo di nome)", () => {
    const camminamento = OPZIONI_TECNICHE.giardini.find((o) => o.chiave === "camminamento")!;
    const alberi = OPZIONI_TECNICHE.giardini.find((o) => o.chiave === "alberi")!;
    expect(valoriApplicabili(camminamento, "solo_prato")).toEqual([]);
    expect(valoriApplicabili(alberi, "solo_prato")).toEqual([]);
    const { testo } = promptDi("giardini", { interventionPreset: "solo_prato", opzioni: { camminamento: "ghiaia", alberi: "2" } });
    expect(testo).toMatch(/Path active: false/);
    expect(testo).toMatch(/Trees active: false/);
  });
});

/**
 * Il form teneva i testi del preset predefinito anche cambiando preset: una «Battente
 * liscia» partiva con «Porta richiesta: porta interna rasomuro laccata» nelle note, una
 * blindata «solo finitura» con «rimuovi ogni residuo della vecchia porta». I testi non
 * toccati ora seguono le scelte; quelli scritti a mano restano.
 */
describe("form dei moduli tecnici: i testi non toccati seguono preset e opzioni", () => {
  for (const modulo of Object.keys(technicalRenderModuleSpecs) as Array<keyof typeof technicalRenderModuleSpecs>) {
    const spec = technicalRenderModuleSpecs[modulo];
    it(`${modulo}: il default è coerente con il suo preset`, () => {
      for (const campo of ["targetArea", "materialOrSystem", "colorAndFinish", "technicalDetails"] as const) {
        expect(spec.defaultConfig[campo], campo).toBe(testoPredefinito(spec, spec.defaultConfig, campo));
      }
      expect(spec.presets.some((p) => p.value === spec.defaultConfig.interventionPreset)).toBe(true);
    });
  }

  it("porte interne: cambiando preset il testo «porta richiesta» segue; tornando indietro torna quello di prima", () => {
    const spec = technicalRenderModuleSpecs["porte-interne"];
    const battente = applicaSceltaTecnica(spec, spec.defaultConfig, { interventionPreset: "battente_liscia" });
    expect(battente.materialOrSystem).toBe("porta interna battente liscia con coprifili");
    expect(battente.colorAndFinish).toBe(spec.defaultConfig.colorAndFinish);
    const indietro = applicaSceltaTecnica(spec, battente, { interventionPreset: "rasomuro" });
    expect(indietro.materialOrSystem).toBe(spec.defaultConfig.materialOrSystem);
    const { testo } = promptDi("porte-interne", battente as unknown as Record<string, unknown>);
    expect(testo).toContain("Porta richiesta: porta interna battente liscia con coprifili");
    expect(testo).not.toContain("rasomuro laccata");
  });

  it("un testo scritto a mano non si tocca", () => {
    const spec = technicalRenderModuleSpecs["porte-interne"];
    const scritto = { ...spec.defaultConfig, materialOrSystem: "porta del cliente, modello Alfa" };
    expect(applicaSceltaTecnica(spec, scritto, { interventionPreset: "battente_liscia" }).materialOrSystem).toBe("porta del cliente, modello Alfa");
  });

  it("blindata «solo finitura»: niente più «rimuovi la vecchia porta» nei dettagli tecnici", () => {
    const spec = technicalRenderModuleSpecs["porte-blindate"];
    const finitura = applicaSceltaTecnica(spec, spec.defaultConfig, { interventionPreset: "solo_finitura" });
    expect(finitura.technicalDetails).not.toMatch(/vecchia porta/);
    const { testo } = promptDi("porte-blindate", finitura as unknown as Record<string, unknown>);
    expect(testo).not.toMatch(/rimuovi ogni residuo della vecchia porta/);
    expect(testo).toMatch(/Finish-only mode/);
  });

  it("per ogni preset il prompt di partenza non cita il materiale del preset predefinito (se diverso)", () => {
    for (const modulo of Object.keys(builders) as Array<keyof typeof builders>) {
      const spec = technicalRenderModuleSpecs[modulo];
      for (const p of spec.presets) {
        if (p.value === spec.defaultConfig.interventionPreset || !p.testi?.materialOrSystem) continue;
        const cfg = applicaSceltaTecnica(spec, spec.defaultConfig, { interventionPreset: p.value });
        const { built, testo } = promptDi(modulo, cfg as unknown as Record<string, unknown>);
        expect(built.validation.isValid, `${modulo}/${p.value}`).toBe(true);
        expect(testo, `${modulo}/${p.value}`).not.toContain(spec.defaultConfig.materialOrSystem);
        expect(testo, `${modulo}/${p.value}`).toContain(p.testi.materialOrSystem);
      }
    }
  });

  it("un'opzione con un suo testo lo porta nel colore se il colore non è stato toccato", () => {
    const spec = technicalRenderModuleSpecs["porte-interne"];
    const legno = cambiaOpzioneTecnica(spec, spec.defaultConfig, "finitura_anta", "effetto_legno_scuro");
    expect(legno.opzioni).toEqual({ finitura_anta: "effetto_legno_scuro" });
    expect(legno.colorAndFinish).toBe("noce scuro");
    const tolta = cambiaOpzioneTecnica(spec, legno, "finitura_anta", null);
    expect(tolta.opzioni).toBeUndefined();
    expect(tolta.colorAndFinish).toBe(spec.defaultConfig.colorAndFinish);
    const scritto = cambiaOpzioneTecnica(spec, { ...spec.defaultConfig, colorAndFinish: "rosso pompeiano" }, "finitura_anta", "laccato_colorato");
    expect(scritto.colorAndFinish).toBe("rosso pompeiano");
  });

  it("cambiando preset le opzioni che il nuovo preset non prevede si scartano", () => {
    const spec = technicalRenderModuleSpecs["pavimenti-esterni"];
    const coping = cambiaOpzioneTecnica(spec, applicaSceltaTecnica(spec, spec.defaultConfig, { interventionPreset: "coping_piscina" }), "coping_materiale", "travertino");
    expect(coping.opzioni).toEqual({ coping_materiale: "travertino" });
    const deck = applicaSceltaTecnica(spec, cambiaOpzioneTecnica(spec, coping, "gradini", "rivestito_stesso_materiale"), { interventionPreset: "deck_wpc" });
    expect(deck.opzioni).toBeUndefined();
    const conPosa = cambiaOpzioneTecnica(spec, applicaSceltaTecnica(spec, spec.defaultConfig, { interventionPreset: "deck_wpc" }), "posa", "doga_parallela");
    expect(applicaSceltaTecnica(spec, conPosa, { interventionPreset: "deck_legno" }).opzioni).toEqual({ posa: "doga_parallela" });
    expect(applicaSceltaTecnica(spec, conPosa, { interventionPreset: "autobloccanti_carrabili" }).opzioni).toBeUndefined();
  });
});

describe("form dei moduli tecnici: le miniature vengono dal motore", () => {
  const pagina = readFileSync(join(process.cwd(), "src", "pages", "azienda", "RenderTechnicalModuleNew.tsx"), "utf8");

  it("preset e opzioni mostrano la foto che il motore allega (fotoDelPreset / fotoDellOpzione), con alt", () => {
    expect(pagina).toMatch(/spec\.presets\.map\(\(p\) => \[p\.value, fotoDelPreset\(spec\.id, p\.value\)\]\)/);
    expect(pagina).toMatch(/<RigaConFoto foto=\{fotoPreset\[preset\.value\] \?\? null\} label=\{preset\.label\} \/>/);
    expect(pagina).toMatch(/<RigaConFoto foto=\{fotoDellOpzione\(spec\.id, config\.interventionPreset, opzione\.chiave, v\.value\)\} label=\{v\.label\} \/>/);
    expect(pagina).toMatch(/<ReferenceThumb photo=\{foto\} alt=\{`Esempio: \$\{label\}`\} \/>/);
  });

  it("il campo chiuso mostra solo il testo: l'immagine resta nella lista", () => {
    expect(pagina).toMatch(/<SelectValue>\{presetCorrente\?\.label \?\? config\.interventionPreset\}<\/SelectValue>/);
    expect(pagina).toMatch(/<SelectValue>\{scelto\?\.label \?\? opzione\.nonSpecificato\}<\/SelectValue>/);
  });

  it("cambiare preset o opzione passa dalle funzioni che tengono coerenti i testi", () => {
    expect(pagina).toMatch(/setConfig\(\(prev\) => applicaSceltaTecnica\(spec, prev, \{ interventionPreset: value \}\)\)/);
    expect(pagina).toMatch(/setConfig\(\(prev\) => cambiaOpzioneTecnica\(spec, prev, chiave, valore\)\)/);
    expect(pagina).not.toMatch(/\(\{ \.\.\.prev, interventionPreset: value \}\)/);
  });
});
