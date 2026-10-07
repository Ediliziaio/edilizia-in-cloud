/**
 * La zona climatica dal CAP, per il risparmio in bolletta del preventivo Serramenti (06/10/2026).
 */
import { describe, expect, it } from "vitest";
import { zonaDaCap } from "@/lib/serramenti/risparmio";

describe("zona climatica dal CAP", () => {
  it("la zona dal CAP: Roma e provincia sono zona D, Cagliari e la Sardegna non sono mai zona F", () => {
    // Roma (00184) è zona D (1.415 gradi giorno); Cagliari (09100) zona C. Nessun capoluogo del Lazio, dell'Umbria
    // o della Sardegna sta in zona F, che è oltre i 3.000 gradi giorno.
    expect(zonaDaCap("00184")).toBe("D");
    expect(zonaDaCap("00100")).toBe("D");
    expect(zonaDaCap("09100")).toBe("C");
    expect(zonaDaCap("07100")).toBe("C");
    expect(zonaDaCap("06100")).toBe("E"); // Perugia
    // Quelli che il conto già sapeva: Milano E, Firenze D, Napoli C, Palermo B.
    expect(["20100", "50100", "80100", "90100"].map((c) => zonaDaCap(c))).toEqual(["E", "D", "C", "B"]);
    // Nessun CAP, o non numerico: E, la zona di mezzo.
    expect([null, undefined, "", "abc"].map((c) => zonaDaCap(c))).toEqual(["E", "E", "E", "E"]);
  });
});
