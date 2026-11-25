import { describe, expect, it } from "vitest";
import { accorpaVociPerLavorazione, partiDescrizione, pianoDellaVoce } from "@/lib/computo/accorpaVoci";
import type { VoceComputo } from "@/lib/computo/alberoComputo";

const voce = (id: string, descrizione: string, quantita: number, prezzo: number, extra: Partial<VoceComputo> = {}): VoceComputo => ({
  id, ordine: 0, numero_ordine: null, codice_voce: null, codice_tariffa: "A 9.02.5.d.2", codice_prezzario: null,
  descrizione_breve: descrizione, descrizione_estesa: descrizione, unita_misura: "m²", quantita, prezzo_unitario_computo: prezzo,
  importo_computo: Math.round(quantita * prezzo * 100) / 100, super_categoria: "06 Murature e tamponature", categoria: "Murature", sotto_categoria: null,
  is_sicurezza: false, is_detrazione: false, a_corpo: false, warnings: [], fonte_prezzo: "Prezzario Lazio 2023 · A 9.02.5.d.2",
  note_misure: "Quantità indicativa.", misure: [{ ordine: 1, descrizione: "x", parti_uguali: quantita, lunghezza: null, larghezza: null, altezza_peso: null, quantita, formula: null }],
  ...extra,
});

describe("voci della pianta accorpate per lavorazione e piano", () => {
  it("legge lavorazione, piano e misura dalla descrizione", () => {
    expect(partiDescrizione("Nuovo tramezzo\nPiano primo · 2,045 m × 3,19 m")).toEqual({ lavorazione: "Nuovo tramezzo", piano: "Piano primo", misura: "2,045 m × 3,19 m" });
    expect(pianoDellaVoce({ descrizione_breve: "Ponteggio\nEdificio", descrizione_estesa: null })).toBe("Edificio");
  });

  it("una voce per lavorazione e piano, una riga di misura per parete, importo uguale", () => {
    const voci = [
      voce("a", "Nuovo tramezzo\nPiano primo · 2,045 m × 3,19 m", 6.52, 48.65),
      voce("b", "Tamponatura esterna\nPiano primo · 6,205 m × 3,19 m", 19.79, 145.96),
      voce("c", "Nuovo tramezzo\nPiano primo · 0,907 m × 3,19 m", 2.89, 48.65),
      voce("d", "Nuovo tramezzo\nPiano secondo · 1,5 m × 3,19 m", 4.79, 48.65),
      voce("e", "Nuovo tramezzo\nPiano primo · 0,6 m × 3,19 m", 1.91, 48.65, { prezzo_unitario_computo: 50, importo_computo: 95.5 }),
    ];
    const r = accorpaVociPerLavorazione(voci);
    expect(r.map((v) => [v.numero_ordine, v.descrizione_breve, v.misure.length])).toEqual([
      ["1", "Nuovo tramezzo\nPiano primo", 2],
      ["2", "Tamponatura esterna\nPiano primo", 1],
      ["3", "Nuovo tramezzo\nPiano secondo", 1],
      ["4", "Nuovo tramezzo\nPiano primo", 1],
    ]);
    expect(r[0].misure.map((m) => [m.descrizione, m.quantita])).toEqual([["2,045 m × 3,19 m", 6.52], ["0,907 m × 3,19 m", 2.89]]);
    expect(r[0].quantita).toBe(9.41);
    expect(r[1].misure[0]).toMatchObject({ descrizione: "6,205 m × 3,19 m", quantita: 19.79, parti_uguali: null });
    // Il meno tipografico diventa un trattino: nel PDF spaziava la riga.
    expect(partiDescrizione("Terrazzo\nPiano primo · 169,57 m² \u2212 59,02 m²").misura).toBe("169,57 m² - 59,02 m²");
    const totale = (vv: VoceComputo[]) => Math.round(vv.reduce((s, v) => s + (v.importo_computo ?? 0), 0) * 100) / 100;
    expect(totale(r)).toBe(totale(voci));
  });

  it("a corpo, sicurezza e detrazioni restano voci a sé", () => {
    const voci = [
      voce("a", "Allacciamenti\nEdificio · a corpo", 1, 6500, { a_corpo: true, unita_misura: "a corpo" }),
      voce("b", "Allacciamenti\nEdificio · a corpo", 1, 6500, { a_corpo: true, unita_misura: "a corpo" }),
    ];
    expect(accorpaVociPerLavorazione(voci)).toHaveLength(2);
  });
});
