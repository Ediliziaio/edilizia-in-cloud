import { describe, expect, it } from "vitest";
import { materialiPrenotatiDaPrelevare, rigaMovimentoIniziale } from "@/lib/magazzino/righeMovimento";
import { warehouseResponseVerified } from "@/lib/magazzino/protocolloMovimenti";
import type { StockItem } from "@/types/warehouse";
const row = { stock_item_id: "s", name: "Pannello", reserved_for_order: 2, physical: 16, free: 14, total_reserved: 2, product_code: "", tracking_mode: "fungible" as const, unit: "mq" };
describe("Proposta del prelievo dai materiali prenotati", () => {
  it("propone il residuo prenotato, non l’intera quantità contrattuale", () => {
    expect(materialiPrenotatiDaPrelevare([row])[0].quantity).toBe(2);
  });
  it("esclude i materiali senza prenotazione residua", () => {
    expect(materialiPrenotatiDaPrelevare([{ ...row, reserved_for_order: 0 }])).toEqual([]);
  });
  it("accorpa più righe dello stesso articolo e non usa prenotazioni altrui", () => {
    const result = materialiPrenotatiDaPrelevare([row, { ...row, reserved_for_order: 1 }]);
    expect(result).toHaveLength(1); expect(result[0].quantity).toBe(3);
  });
  it("non propone quantità oltre la giacenza fisica", () => {
    expect(materialiPrenotatiDaPrelevare([{ ...row, physical: 1 }])[0].quantity).toBe(1);
  });
  it("precompila il carico con unità, identità della riga e prezzo solo se autorizzato", () => {
    const stock = { id: "s", name: "Pannello", unit_cost: 18, unita_misura: "mq", tracking_mode: "fungible" } as StockItem;
    expect(rigaMovimentoIniziale(stock, true)).toMatchObject({ stockItemId: "s", purchasePrice: 18, unitOfMeasure: "mq", quantity: 1 });
    expect(rigaMovimentoIniziale(stock, false)).not.toHaveProperty("purchasePrice");
  });
});
it("una risposta di prenotazione verifica anche riga e quantità della richiesta originale", () => {
  const id = "80000000-0000-4000-a000-000000000001", payload = { p_order_item_id: id, p_quantity: 6 };
  expect(warehouseResponseVerified("reserve", { order_item_id: id, reserved: 6 }, payload)).toBe(true);
  expect(warehouseResponseVerified("reserve", { order_item_id: id, reserved: 1 }, payload)).toBe(false);
  expect(warehouseResponseVerified("reserve", null, payload)).toBe(false);
});
