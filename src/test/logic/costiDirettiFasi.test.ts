import { describe, expect, it } from "vitest";
import { ripartisciCostiDiretti, type CostoDiretto } from "@/lib/orders/costiDirettiFasi";
import { quotaDellaCommessa } from "@/hooks/useCostiDirettiFasi";
import { economiaFasi } from "@/lib/orders/economiaFasi";

const fasi = [{ id: "a", name: "Murature" }, { id: "b", name: "Impianti" }];
const costo = (x: Partial<CostoDiretto>): CostoDiretto => ({ id: "c", importo: 100, phase_id: null, subappaltatore_id: null, tipo_fornitore: null, ...x });

describe("Costi diretti sulle fasi", () => {
  it("la fase scelta sul costo decide", () => {
    const [q] = ripartisciCostiDiretti({ costi: [costo({ phase_id: "b", subappaltatore_id: "s" })], fasi, ditte: [{ phase_id: "a", subappaltatore_id: "s", peso: 1 }] });
    expect(q).toMatchObject({ phase_id: "b", importo: 100, come: "fase" });
  });
  it("un subappaltatore va sulle sue fasi, in proporzione al previsto, e la somma resta il costo", () => {
    const q = ripartisciCostiDiretti({ costi: [costo({ subappaltatore_id: "s", tipo_fornitore: "subappalto" })], fasi, ditte: [{ phase_id: "a", subappaltatore_id: "s", peso: 300 }, { phase_id: "b", subappaltatore_id: "s", peso: 100 }] });
    expect(q.map((x) => [x.phase_id, x.importo, x.voce])).toEqual([["a", 75, "ditte"], ["b", 25, "ditte"]]);
  });
  it("senza previsto si divide in parti uguali", () => {
    const q = ripartisciCostiDiretti({ costi: [costo({ subappaltatore_id: "s" })], fasi, ditte: [{ phase_id: "a", subappaltatore_id: "s", peso: 0 }, { phase_id: "b", subappaltatore_id: "s", peso: 0 }] });
    expect(q.map((x) => x.importo)).toEqual([50, 50]);
  });
  it("senza ditta assegnata valgono le fasi del contratto, per nome", () => {
    const q = ripartisciCostiDiretti({ costi: [costo({ subappaltatore_id: "s" })], fasi, contratti: [{ subappaltatore_id: "s", righe: [{ fase: " MURATURE ", importo: 10 }, { fase: "Altro", importo: 90 }] }] });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ phase_id: "a", importo: 100, come: "contratto" });
  });
  it("quello che non trova una fase resta senza fase, mai perso", () => {
    const [q] = ripartisciCostiDiretti({ costi: [costo({ subappaltatore_id: "altro", phase_id: "cancellata" })], fasi });
    expect(q).toMatchObject({ phase_id: null, importo: 100, come: null });
  });
  it("la quota ripartita su più commesse è solo quella di questa", () => {
    expect(quotaDellaCommessa({ amount: 200, order_id: "x", allocations: [{ order_id: "o", pct: 25 }, { order_id: "x", pct: 75 }] }, "o")).toBe(50);
    expect(quotaDellaCommessa({ amount: 200, order_id: "o", allocations: [] }, "o")).toBe(200);
    expect(quotaDellaCommessa({ amount: 200, order_id: "x", allocations: [] }, "o")).toBe(0);
  });
  it("il consuntivo della fase li somma, e quelli senza fase restano separati", () => {
    const e = economiaFasi({
      fasi: [{ id: "a" }], righe: [], assegnazioni: [],
      costiDiretti: [{ phase_id: "a", voce: "ditte", importo: 1000 }, { phase_id: "a", voce: "altri", importo: 50 }, { phase_id: null, voce: "altri", importo: 7 }],
    });
    expect(e.perFase.get("a")!.costoConsuntivo).toBe(1050);
    expect(e.perFase.get("a")!.consuntivo).toMatchObject({ ditte: 1000, altri: 50 });
    expect(e.senzaFase.costoConsuntivo).toBe(7);
    expect(e.totaleFasi.costoConsuntivo).toBe(1050);
  });
});
