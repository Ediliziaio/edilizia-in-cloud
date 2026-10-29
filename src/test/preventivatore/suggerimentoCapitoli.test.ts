import { describe, expect, it } from "vitest";
import { suggestedComputoChapter } from "@/lib/preventivi/wizardAiDraft";

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
  ])("«%s» va in «%s»", (titolo, capitolo) => {
    expect(suggestedComputoChapter(titolo)).toBe(capitolo);
  });
  it.each([
    ["Rimozione infissi", "Demolizioni e smaltimenti"],
    ["Demolizione pavimento", "Demolizioni e smaltimenti"],
    ["Piatto doccia", "Sanitari e rubinetterie"],
    ["Rasatura pareti", "Finiture"],
  ])("le regole di prima non cambiano: «%s» resta in «%s»", (titolo, capitolo) => {
    expect(suggestedComputoChapter(titolo)).toBe(capitolo);
  });
});
