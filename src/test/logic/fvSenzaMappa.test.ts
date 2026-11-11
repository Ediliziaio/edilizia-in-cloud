import { describe, expect, it } from "vitest";
import { cambiaModalitaProgettazione, preventivoSenzaMappa, validaDatiTettoFv } from "../../../supabase/functions/_shared/fvModalitaProgettazione";
import { leggiPiano } from "../../../supabase/functions/_shared/fvPianoTetto";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { loadPersistedDraft, savePersistedDraft } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
import { calcolaFvCommercialReadiness } from "@/lib/fotovoltaico/preventivatore";

describe("Preventivo FV senza disegno", () => {
  it("salva e ripristina la scelta, conservando il piano precedente per riprenderlo", () => {
    const piano = { x: 2, y: -3, rot: 15, cols: 4, unita: "m" as const, orient: "o" as const };
    const scelta = cambiaModalitaProgettazione(piano, true);
    expect(preventivoSenzaMappa(scelta)).toBe(true);
    expect(leggiPiano(scelta)).toBeNull();
    savePersistedDraft("senza-mappa", { data: { ...INITIAL, layout_overlay: scelta }, step: 5, completedSteps: [1, 2, 3, 4] }, "utente:azienda");
    const ripreso = loadPersistedDraft("senza-mappa", "utente:azienda")!.data.layout_overlay;
    expect(cambiaModalitaProgettazione(ripreso, false)).toEqual(piano);
    expect(cambiaModalitaProgettazione(cambiaModalitaProgettazione(ripreso, true), false)).toEqual(piano);
  });

  it("non trasforma un vecchio progetto senza piano in una scelta esplicita senza mappa", () => {
    expect(preventivoSenzaMappa(null)).toBe(false);
    expect(preventivoSenzaMappa({ modalita: "altro" })).toBe(false);
    expect(cambiaModalitaProgettazione({ modalita: "senza_mappa", piano_precedente: { x: "rotto" } }, false)).toBeNull();
  });

  it("richiede la resa solare ma non un massimo inventato di pannelli", () => {
    expect(validaDatiTettoFv({ ore_sole_annue: 1450, numero_pannelli_max: null as number|null }).valido).toBe(true);
    for (const ore of [null, 0, -1, NaN, Infinity]) expect(validaDatiTettoFv({ ore_sole_annue: ore, numero_pannelli_max: null as number|null }).valido).toBe(false);
    for (const max of [0, -1, 3.5, Infinity]) expect(validaDatiTettoFv({ ore_sole_annue: 1450, numero_pannelli_max: max }).valido).toBe(false);
  });

  it("la geometria non rilevata è da verificare; i limiti noti e i prezzi mancanti restano bloccanti", () => {
    const dati = { consumo_annuo_kwh: 6000, costo_kwh_attuale: 0.3, potenza_kwp: 5.4, potenza_max_kwp: null as number|null,
      numero_pannelli_scelti: 12, numero_pannelli_max: null as number|null, produzione_annua_stimata_kwh: 6000, con_accumulo: false,
      listinoCompleto: true, tariffaInstallazioneConfigurata: true, tettoMock: false, senzaMappa: true };
    const esito = calcolaFvCommercialReadiness(dati);
    expect(esito.status).toBe("review");
    expect(esito.issues).toContainEqual(expect.objectContaining({ code: "missing_roof_data", level: "warning" }));
    expect(calcolaFvCommercialReadiness({ ...dati, numero_pannelli_max: 10 }).issues)
      .toContainEqual(expect.objectContaining({ code: "roof_capacity_exceeded", level: "critical" }));
    expect(calcolaFvCommercialReadiness({ ...dati, listinoCompleto: false }).status).toBe("blocked");
  });
});
