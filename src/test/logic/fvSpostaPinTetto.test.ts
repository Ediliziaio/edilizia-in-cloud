import { describe, expect, it } from "vitest";
import { spostaPinTettoFv } from "@/lib/fotovoltaico/spostaPinTetto";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { pianoDaMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";
import {
  creaDisegnoTetto,
  disponiModuliOttimizzati,
  leggiDisegnoCommerciale,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {
  type MappaFv,
  rettangoloRuotatoFv,
} from "../../../supabase/functions/_shared/fvMappa";

const vecchia = {
  posizione: { lat: 45, lng: 9 },
  ricerca: {
    indirizzo: "Via Esempio 1",
    posizione: { lat: 45.001, lng: 9.001 },
  },
};
const nuova = { ...vecchia, posizione: { lat: 45.0001, lng: 9.0002 } };
const mappa = (): MappaFv => ({
  versione: 1,
  origine: vecchia.posizione,
  ricerca: vecchia.ricerca,
  distanzaOstacoli: .3,
  falde: [{
    id: "f1",
    nome: "Falda 1",
    punti: rettangoloRuotatoFv({ x: -10, y: 0 }, 12, 8, 0),
    inclinazione: 30,
    azimut: 180,
    inclinazioneStimata: true,
  }, {
    id: "f2",
    nome: "Falda 2",
    punti: rettangoloRuotatoFv({ x: 10, y: 0 }, 12, 8, 0),
    inclinazione: 30,
    azimut: 180,
    inclinazioneStimata: true,
  }],
  solare: [{ faldaId: "f1", ore: 1700, pesiMensili: Array(12).fill(1 / 12) }, {
    faldaId: "f2",
    ore: 1600,
    pesiMensili: Array(12).fill(1 / 12),
  }],
});
describe("spostamento del riferimento del tetto", () => {
  it("conserva geometria, pannelli, ostacoli, quantità e potenza e invalida soltanto i dati della posizione precedente", () => {
    const piano = disponiModuliOttimizzati(
      pianoDaMappaFv(mappa(), { corto: 1.134, lungo: 1.762, stimato: false }),
      18,
    );
    piano.ostacoli = [{ id: "camino", x: 20, y: 20, w: 1, h: 1 }];
    const data = {
      ...INITIAL,
      riferimento_tetto: vecchia,
      layout_overlay: piano,
      numero_pannelli_scelti: 18,
      potenza_kwp: 9.72,
      ore_sole_annue: 1700,
      qualita_dati_tetto: "PVGIS",
      imagery_date: "2026-01",
      superficie_tetto_disponibile_mq: 221.7,
      numero_pannelli_max: 60,
      potenza_max_kwp: 32.4,
    };
    const prima = JSON.stringify(data), r = spostaPinTettoFv(data, nuova);
    const p = leggiDisegnoCommerciale(
      JSON.parse(JSON.stringify(r.layout_overlay)),
    )!;
    expect(p).not.toBeNull();
    expect(p.mappa!.origine).toEqual(nuova.posizione);
    expect(p.mappa!.ricerca).toEqual(vecchia.ricerca);
    expect(p.mappa!.falde).toEqual(piano.mappa!.falde);
    expect(p.falde).toEqual(piano.falde);
    expect(p.pannelli).toEqual(piano.pannelli);
    expect(p.pannelli).toHaveLength(18);
    expect(p.ostacoli).toEqual(piano.ostacoli);
    expect(p.mappa!.solare).toBeUndefined();
    expect(r.ore_sole_annue).toBeNull();
    expect(r.qualita_dati_tetto).toBeNull();
    expect(r.imagery_date).toBeNull();
    expect(r).toMatchObject({
      numero_pannelli_scelti: 18,
      potenza_kwp: 9.72,
      superficie_tetto_disponibile_mq: 221.7,
      numero_pannelli_max: 60,
      potenza_max_kwp: 32.4,
    });
    expect(JSON.stringify(data)).toBe(prima);
  });
  it("non trascina un disegno senza riferimento geografico dentro un nuovo edificio", () => {
    const p = creaDisegnoTetto("due_falde", 12, 8, {
      corto: 1.134,
      lungo: 1.762,
      stimato: true,
    });
    const r = spostaPinTettoFv({
      ...INITIAL,
      layout_overlay: p,
      numero_pannelli_scelti: 18,
      potenza_kwp: 9.72,
    }, nuova);
    expect(r.layout_overlay).toBeNull();
    expect(r.layout_tetto).toBeNull();
    expect(r.numero_pannelli_scelti).toBe(0);
    expect(r.potenza_kwp).toBe(0);
    expect(r.riferimento_tetto).toEqual(nuova);
  });
  it("la rimozione del riferimento ripulisce il disegno e i dati del tetto", () => {
    const r = spostaPinTettoFv({
      ...INITIAL,
      riferimento_tetto: vecchia,
      layout_overlay: pianoDaMappaFv(mappa(), {
        corto: 1.134,
        lungo: 1.762,
        stimato: true,
      }),
    }, null);
    expect(r.riferimento_tetto).toBeNull();
    expect(r.layout_overlay).toBeNull();
    expect(r.superficie_tetto_disponibile_mq).toBeNull();
    expect(r.numero_pannelli_max).toBeNull();
  });
});
