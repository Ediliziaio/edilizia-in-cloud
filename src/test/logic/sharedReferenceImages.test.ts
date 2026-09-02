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
