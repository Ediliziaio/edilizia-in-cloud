import { describe, expect, it } from "vitest";
import { ambitiOperativi, giorniPrevisti, previsionalePersone, vociDelSubappalto } from "@/lib/orders/previsionaleLavoro";
import { calendarioCantiere } from "@/lib/orders/sottofasi";

describe("pianificazione delle lavorazioni", () => {
  const fase = { id: "fase", faseId: "fase", nome: "Serramenti" };
  const voce = { id: "voce-1", faseId: fase.id, sottofaseId: "posatura", voceId: "v1", nome: "Posa" };
  const voce2 = { ...voce, id: "voce-2", voceId: "v2" };
  const altraFase = { id: "f2", faseId: "f2", nome: "Finiture" };
  const altraVoce = { id: "voce-3", faseId: "f2", voceId: "v3", nome: "Tinteggio" };

  it("normalizza fase e figli, ma nel computo conserva tutte le voci misurabili", () => {
    const albero = [fase, voce, voce2, altraFase, altraVoce];
    expect(ambitiOperativi([fase, voce, voce2])).toEqual([fase]);
    expect(ambitiOperativi([voce, voce2])).toEqual([voce]);
    expect(vociDelSubappalto([fase, voce], albero).sort()).toEqual(["v1", "v2"]);
    expect(vociDelSubappalto([voce], albero)).toEqual(["v1"]);
  });

  it("conta estremi, festività e fine settimana nel calendario di cantiere", () => {
    const chiusure = new Set(["2026-04-06"]);
    expect(giorniPrevisti("2026-04-03", "2026-04-07", calendarioCantiere({ sabato: false, chiusure }))).toBe(2);
    expect(giorniPrevisti("2026-04-03", "2026-04-07", calendarioCantiere({ sabato: true, chiusure }))).toBe(3);
    expect(giorniPrevisti("2026-02-30", "2026-03-02", () => true)).toBeNull();
    expect(giorniPrevisti("2026-04-07", "2026-04-03", () => true)).toBeNull();
  });

  it("ripartisce il monte ore senza contare due volte il componente di una squadra", () => {
    const persona = { id: "mario", tariffa: 25 };
    const esito = previsionalePersone([persona, persona, { id: "luca", tariffa: 30 }], 24, 3);
    expect(esito).toEqual({ costo: 1320, mancanti: 0, ripartizione: [8, 8, 8] });
    const frazioni = previsionalePersone([persona], 8, 3).ripartizione;
    expect(Math.round(frazioni.reduce((a, b) => a + b, 0) * 1e6)).toBe(8e6);
  });

  it("mantiene visibile una tariffa mancante", () => {
    expect(previsionalePersone([{ id: "mario", tariffa: 25 }, { id: "luca", tariffa: null }], 16, 1))
      .toEqual({ costo: 400, mancanti: 1, ripartizione: [16] });
  });
});
