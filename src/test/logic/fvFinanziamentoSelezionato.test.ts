import { describe, expect, it } from "vitest";
import { finanziamentoSelezionatoFv } from "../../lib/fotovoltaico/finanziamentoSelezionato";
const scelta = { id: "attuale", rata: { importo_rata: 71, durata_mesi: 84 } };
describe("Finanziamento FV da salvare", () => {
  it("salva la tabella valida scelta o la raccomandata quando non ce n’è una", () => {
    expect(finanziamentoSelezionatoFv(scelta.id, [scelta], 84)).toBe(scelta);
    expect(finanziamentoSelezionatoFv(null, [scelta], 84)).toBe(scelta);
  });
  it("la vecchia tabella della bozza non salva una rata nulla mentre a video appare la consigliata", () => {
    expect(() => finanziamentoSelezionatoFv("precedente", [scelta], 84)).toThrow("Seleziona una finanziaria");
  });
  it("non usa una rata di durata diversa o non disponibile", () => {
    expect(() => finanziamentoSelezionatoFv(null, [scelta], 60)).toThrow();
    expect(() => finanziamentoSelezionatoFv(null, [], 84)).toThrow();
    expect(() => finanziamentoSelezionatoFv(null, [{ ...scelta, rata: { ...scelta.rata, importo_rata: NaN } }], 84)).toThrow();
  });
});
