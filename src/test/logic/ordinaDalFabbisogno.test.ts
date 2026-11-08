/**
 * Ordinare dal fabbisogno su più commesse (07/11/2026): una bozza per commessa e
 * fornitore, residuo ricalcolato al momento, una bozza ferma non ferma le altre.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RigaFabbisogno } from "@/lib/acquisti/fabbisogno";

const crea = vi.fn();
const copertura = vi.fn();
const righeDb: Record<string, unknown[]> = {};

vi.mock("@/lib/orders/createMaterialPurchaseOrder", () => ({ createMaterialPurchaseOrder: (i: unknown) => crea(i) }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ loadMaterialCoverage: (c: string, ids: string[]) => copertura(c, ids) }));
vi.mock("@/integrations/supabase/client", () => {
  const q = (orderId: { v?: string }) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (col: string, v: string) => { if (col === "order_id") orderId.v = v; return b; };
    b.in = (_c: string, ids: string[]) => Promise.resolve({ data: (righeDb[orderId.v!] ?? []).filter((r) => ids.includes((r as { id: string }).id)), error: null });
    return b;
  };
  return { supabase: { from: () => q({}) } };
});

const { gruppiDaOrdinare, ordinabile, ordinaDalFabbisogno } = await import("@/lib/acquisti/ordinaDalFabbisogno");

const riga = (p: Partial<RigaFabbisogno>): RigaFabbisogno => ({
  order_item_id: "i1", order_id: "o1", commessa: "C-001", phase_id: "f1", fase: "Cappotto", name: "EPS 10 cm",
  unita_misura: "m²", supplier_id: "s1", fornitore: "Edilmarket", previsto: 100, ordinato: 0, in_bozza: 0, ricevuto: 0,
  residuo: 100, eccedenza: 0, unita_diversa: false, stato: "da_ordinare", data_serve: null, giorni_consegna: 7, ordina_entro: null, ...p,
});

describe("quali bozze nascono", () => {
  it("una per commessa e fornitore; senza fornitore o già coperti restano fuori", () => {
    const g = gruppiDaOrdinare([
      riga({ order_item_id: "a" }),
      riga({ order_item_id: "b" }),
      riga({ order_item_id: "c", supplier_id: "s2", fornitore: "Colorificio" }),
      riga({ order_item_id: "d", order_id: "o2", commessa: "C-002" }),
      riga({ order_item_id: "e", supplier_id: null }),
      riga({ order_item_id: "f", residuo: 0 }),
      riga({ order_item_id: "g", stato: "ordinato" }),
      riga({ order_item_id: "a" }),
    ]);
    expect(g.map((x) => [x.commessa, x.fornitore, x.ids])).toEqual([
      ["C-001", "Colorificio", ["c"]],
      ["C-001", "Edilmarket", ["a", "b"]],
      ["C-002", "Edilmarket", ["d"]],
    ]);
    expect(ordinabile(riga({ stato: "in_offerta" }))).toBe(true);
  });
});

describe("creare le bozze", () => {
  beforeEach(() => {
    crea.mockReset(); copertura.mockReset();
    for (const k of Object.keys(righeDb)) delete righeDb[k];
  });

  it("passa il residuo di adesso, e un errore su una commessa non ferma l'altra", async () => {
    righeDb.o1 = [{ id: "a", name: "EPS", quantity: 100, supplier_id: "s1", purchase_price: 8, vat_rate: 22, posizioni: null }];
    righeDb.o2 = [{ id: "d", name: "Rasante", quantity: 40, supplier_id: "s1", purchase_price: 12, vat_rate: 22, posizioni: null }];
    // Nel frattempo 30 m² di EPS sono finiti in un altro ordine.
    copertura.mockImplementation(async (_c: string, ids: string[]) => ids.includes("a")
      ? [{ id: "x", order_item_id: "a", quantity: 30, quantity_received: 0, unit_of_measure: null, purchase_orders: { id: "p", oda_number: "ODA-1", status: "inviato" } }]
      : []);
    crea.mockImplementation(async (i: { orderId: string }) => {
      if (i.orderId === "o1") throw new Error("Verifica prima ODA-9");
      return { poId: "po-2", n: 1 };
    });
    const esiti = await ordinaDalFabbisogno({ companyId: "az", righe: [riga({ order_item_id: "a" }), riga({ order_item_id: "d", order_id: "o2", commessa: "C-002" })] });
    expect(crea).toHaveBeenCalledTimes(2);
    expect(crea.mock.calls[0][0]).toMatchObject({ orderId: "o1", supplierId: "s1", orderCode: "C-001", items: [{ id: "a", quantity: 70 }] });
    expect(esiti.map((e) => [e.commessa, e.ok])).toEqual([["C-001", false], ["C-002", true]]);
    expect(esiti[0]).toMatchObject({ errore: "Verifica prima ODA-9" });
  });

  it("se nel frattempo è già tutto coperto, non crea niente e lo dice", async () => {
    righeDb.o1 = [{ id: "a", name: "EPS", quantity: 100, supplier_id: "s1", purchase_price: 8, vat_rate: 22, posizioni: null }];
    copertura.mockResolvedValue([{ id: "x", order_item_id: "a", quantity: 100, quantity_received: 0, unit_of_measure: null, purchase_orders: { id: "p", oda_number: "ODA-1", status: "inviato" } }]);
    const esiti = await ordinaDalFabbisogno({ companyId: "az", righe: [riga({ order_item_id: "a" })] });
    expect(crea).not.toHaveBeenCalled();
    expect(esiti[0]).toMatchObject({ ok: false, errore: expect.stringMatching(/Già coperti/) });
  });
});

describe("la pagina", () => {
  const src = readFileSync("src/pages/azienda/FabbisognoMateriali.tsx", "utf8");
  it("ordina solo chi gestisce gli acquisti; la data la cambia anche chi modifica le commesse", () => {
    expect(src).toContain("const puoOrdinare = canManagePurchasing;");
    expect(src).toContain("const puoDatare = canManagePurchasing || canEditOrders;");
  });
  it("chiede conferma e usa la funzione del database per la data", () => {
    expect(src).toContain("<AlertDialog open={conferma}");
    expect(readFileSync("src/hooks/useFabbisognoMateriali.ts", "utf8")).toContain('db.rpc("materiali_data_fabbisogno_imposta"');
  });
});
