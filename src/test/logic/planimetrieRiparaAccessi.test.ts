import { describe, expect, it } from "vitest";
import { controllaDisposizioneStato } from "../../../shared/planimetrie/controlloDisposizione";
import { riparaAccessi, riparaAccessiPianta } from "../../../shared/planimetrie/riparaAccessi";
import { piantaAiTrilocaleIsolato } from "../fixtures/piantaAiTrilocaleIsolato";
import { piantaAiPorteSbagliate } from "../fixtures/piantaAiPorteSbagliate";
import { piantaCollaudo } from "../fixtures/piantaCollaudo";

const codici = (s: Parameters<typeof controllaDisposizioneStato>[0]) => controllaDisposizioneStato(s).map((p) => `${p.codice}:${p.dettaglio.match(/«[^»]+»/)?.[0]}`);

describe("riparatore degli accessi", () => {
  it("trilocale vero: apre il bagno sul disimpegno e toglie la sua porta verso fuori; non passa da bagni e ripostigli", () => {
    const stato = piantaAiTrilocaleIsolato().livelli[0].fatto;
    const esito = riparaAccessi(stato);
    expect(esito.aggiunte.map((a) => a.fra)).toContainEqual(["Bagno 1", "Disimpegno"]);
    expect(esito.tolte).toContain("a6");
    expect(codici(stato)).toEqual(["porta_su_esterno:«Bagno 1»", "stanza_isolata:«Bagno 2»", "porta_su_esterno:«Camera 2»", "stanza_isolata:«Ripostiglio»"]);
    expect(codici(esito.stato)).toEqual(["porta_su_esterno:«Camera 2»", "stanza_isolata:«Ripostiglio»"]);
    expect(esito.aggiunte.every((a) => !/Bagno|Ripostiglio/.test(a.fra[1]))).toBe(true);
    expect(stato.aperture).toHaveLength(13);
  });

  it("pianta giusta: non tocca niente", () => {
    const stato = piantaCollaudo().livelli[0].fatto;
    const esito = riparaAccessi(stato);
    expect(esito).toEqual({ stato, aggiunte: [], tolte: [] });
  });

  it("la pianta del 23/11: la cameretta si apre sul disimpegno; il bagno no, perché darebbe sul soggiorno con cucina", () => {
    const stato = piantaAiPorteSbagliate().livelli[0].fatto;
    expect(codici(stato)).toEqual(["porta_su_esterno:«Cameretta»", "porta_su_esterno:«Bagno»"]);
    const esito = riparaAccessi(stato);
    expect(esito.aggiunte.map((a) => a.fra)).toEqual([["Cameretta", "Disimpegno"]]);
    expect(codici(esito.stato)).toEqual(["porta_su_esterno:«Bagno»"]);
  });

  it("dice in parole cosa ha cambiato, e niente se non ha cambiato niente", () => {
    expect(riparaAccessiPianta(piantaCollaudo()).nota).toBeNull();
    const { pianta, nota } = riparaAccessiPianta(piantaAiTrilocaleIsolato());
    expect(nota).toBe("Ho aperto una porta interna che mancava (Bagno 1–Disimpegno) e tolto una porta che dava verso l'esterno da bagni o camere: controllale nell'editor.");
    expect(codici(pianta.livelli[0].fatto)).toEqual(["porta_su_esterno:«Camera 2»", "stanza_isolata:«Ripostiglio»"]);
  });
});
