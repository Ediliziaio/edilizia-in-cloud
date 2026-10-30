import { describe, expect, it } from "vitest";
import { quantitaProposta, suggestedComputoChapter } from "@/lib/preventivi/wizardAiDraft";

/**
 * Le voci che Silvio propone entrano nel capitolo giusto. Fino al 29/10/2026
 * il suggeritore conosceva bagni e ristrutturazioni interne: cappotto,
 * serramenti, scavi, recinzioni e campi sportivi finivano tutti in «Altre
 * lavorazioni» (campo da tennis e planimetria con cappotto in EPS, provati
 * con la chat vera).
 */
describe("capitolo suggerito per le voci della chat", () => {
  it.each([
    ["Pannello rigido EPS esterno (cappotto)", "Isolamento e cappotto"],
    ["Sostituzione infissi", "Serramenti"],
    ["Scotico e scavo di sbancamento", "Scavi, drenaggi e fondazioni"],
    ["Tubo drenante microfessurato", "Scavi, drenaggi e fondazioni"],
    ["Fondazione in misto stabilizzato", "Scavi, drenaggi e fondazioni"],
    ["Manto in resina acrilica", "Pavimentazioni e attrezzature sportive"],
    ["Pali e rete da gioco", "Pavimentazioni e attrezzature sportive"],
    ["Recinzione perimetrale h 4 m", "Recinzioni e cancelli"],
    ["Punti luce led", "Impianto elettrico"],
    // Prove con la chat vera del 30/10/2026: tennis, padel, calcio.
    ["Pali rete e rete da tennis", "Pavimentazioni e attrezzature sportive"],
    ["Struttura in acciaio zincato verniciato con vetri temperati 12 mm e rete laterale", "Pavimentazioni e attrezzature sportive"],
    ["Porte da calcio regolamentari", "Pavimentazioni e attrezzature sportive"],
    ["Platea in calcestruzzo armato con pendenza", "Opere in calcestruzzo"],
    ["Cordoli perimetrali in calcestruzzo", "Opere in calcestruzzo"],
    ["Drenaggio a spina di pesce con collettori perimetrali", "Scavi, drenaggi e fondazioni"],
    ["Livellamento e regolarizzazione del piano di posa", "Scavi, drenaggi e fondazioni"],
    ["Strato di pietrisco", "Sottofondi e impermeabilizzazioni"],
    ["Intaso di stabilizzazione in sabbia", "Pavimentazioni e attrezzature sportive"],
    ["Bandierine d'angolo", "Pavimentazioni e attrezzature sportive"],
    ["Controsoffitto in cartongesso idrorepellente", "Cartongesso e controsoffitti"],
    ["Panche e appendiabiti", "Arredi e accessori"],
  ])("«%s» va in «%s»", (titolo, capitolo) => {
    expect(suggestedComputoChapter(titolo)).toBe(capitolo);
  });
  it.each([
    ["Rimozione infissi", "Demolizioni e smaltimenti"],
    ["Demolizione pavimento", "Demolizioni e smaltimenti"],
    ["Piatto doccia", "Sanitari e rubinetterie"],
    ["Rasatura pareti", "Finiture"],
    ["Collettore idraulico sottolavello", "Impianto idraulico"],
    ["Tubazioni di scarico", "Impianto idraulico"],
  ])("le regole di prima non cambiano: «%s» resta in «%s»", (titolo, capitolo) => {
    expect(suggestedComputoChapter(titolo)).toBe(capitolo);
  });
});

describe("quantità delle voci nuove della chat", () => {
  it("una voce a corpo senza quantità vale 1, non resta da completare", () => {
    expect(quantitaProposta({ quantity: null, unit: "corpo" })).toBe(1);
    expect(quantitaProposta({ quantity: null, unit: "a corpo" })).toBe(1);
    expect(quantitaProposta({ quantity: 3, unit: "corpo" })).toBe(3);
    expect(quantitaProposta({ quantity: null, unit: "m³" })).toBeNull();
    expect(quantitaProposta({ quantity: null, unit: "corpo", proposedCalculation: { formula: "x" } })).toBeNull();
  });
});
