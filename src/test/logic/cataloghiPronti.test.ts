/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CATALOGHI_PRONTI, caricaCatalogo, giaInLibreria, preparaModelloArea, preparaVoce } from "@/lib/listino/cataloghiPronti";
import { FILTRO_VUOTO, filtraProdotti } from "@/lib/listino/prodottiLibreria";
import { VERTICALI_GALLERIA } from "@/lib/verticalMapping";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

const catalogo = (id: string) => CATALOGHI_PRONTI.find((voce) => voce.id === id)!;

describe("cataloghi pronti", () => {
  it("ha codici stabili e senza collisioni nei cataloghi base e nel listino con finiture", async () => {
    const voci = (await Promise.all(CATALOGHI_PRONTI.map(caricaCatalogo))).flat();
    expect(new Set(voci.map(({ id }) => id)).size).toBe(voci.length);
    const edile = catalogo("base-edilizia");
    expect(await caricaCatalogo(edile)).toEqual(await caricaCatalogo(edile));
    expect(voci.every((voce) => VERTICALI_GALLERIA.some((settore) => settore.value === voce.vertical_slug))).toBe(true);
  });

  it("salta le copie della stessa sorgente anche rinominate e conserva gli omonimi di un'altra fonte", async () => {
    const edile = catalogo("base-edilizia");
    const [lastra] = await caricaCatalogo(edile);
    const riga = { ...lastra, sort_order: 0, id: "preesistente" };
    expect(giaInLibreria(edile, lastra, [{ ...riga, tags: ["Fornitore diverso"] }])).toBe(false);
    expect(giaInLibreria(edile, lastra, [{ ...riga, nome: "Nome personalizzato" }])).toBe(true);
    expect(giaInLibreria(edile, lastra, [{ ...riga, id: lastra.id, tags: [], nome: "Nome personalizzato" }])).toBe(true);
  });

  it("distingue unità e varianti da prezzi e maggiorazioni durante l'importazione", async () => {
    const piastrelle = catalogo("base-piastrelle");
    const [gres] = await caricaCatalogo(piastrelle);
    const senzaPrezzi = preparaVoce(gres, false, false);
    expect(senzaPrezzi).toMatchObject({ is_active: false, prezzo_base_vendita: null, unit_of_measure: "mq" });
    expect(senzaPrezzi.assi_default[0].values[1]).toMatchObject({ label: "20×90 cm", maggiorazione_tipo: "none", maggiorazione_valore: 0 });
    expect(preparaVoce(gres, true, true)).toMatchObject({ is_active: true, prezzo_base_vendita: gres.prezzo_base_vendita });
  });

  it("costruisce modelli di area installabili con le categorie, le unità e i valori scelti", async () => {
    const edile = catalogo("base-edilizia");
    const [lastra] = await caricaCatalogo(edile);
    const salvato = await preparaModelloArea(edile, [lastra], false, false);
    expect(salvato).toMatchObject({
      area: "ristrutturazione",
      pubblicato: false,
      con_prezzi_vendita: false,
      riepilogo: { tipologie: 1, prodotti: 1, varianti: 3 },
      contenuto: {
        versione: 1,
        tipologie: [{
          nome: "Sistemi a secco",
          verticali_abilitati: ["ristrutturazione"],
          prodotti: [{
            codice: "ed-lastra-standard",
            unit_of_measure: "mq",
            assi: [{ codice: "spessore", valori: [
              { chiave: "spessore:1", label: "9,5 mm" },
              { chiave: "spessore:2", label: "12,5 mm" },
              { chiave: "spessore:3", label: "15 mm" },
            ] }],
          }],
        }],
      },
    });
    const fv = catalogo("base-fotovoltaico");
    expect(await preparaModelloArea(fv, (await caricaCatalogo(fv)).slice(0, 1), true, false)).toMatchObject({
      riepilogo: { fotovoltaico: true },
      contenuto: { tipologie: [{ fv_categoria: "pannello" }] },
    });
  });

  it("combina il settore con la modalità prezzo e la ricerca esistente", async () => {
    const righe = [
      ...await caricaCatalogo(catalogo("base-edilizia")),
      ...await caricaCatalogo(catalogo("base-piastrelle")),
    ];
    const esito = filtraProdotti(righe, { ...FILTRO_VUOTO, cerca: "lastra", settore: "ristrutturazione", modalita: "mq" });
    expect(esito.map(({ tipologia }) => tipologia)).toEqual(["ed-lastra-standard", "ed-lastra-idro", "ed-lastra-antincendio"]);
  });
});
