import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHUTTER_FOLDER,
  collectShutterReferenceImages,
  listShutterReferenceFilenames,
} from "../../../shared/render-references/shutterReferences.ts";
import {
  ROOF_FOLDER,
  collectRoofReferenceImages,
  listRoofReferenceFilenames,
} from "../../../shared/render-references/roofReferences.ts";

/**
 * Le librerie di riferimento di persiane e tetto dichiarano file in
 * public/render-references/<cartella>/. Come per gli infissi: ogni file
 * dichiarato deve esistere, altrimenti l'edge fa fetch di un 404 e il render
 * gira senza la foto guida senza che nessuno se ne accorga.
 */
const RADICE = join(process.cwd(), "public", "render-references");

describe("foto di riferimento condivise: persiane", () => {
  it("ogni file dichiarato esiste su disco", () => {
    const mancanti = listShutterReferenceFilenames().filter((f) => !existsSync(join(RADICE, SHUTTER_FOLDER, f)));
    expect(mancanti).toEqual([]);
  });
  it("il tipo scelto porta la sua foto, con etichetta di FORMA", () => {
    const refs = collectShutterReferenceImages({ tipo: "veneziana_classica", materiale: "pvc", operazione: "sostituisci" });
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toMatch(/^SHUTTER MODEL TARGET — veneziana_classica/);
    expect(refs[0].url).toMatch(/\/render-references\/shutters\/Persiana-Veneziana-Legno-Verde-Chiusa\.webp$/);
  });
  it("legno naturale aggiunge la foto del materiale; mai piu' di 2", () => {
    const refs = collectShutterReferenceImages({ tipo: "scuro_pieno", materiale: "legno_naturale", operazione: "sostituisci" });
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["SHUTTER MODEL TARGET", "SHUTTER MATERIAL TARGET"]);
  });
  it("rimuovi le persiane → nessuna foto; tipo sconosciuto → nessuna foto", () => {
    expect(collectShutterReferenceImages({ tipo: "veneziana_classica", operazione: "rimuovi" })).toEqual([]);
    expect(collectShutterReferenceImages({ tipo: "boh" })).toEqual([]);
  });
});

describe("foto di riferimento condivise: tetto", () => {
  it("ogni file dichiarato esiste su disco", () => {
    const mancanti = listRoofReferenceFilenames().filter((f) => !existsSync(join(RADICE, ROOF_FOLDER, f)));
    expect(mancanti).toEqual([]);
  });
  it("coppi: dettaglio + vista d'insieme, etichette distinte", () => {
    const refs = collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "sostituzione_manto" });
    expect(refs).toHaveLength(2);
    expect(refs[0].label).toMatch(/^ROOF COVERING TARGET \(close-up\) — tegole_coppi/);
    expect(refs[1].label).toMatch(/^ROOF COVERING TARGET \(whole slope\)/);
    expect(refs[1].label).toMatch(/Do NOT copy this building/);
  });
  it("solo colore o solo lattonerie → nessuna foto del manto", () => {
    expect(collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "solo_colore" })).toEqual([]);
    expect(collectRoofReferenceImages({ tipo_manto: "tegole_coppi", tipo_intervento: "lattonerie_accessori" })).toEqual([]);
  });
  it("ogni TipoManto del wizard ha una foto", () => {
    const tipi = ["tegole_coppi","tegole_marsigliesi","tegole_portoghesi","tegole_piane","ardesia_naturale","ardesia_sintetica","lamiera_grecata","lamiera_aggraffata","lamiera_zinco_titanio","tegole_fotovoltaiche"];
    for (const t of tipi) expect(collectRoofReferenceImages({ tipo_manto: t }).length, t).toBeGreaterThan(0);
  });
});

import { BATHROOM_FOLDER, collectBathroomReferenceImages, listBathroomReferenceFilenames } from "../../../shared/render-references/bathroomReferences.ts";
import { FLOOR_FOLDER, collectFloorReferenceImages, listFloorReferenceFilenames } from "../../../shared/render-references/floorReferences.ts";
import { FACADE_FOLDER, collectFacadeReferenceImages, listFacadeReferenceFilenames } from "../../../shared/render-references/facadeReferences.ts";
import { OUTDOOR_FOLDER, collectPergolaReferenceImages, collectPoolReferenceImages, listOutdoorReferenceFilenames } from "../../../shared/render-references/outdoorReferences.ts";

describe("foto di riferimento condivise: bagno, pavimento, facciata, esterni", () => {
  it("ogni file dichiarato esiste su disco", () => {
    const mancanti = [
      ...listBathroomReferenceFilenames().map((f) => join(BATHROOM_FOLDER, f)),
      ...listFloorReferenceFilenames().map((f) => join(FLOOR_FOLDER, f)),
      ...listFacadeReferenceFilenames().map((f) => join(FACADE_FOLDER, f)),
      ...listOutdoorReferenceFilenames().map((f) => join(OUTDOOR_FOLDER, f)),
    ].filter((rel) => !existsSync(join(RADICE, rel)));
    expect(mancanti).toEqual([]);
  });
  it("bagno: doccia walk-in + effetto piastrelle, max 2, la doccia vince sulla vasca", () => {
    const refs = collectBathroomReferenceImages({ sostituzione: { doccia: true, vasca: true, piastrelle_parete: true }, doccia: { attivo: true, tipo: "walk_in" }, vasca: { attivo: true, tipo: "freestanding_ovale" }, piastrelle_parete: { attivo: true, effetto: "marmo_carrara" } });
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["SHOWER TYPE TARGET", "WALL TILE EFFECT TARGET"]);
  });
  it("bagno: niente sostituzioni → nessuna foto", () => {
    expect(collectBathroomReferenceImages({ sostituzione: {}, doccia: { attivo: false, tipo: "walk_in" } })).toEqual([]);
  });
  it("pavimento: spina di pesce → posa + materiale (senza doppioni dello stesso file)", () => {
    const refs = collectFloorReferenceImages({ tipo: "parquet_prefinito", pattern_posa: "spina_di_pesce" });
    expect(refs).toHaveLength(2);
    expect(refs[0].label).toMatch(/^LAYING PATTERN TARGET — spina_di_pesce/);
    const gres = collectFloorReferenceImages({ tipo: "gres_porcellanato", effetto_visivo: "cemento", pattern_posa: "rettilineo_dritto" });
    expect(gres).toHaveLength(1);
    expect(gres[0].label).toMatch(/^FLOOR MATERIAL TARGET — gres_porcellanato \/ cemento/);
  });
  it("facciata: rivestimento prima della finitura intonaco; disattivi → niente", () => {
    const refs = collectFacadeReferenceImages({ intonaco: { attivo: true, finitura: "graffiato_medio" }, rivestimento: { attivo: true, tipo: "clinker_rosso" } });
    expect(refs.map((r) => r.label.split(" — ")[0])).toEqual(["CLADDING TARGET", "PLASTER FINISH TARGET"]);
    expect(collectFacadeReferenceImages({ intonaco: { attivo: false, finitura: "liscio" }, rivestimento: { attivo: false, tipo: "clinker_rosso" } })).toEqual([]);
  });
  it("piscina: solo per nuova o sostituzione; pergola per tipo struttura", () => {
    expect(collectPoolReferenceImages({ operazione: "add_new_pool", tipo: "infinity_pool" })[0].label).toMatch(/^POOL TYPE TARGET — infinity_pool/);
    expect(collectPoolReferenceImages({ operazione: "change_coping_only", tipo: "infinity_pool" })).toEqual([]);
    expect(collectPergolaReferenceImages({ tipo_struttura: "bioclimatica_addossata" })[0].label).toMatch(/^PERGOLA TYPE TARGET/);
    expect(collectPergolaReferenceImages({ tipo_struttura: "boh" })).toEqual([]);
  });
});
