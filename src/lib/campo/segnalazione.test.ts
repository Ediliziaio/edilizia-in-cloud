import { describe, expect, it } from "vitest";
import { segnalazioneDaTesto } from "./segnalazione";

describe("segnalazione dal cantiere", () => {
  it("senza testo non c'è segnalazione", () => {
    expect(segnalazioneDaTesto("   ", false)).toBeNull();
  });
  it("una frase breve è il titolo", () => {
    expect(segnalazioneDaTesto(" mancano i tasselli ", false)).toEqual({ titolo: "mancano i tasselli", descrizione: null, priorita: "media", priority: "normale" });
  });
  it("una frase lunga si taglia tra due parole e resta intera nella descrizione", () => {
    const testo = "il ponteggio sul lato nord non è stato ancorato e oggi non si può salire a lavorare al secondo piano";
    const s = segnalazioneDaTesto(testo, true)!;
    expect(s.titolo.length).toBeLessThanOrEqual(61);
    expect(s.titolo.endsWith("…")).toBe(true);
    expect(s.titolo).not.toMatch(/\s…$/);
    expect(s.descrizione).toBe(testo);
    expect(s.priority).toBe("alta");
  });
});
