import { describe, expect, it } from "vitest";
import { economiaFasi } from "@/lib/orders/economiaFasi";

describe("previsto parziale: voci senza costo", () => {
  const fasi = [{ id: "f1", importo_venduto: 100000 }] as never;
  const materiali = [{ id: "m1", phase_id: "f1", quantity: 10, unit_price: 0, purchase_price: 50 }] as never;

  it("con voci senza costo e lavoro non assegnato il margine non c'è (non 100%)", () => {
    const e = economiaFasi({ fasi, righe: materiali, assegnazioni: [], vociPreviste: [
      { phase_id: "f1", quantita: 10, costo_manodopera: 0, costo_materiali: 0 },
      { phase_id: "f1", quantita: 5, costo_manodopera: 0, costo_materiali: 0 },
    ] });
    const f = e.perFase.get("f1")!;
    expect(f.costoPrevisto).toBe(500);
    expect(f.costoIncompleto).toBe(true);
    expect(f.vociSenzaCosto).toBe(2);
    expect(f.marginePrevistoPct).toBeNull();
  });

  it("con il lavoro previsto nelle assegnazioni il margine torna", () => {
    const e = economiaFasi({ fasi, righe: materiali, vociPreviste: [{ phase_id: "f1", quantita: 10, costo_manodopera: 0, costo_materiali: 0 }],
      assegnazioni: [{ phase_id: "f1", source: "employee", cost_preventivo: 40000, cost_consuntivo: 0 }] as never });
    const f = e.perFase.get("f1")!;
    expect(f.costoIncompleto).toBe(false);
    expect(f.marginePrevistoPct).toBe(59.5);
  });

  it("le voci con un costo non rendono parziale il previsto", () => {
    const e = economiaFasi({ fasi, righe: [], assegnazioni: [], vociPreviste: [{ phase_id: "f1", quantita: 10, costo_manodopera: 3000, costo_materiali: 0 }] });
    expect(e.perFase.get("f1")!.marginePrevistoPct).toBe(70);
  });
});
