import { describe, expect, it, vi } from "vitest";
import { generaPlanimetria } from "../../../supabase/functions/planimetria-genera/genera";
import { costruisciPlanimetria } from "../../../supabase/functions/planimetria-genera/costruisci";
import { leggiRispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { area } from "../../../supabase/functions/planimetria-genera/geometria";

const risposta = (sulMuro: boolean, doppia = false) => ({
  sistema: "metri", leggibile: true, altezza_m: 2.7,
  locali: [{ nome: "Studio", destinazione: "studio", contorno: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
  aperture: Array.from({ length: doppia ? 2 : 1 }, () => ({ tipo: "finestra", da: [1, sulMuro ? 0 : 1], a: [2, sulMuro ? 0 : 1] })),
  quote: [],
});
const richiesta = { ingresso: "descrizione" as const, testo: "Studio di 4 per 4 metri con una finestra" };
describe("aperture nella pianta generata", () => {
  it("porte, finestre e arredi seguono anche l'ultima stanza di una lunga fila", () => {
    const r = leggiRispostaAI({ sistema: "metri", altezza_m: 2.7,
      locali: Array.from({ length: 7 }, (_, i) => ({ nome: `Locale ${i + 1}`, contorno: [[i * 4, 0], [(i + 1) * 4, 0], [(i + 1) * 4, 4], [i * 4, 4]] })),
      aperture: [{ tipo: "porta", da: [24, 1], a: [24, 1.8] }, { tipo: "finestra", da: [28, 2], a: [28, 3.2] }],
      elementi: [{ tipo: "letto", riquadro: [24.1, 1, 25.7, 3] }], quote: [],
    }, "metri");
    const g = costruisciPlanimetria(r, { ingresso: "descrizione" });
    const stato = g.planimetria.livelli[0].fatto;
    expect(stato.aperture).toHaveLength(2);
    expect(g.generazione.aperture_da_rivedere ?? 0).toBe(0);
    expect(stato.elementi).toHaveLength(1);
    const bordo = Math.min(...stato.locali[6].contorno.map((p) => p.x));
    expect(stato.elementi[0].posizione.x - bordo).toBeCloseTo(90);
  });
  it("una parete del bagno non allunga il soggiorno né cambia le misure interne delle altre stanze", () => {
    const r = leggiRispostaAI({ sistema: "metri", altezza_m: 2.7, locali: [
      { nome: "Soggiorno", contorno: [[0, 0], [5, 0], [5, 4], [0, 4]] },
      { nome: "Camera", contorno: [[5, 0], [8.5, 0], [8.5, 4], [5, 4]] },
      { nome: "Bagno", contorno: [[0, 4], [2, 4], [2, 6.5], [0, 6.5]] },
      { nome: "Disimpegno", contorno: [[2, 4], [8.5, 4], [8.5, 5], [2, 5]] },
    ], aperture: [], quote: [] }, "metri");
    const g = costruisciPlanimetria(r, { ingresso: "descrizione" });
    expect(g.planimetria.livelli[0].fatto.locali.map((l) => Math.round(area(l.contorno)) / 10_000)).toEqual([20, 14, 5, 6.5]);
  });
  it("rilegge una finestra fuori dai muri e consegna la versione corretta", async () => {
    const modello = vi.fn(async (_messaggi: unknown, n: number) => ({ testo: JSON.stringify(risposta(n === 2)), modello: "test" }));
    const esito = await generaPlanimetria(richiesta, modello);
    expect(modello).toHaveBeenCalledTimes(2);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.pianta.planimetria.livelli[0].fatto.aperture).toHaveLength(1);
      expect(esito.pianta.generazione.aperture_da_rivedere ?? 0).toBe(0);
    }
  });
  it("un ripiego fallito conserva la prima pianta modificabile con l'avviso sulle aperture", async () => {
    const esito = await generaPlanimetria(richiesta, async (_m, n) => {
      if (n === 2) throw new Error("Timeout della seconda lettura");
      return { testo: JSON.stringify(risposta(false)), modello: "test" };
    });
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.pianta.planimetria.livelli[0].fatto.locali).toHaveLength(1);
      expect(esito.pianta.generazione.aperture_da_rivedere).toBe(1);
      expect(esito.pianta.generazione.avvisi.join(" ")).toContain("controlla che non manchi nulla");
    }
  });
  it("non rilegge oltre il budget della richiesta", async () => {
    let ora = 0;
    const modello = vi.fn(async () => ({ testo: JSON.stringify(risposta(false)), modello: "test" }));
    await generaPlanimetria(richiesta, modello, { tempoMassimoMs: 150, ora: () => ora += 100 });
    expect(modello).toHaveBeenCalledOnce();
  });
  it("due letture identiche della stessa finestra non producono né duplicati né falsi avvisi", () => {
    const g = costruisciPlanimetria(leggiRispostaAI(risposta(true, true), "metri"), { ingresso: "descrizione" });
    expect(g.planimetria.livelli[0].fatto.aperture).toHaveLength(1);
    expect(g.generazione.aperture_da_rivedere ?? 0).toBe(0);
    expect(g.generazione.avvisi.join(" ")).not.toContain("controlla che non manchi nulla");
  });
});
