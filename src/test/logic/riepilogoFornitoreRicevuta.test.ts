import { describe, expect, it } from "vitest";
import { riepilogoFornitore } from "@/lib/fatturazione/riepilogoFornitoreRicevuta";

describe("riepilogo complessivo del fornitore", () => {
  it("somma le fatture una sola volta e sottrae le note di credito solo dal fatturato", () => {
    const risultato = riepilogoFornitore([
      { id: "1", tipo_documento: "TD01", stato: "letta", totale_documento: 1000, pagatoFattura: 300, residuoFattura: 700 },
      { id: "2", tipo_documento: "TD01", stato: "letta", totale_documento: 600, pagatoFattura: 100, residuoFattura: 500 },
      { id: "3", tipo_documento: "TD04", stato: "letta", totale_documento: 100, pagatoFattura: null, residuoFattura: null },
      { id: "2", tipo_documento: "TD01", stato: "letta", totale_documento: 600, pagatoFattura: 100, residuoFattura: 500 },
      { id: "4", tipo_documento: "TD17", stato: "letta", totale_documento: 900, pagatoFattura: null, residuoFattura: null },
      { id: "5", tipo_documento: "TD01", stato: "annullata", totale_documento: 500, pagatoFattura: 0, residuoFattura: 500 },
    ]);
    expect(risultato).toMatchObject({ documenti: 3, fatturePagabili: 2,
      fatturato: { totale: 1500, daVerificare: 0 }, pagato: { totale: 400, daVerificare: 0 }, residuo: { totale: 1200, daVerificare: 0 } });
  });

  it("segnala gli importi mancanti e non li trasforma in zero", () => {
    const risultato = riepilogoFornitore([
      { id: "1", tipo_documento: "TD01", stato: "letta", totale_documento: 150, pagatoFattura: 50, residuoFattura: 100 },
      { id: "2", tipo_documento: "TD01", stato: "letta", totale_documento: null, pagatoFattura: null, residuoFattura: null },
    ]);
    expect(risultato.fatturato).toEqual({ totale: 150, daVerificare: 1 });
    expect(risultato.pagato).toEqual({ totale: 50, daVerificare: 1 });
    expect(risultato.residuo).toEqual({ totale: 100, daVerificare: 1 });
    expect(riepilogoFornitore([{ id: "3", tipo_documento: "TD01", stato: "letta", totale_documento: null, pagatoFattura: null, residuoFattura: null }]).residuo)
      .toEqual({ totale: null, daVerificare: 1 });
  });

  it("usa i centesimi e accetta note di credito negative o positive", () => {
    const risultato = riepilogoFornitore([
      { id: "1", tipo_documento: "TD01", stato: "letta", totale_documento: 0.1, pagatoFattura: 0, residuoFattura: 0.1 },
      { id: "2", tipo_documento: "TD01", stato: "letta", totale_documento: 0.2, pagatoFattura: 0, residuoFattura: 0.2 },
      { id: "3", tipo_documento: "TD08", stato: "letta", totale_documento: -0.05, pagatoFattura: null, residuoFattura: null },
    ]);
    expect(risultato.fatturato.totale).toBe(0.25);
    expect(risultato.residuo.totale).toBe(0.3);
  });
});
