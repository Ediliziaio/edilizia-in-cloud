import { describe, expect, it } from "vitest";
import { anteprimaBozza } from "../../../supabase/functions/_shared/anteprimaProposta";

describe("anteprima della bozza nella conferma", () => {
  it("mostra canale, oggetto e corpo di un'email a un cliente", () => {
    const out = anteprimaBozza({
      tool_name: "componi_e_invia_messaggio",
      input: { canale: "email", oggetto: "Sollecito fattura 12", corpo: "Buongiorno, le ricordo la fattura in scadenza." },
    });
    expect(out).toContain("Via email");
    expect(out).toContain("Oggetto: Sollecito fattura 12");
    expect(out).toContain("le ricordo la fattura");
  });
  it("funziona anche se il payload è già l'input (senza wrapper)", () => {
    expect(anteprimaBozza({ corpo: "Ciao, ecco il preventivo." })).toContain("Ciao, ecco il preventivo.");
  });
  it("legge i nomi alternativi del corpo", () => {
    expect(anteprimaBozza({ input: { messaggio: "testo via messaggio" } })).toContain("testo via messaggio");
    expect(anteprimaBozza({ input: { body: "testo via body" } })).toContain("testo via body");
  });
  it("niente oggetto né corpo: nessuna anteprima", () => {
    expect(anteprimaBozza({ input: { nuovo_stato: "inviato" } })).toBe("");
    expect(anteprimaBozza(null)).toBe("");
  });
  it("taglia i corpi lunghissimi", () => {
    const out = anteprimaBozza({ input: { corpo: "x".repeat(1500) } });
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(1000);
  });
});
