import { describe, expect, it } from "vitest";
import { elencoPassi, passiFirma } from "@/lib/fea/passiFirma";

describe("passiFirma", () => {
  it("azienda senza clausole: codice e firma", () => {
    expect(passiFirma({ tipo_firmatario: "b2b" })).toEqual(["codice", "firma"]);
  });
  it("privato con clausole: codice, recesso, clausole, firma", () => {
    expect(passiFirma({ tipo_firmatario: "b2c", clausole_1341: [{ id: "a", testo: "x" }] as never })).toEqual(["codice", "recesso", "clausole", "firma"]);
  });
  it("identificazione solo se c'è la dichiarazione", () => {
    expect(passiFirma({ tipo_firmatario: "b2b", identificazione_richiesta: true })).toEqual(["codice", "firma"]);
    expect(passiFirma({ tipo_firmatario: "b2b", identificazione_richiesta: true, dichiarazione_fea: { versione: "1", testo: "t" } })).toEqual(["codice", "identificazione", "firma"]);
  });
  it("frase leggibile", () => {
    expect(elencoPassi(["codice", "recesso", "clausole", "firma"])).toBe("codice, diritto di recesso, clausole e «Accetto e firmo»");
  });
});
