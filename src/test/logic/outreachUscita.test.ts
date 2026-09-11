import { describe, expect, it } from "vitest";
import { FRASE_USCITA_DEFAULT, haFraseUscita } from "../../../supabase/functions/_shared/outreach-uscita";

describe("haFraseUscita", () => {
  it("riconosce la frase standard e le sue varianti", () => {
    expect(haFraseUscita(FRASE_USCITA_DEFAULT)).toBe(true);
    expect(haFraseUscita("Se non ti interessa rispondi STOP e non ti scrivo più.")).toBe(true);
    expect(haFraseUscita("Rispondimi anche solo \"no\" e chiudo qui.")).toBe(true);
    expect(haFraseUscita("Se preferisci non ricevere altre email, dimmelo.")).toBe(true);
  });

  it("non si fa ingannare da «la risposta è no» o da un invito generico a rispondere", () => {
    expect(haFraseUscita("Ti rispondo in giornata, anche se la risposta è no.")).toBe(false);
    expect(haFraseUscita("Rispondi con un orario e il tuo numero: in dieci minuti ti spiego tutto.")).toBe(false);
    expect(haFraseUscita("")).toBe(false);
  });
});
