import { describe, expect, it } from "vitest";
import { cashFlowMensileQuadro } from "@/lib/orders/cashFlowQuadro";

describe("cash flow mese per mese del documento", () => {
  it("mette rate e uscite in fila nel tempo e porta avanti il cumulato", () => {
    const righe = cashFlowMensileQuadro(
      [{ paid_date: "2026-06-07", amount: 28050 }],
      [{ pagato_il: "2026-06-10", pagato: 4800 }, { pagato_il: "2026-06-27", pagato: 20900 }],
    );
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ label: "giu '26", entrate: 28050, uscite: 25700, saldo: 2350 });
  });

  it("i mesi senza movimenti restano in elenco: il cumulato fermo racconta l'attesa", () => {
    const righe = cashFlowMensileQuadro(
      [{ paid_date: "2026-06-07", amount: 10000 }],
      [{ pagato_il: "2026-09-15", pagato: 12000 }],
    );
    expect(righe.map((r) => r.label)).toEqual(["giu '26", "lug '26", "ago '26", "set '26"]);
    expect(righe.map((r) => r.saldo)).toEqual([10000, 10000, 10000, -2000]);
  });

  it("l'incassato parziale vince sull'importo della rata", () => {
    const righe = cashFlowMensileQuadro([{ paid_date: "2026-03-01", amount: 5000, incassato: 2000 }], []);
    expect(righe[0].entrate).toBe(2000);
  });

  it("senza date di pagamento non si inventa niente", () => {
    expect(cashFlowMensileQuadro([{ paid_date: null, amount: 5000 }], [{ pagato_il: null, pagato: 100 }])).toEqual([]);
    expect(cashFlowMensileQuadro([], [])).toEqual([]);
  });

  it("l'anno gira correttamente e il tetto dei mesi è rispettato", () => {
    const righe = cashFlowMensileQuadro(
      [{ paid_date: "2025-11-10", amount: 1000 }],
      [{ pagato_il: "2026-02-10", pagato: 400 }],
    );
    expect(righe.map((r) => r.label)).toEqual(["nov '25", "dic '25", "gen '26", "feb '26"]);
    const lunga = cashFlowMensileQuadro(
      [{ paid_date: "2020-01-10", amount: 1000 }],
      [{ pagato_il: "2026-02-10", pagato: 400 }],
    );
    expect(lunga.length).toBe(36);
  });
});
