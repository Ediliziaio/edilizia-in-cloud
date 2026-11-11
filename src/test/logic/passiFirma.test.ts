import { describe, expect, it } from "vitest";
import { passiFirma } from "@/lib/fea/passiFirma";

describe("passiFirma", () => {
  it("dopo il consenso unico resta solo il codice, per aziende e privati", () => {
    expect(passiFirma({})).toEqual(["codice"]);
    expect(passiFirma(null)).toEqual(["codice"]);
  });
  it("identificazione solo se c'è la dichiarazione (firma avanzata)", () => {
    expect(passiFirma({ identificazione_richiesta: true })).toEqual(["codice"]);
    expect(passiFirma({ identificazione_richiesta: true, dichiarazione_fea: { versione: "1", testo: "t" } })).toEqual(["codice", "identificazione"]);
  });
});
