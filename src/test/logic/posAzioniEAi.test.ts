/**
 * genera-pos: quali azioni scrivono (e quindi non spettano a chi è in sola lettura) e cosa si tiene di una
 * proposta dell'AI. Il 30/10/2026 un utente in sola lettura non poteva aprire nemmeno il PDF di un POS già emesso
 * (scarica_emissione e anteprima_pdf erano trattate come scritture), mentre «Completa con l'AI», che consuma credito,
 * passava; e della risposta dell'AI entravano nel POS anche id, fase, prodotti riesaminati e segnaletica.
 */
import { describe, expect, it } from "vitest";
import { AZIONI_POS, scriveAzionePos } from "../../../supabase/functions/_shared/posAzioni";
import { lavorazioniDaRispostaAi } from "../../../supabase/functions/_shared/posAi";

describe("azioni di genera-pos", () => {
  it("aprire un PDF già emesso, l'anteprima o gli originali è lettura: vale anche in sola lettura", () => {
    for (const a of ["scarica_emissione", "anteprima_pdf", "anteprima_html", "apri_originale_addetto", "apri_documento_mezzo", "dati_app"] as const) {
      expect(scriveAzionePos(a), a).toBe(false);
    }
  });
  it("creare, approvare, emettere, i modelli e l'AI (che consuma credito) scrivono", () => {
    for (const a of ["crea", "approva", "emetti", "salva_modello", "archivia_modello", "lavorazioni_ai"] as const) {
      expect(scriveAzionePos(a), a).toBe(true);
    }
  });
  it("preparare, completare e annullare un'emissione col PDF disegnato dal browser scrivono: chi è in sola lettura non approva", () => {
    for (const a of ["prepara_emissione", "completa_emissione", "annulla_emissione"] as const) {
      expect(scriveAzionePos(a), a).toBe(true);
    }
  });
  it("ogni azione è classificata", () => {
    expect(AZIONI_POS.length).toBe(15);
  });
});

describe("proposta dell'AI", () => {
  const risposta = [
    {
      id: "x", titolo: "Montaggio ponteggio", descrizione: "Montaggio del ponteggio metallico fisso",
      rischi: ["Caduta dall'alto", "Schiacciamento", 42, "  "], misure: ["Parapetti", "Imbracatura"], dpi: ["Elmetto EN 397"],
      sostanze: ["Nessuna"], macchine: "Autocarro con gru", opere_provvisionali: "Ponteggio", impianti: "Nessuno", turni: "Turno unico",
      durata_giorni: "12", svolgimento: "subappalto", svolgimento_con: "Ponteggi Rossi",
      // campi che l'AI non deve poter impostare:
      fase_id: "fase-di-un-altra-commessa", prodotti: [{ nome: "Inventato" }], prodotti_riesaminati: true,
      segnaletica: [{ id: "elmetto", ubicazione: "Ingresso" }], tecnica: { riesaminata: true }, requisiti_addetti: { confermata: true },
      origine: "utente", verificata: true,
    },
    { id: "x", titolo: "Smontaggio" },
  ];

  it("tiene solo i campi di testo della scheda e li rimette da verificare", () => {
    const [prima] = lavorazioniDaRispostaAi(risposta, "ai-test");
    expect(prima).toMatchObject({
      titolo: "Montaggio ponteggio", rischi: "Caduta dall'alto\nSchiacciamento", misure: "Parapetti\nImbracatura", dpi: "Elmetto EN 397",
      sostanze: "Nessuna", durata_giorni: 12, svolgimento: "subappalto", svolgimento_con: "Ponteggi Rossi",
      origine: "ai", verificata: false, fase_id: null, prodotti: [], prodotti_riesaminati: false,
    });
    expect(prima.segnaletica).toBeUndefined();
    expect(prima.tecnica).toBeUndefined();
    expect(prima.requisiti_addetti).toBeUndefined();
  });
  it("gli id sono nostri e univoci anche se l'AI ne ripete uno", () => {
    expect(lavorazioniDaRispostaAi(risposta, "ai-test").map((l) => l.id)).toEqual(["ai-test-1", "ai-test-2"]);
  });
  it("scarta le schede senza titolo né descrizione e non va oltre 30 lavorazioni", () => {
    expect(lavorazioniDaRispostaAi([{ rischi: ["x"] }, null, "boh", { titolo: "Ok" }], "ai-t")).toHaveLength(1);
    const tante = Array.from({ length: 60 }, (_, i) => ({ titolo: `L${i}` }));
    expect(lavorazioniDaRispostaAi(tante, "ai-t")).toHaveLength(30);
  });
  it("tronca i testi enormi", () => {
    const [l] = lavorazioniDaRispostaAi([{ titolo: "T", descrizione: "d".repeat(50_000) }], "ai-t");
    expect(l.descrizione.length).toBeLessThanOrEqual(3000);
  });
});
