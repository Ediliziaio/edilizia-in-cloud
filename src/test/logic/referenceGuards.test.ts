import { describe, expect, it } from "vitest";
import { colourWordsIn, etichetteDiFormaConColore, fileMancanti, fotoBnADColori, fotoColoriInGrigio, miniatureMancanti } from "../lib/referenceGuards";

describe("referenceGuards: i controlli sulle tabelle di foto", () => {
  it("riconosce colori e finiture, non le parole che le contengono", () => {
    expect(colourWordsIn("a frameless walk-in shower with a linear drain")).toEqual([]);
    expect(colourWordsIn("polished WHITE marble, matt black frame")).toEqual(["polished", "white", "matt", "black"]);
    expect(colourWordsIn("redwood decking, a bluebird")).toEqual([]);
  });

  it("una foto B/N con un colore nel testo viene segnalata; una a colori no", () => {
    const tabella = {
      walk_in: { folder: "bathroom", filename: "Walk-In-BN.webp", text: "walk-in shower with black frame" },
      marmo: { folder: "bathroom", filename: "Marmo.webp", text: "white marble with grey veining" },
      pulita: { folder: "bathroom", filename: "Vasca-BN.webp", text: "freestanding oval bathtub" },
    };
    expect(etichetteDiFormaConColore(tabella)).toEqual(["walk_in (Walk-In-BN.webp): black"]);
  });

  it("segnala i file e le miniature che non esistono", () => {
    const t = { x: { folder: "bathroom", filename: "NonEsiste-BN.webp", text: "t" } };
    expect(fileMancanti(t)).toEqual(["bathroom/NonEsiste-BN.webp"]);
    expect(miniatureMancanti(t)).toEqual(["thumbs/bathroom/NonEsiste.webp"]);
    expect(fileMancanti({ y: { folder: "pools", filename: "Gradini-Chiari-Nellangolo-Della-Piscina-BN.webp", text: "t" } })).toEqual([]);
  });

  it("fotoBnADColori: una foto a colori dichiarata di forma viene segnalata, una B/N vera no", async () => {
    // l'ombrello: un file «-BN» vero del set e una foto a colori del set dichiarata di forma per errore
    const bnVera = { folder: "pools", filename: "Gradini-Chiari-Nellangolo-Della-Piscina-BN.webp", text: "t" };
    const colori = { folder: "bathroom", filename: "Piastrelle-Marmo-Bianco-Venato.webp", text: "t", bn: true };
    const out = await fotoBnADColori({ ok: bnVera, sbagliata: colori });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^sbagliata: bathroom\/Piastrelle-Marmo-Bianco-Venato\.webp/);
  });

  it("fotoColoriInGrigio: una foto grigia dichiarata a colori viene segnalata, salvo eccezione esplicita", async () => {
    const grigia = { folder: "pools", filename: "Gradini-Chiari-Nellangolo-Della-Piscina-BN.webp", text: "t", bn: false };
    expect(await fotoColoriInGrigio([], { x: grigia })).toHaveLength(1);
    expect(await fotoColoriInGrigio(["pools/Gradini-Chiari-Nellangolo-Della-Piscina-BN.webp"], { x: grigia })).toEqual([]);
  });
});
