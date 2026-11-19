import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WarehouseInventoryStats from "@/components/warehouse/WarehouseInventoryStats";
import WarehouseStats from "@/components/warehouse/WarehouseStats";
import { StockItemOverview } from "@/components/warehouse/StockItemOverview";
import type { StockItem } from "@/types/warehouse";
import type { MagazzinoRiepilogo } from "@/hooks/useMagazzinoRiepilogo";

const riepilogo: MagazzinoRiepilogo = {
  righe: { in_ritardo: { n: 1, commesse: 1 }, in_magazzino: { n: 2, commesse: 1, valore: 150 }, ordinato: { n: 3, commesse: 1 }, da_ordinare: { n: 4, commesse: 1 } },
  articoli: { n: 5, con_giacenza: 3, valore: 250, senza_costo: 1, negativi: 0, sotto_scorta: 2, impegnato: 1 },
  in_arrivo: { quantita: 9, articoli: 1 },
};
const articolo = { id: "item", name: "Guaina", quantity: 12.75, quantity_reserved: 4.5, quantity_available: 8.25, unita_misura: "m²", unit_cost: 10, min_stock_level: 10 } as StockItem;

describe("Magazzino P0: riepilogo e dettaglio", () => {
  it("in attesa non mostra zeri né rassicurazioni e blocca il clic sui numeri", () => {
    render(<WarehouseInventoryStats onCardClick={vi.fn()} />);
    expect(screen.queryByText("tutto ok")).toBeNull();
    expect(screen.queryByText("magazzino vuoto")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole("status")).toHaveLength(4);
  });
  it("mantiene il filtro cliccabile e il toggle, senza mostrare importi senza permesso", () => {
    const click = vi.fn();
    const { rerender } = render(<WarehouseStats riepilogo={riepilogo.righe} activeFilter={{ kind: "all" }} onCardClick={click} canViewCosts={false} />);
    expect(screen.queryByText(/€/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "In Magazzino 2" }));
    expect(click).toHaveBeenLastCalledWith({ kind: "status", value: "in_magazzino" });
    rerender(<WarehouseStats riepilogo={riepilogo.righe} activeFilter={{ kind: "status", value: "in_magazzino" }} onCardClick={click} canViewCosts={false} />);
    fireEvent.click(screen.getByRole("button", { name: "In Magazzino 2" }));
    expect(click).toHaveBeenLastCalledWith({ kind: "all" });
  });
  it("rispetta le preferenze e il permesso sui costi per le card inventario", () => {
    render(<WarehouseInventoryStats riepilogo={riepilogo} visibleCards={["inventory_value", "low_stock"]} canViewCosts={false} />);
    expect(screen.queryByText("Valore inventario")).toBeNull();
    expect(screen.getByText("Sotto scorta")).toBeTruthy();
    expect(screen.queryByText("Articoli a stock")).toBeNull();
  });
  it("distingue fisico, impegnato e disponibile, preservando decimali e arrivi separati", () => {
    render(<MemoryRouter><StockItemOverview item={articolo} canViewCosts={false} supplierName="Fornitore demo" inArrivo={{ quantita: 15.5, ordini: [{ id: "oda", numero: "ODA-01", consegna: null }] }} /></MemoryRouter>);
    const detail = within(screen.getByRole("region", { name: "Situazione articolo" }));
    expect(detail.getByText("12,75")).toBeTruthy();
    expect(detail.getByText("4,5")).toBeTruthy();
    expect(detail.getByText("8,25")).toBeTruthy();
    expect(detail.getByText("Sotto scorta")).toBeTruthy();
    expect(detail.getByText(/15,5 m² previste, escluse/)).toBeTruthy();
    expect(detail.getByRole("link", { name: "ODA-01" }).getAttribute("href")).toBe("/azienda/ordini-acquisto/oda");
    expect(detail.queryByText("Costo unitario")).toBeNull();
  });
  it("un errore degli arrivi non viene presentato come assenza di ordini", () => {
    render(<MemoryRouter><StockItemOverview item={articolo} canViewCosts arriviUnavailable /></MemoryRouter>);
    expect(screen.getByText(/Arrivi non verificati/)).toBeTruthy();
    expect(screen.queryByText(/Nessun arrivo/)).toBeNull();
  });
});
