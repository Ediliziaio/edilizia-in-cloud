import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderSerialsTrackingCard } from "@/components/orders/OrderSerialsTrackingCard";
import type { OrderItemData } from "@/lib/orderUtils";

const query = vi.hoisted(() => vi.fn(() => ({ data: new Map() })));
const conSeriale = vi.hoisted(() => vi.fn(() => ({ data: new Set(["caldaia"]) })));
vi.mock("@/hooks/warehouse/useStockUnits", () => ({ useStockUnitsByOrderItemIds: query, useArticoliConSeriale: conSeriale }));
vi.mock("@/components/warehouse/AssignSerialsDialog", () => ({ AssignSerialsDialog: () => <div role="dialog">Assegna seriali</div> }));
afterEach(() => { cleanup(); query.mockClear(); });
const item: OrderItemData = {
  id: "p", name: "Pompa di calore", description: null, quantity: 1, status: "installato", position: 0,
  supplier_id: null, purchase_price: null, vat_rate: null, stock_item_id: "caldaia",
  is_paid: null, paid_date: null, payment_method: null, unit_price: null,
  discount_percent: null, standard_cost: null, article_template_id: null,
  product_code: null, categoria: null, deposit_amount: null, deposit_paid: null,
  deposit_paid_date: null, balance_amount: null, balance_paid: null,
  balance_paid_date: null, balance_expected_date: null, deposit_expected_date: null,
};
const cemento: OrderItemData = { ...item, id: "c", name: "Cemento", stock_item_id: null };

describe("Seriali e garanzie", () => {
  it("mostra subito gli articoli con matricola, e da lì si gestiscono", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[item]} />);
    expect(query).toHaveBeenLastCalledWith(["p"]);
    const tabella = screen.getByRole("table", { name: "Seriali degli articoli" });
    expect(within(tabella).getByText("Pompa di calore")).toBeInTheDocument();
    expect(within(tabella).getByText("0 / 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gestisci seriali" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Assegna seriali");
  });
  it("gli articoli senza matricola prevista restano a parte, raggiungibili", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[item, cemento]} />);
    expect(screen.queryByText("Cemento")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Altri articoli (1)" }));
    expect(screen.getByText("Cemento")).toBeInTheDocument();
  });
  it("un articolo qualsiasi con un seriale già assegnato sta con quelli da seguire", () => {
    query.mockReturnValueOnce({ data: new Map([["c", [{ id: "u" }]]]) });
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[cemento]} />);
    expect(screen.getByText("Cemento")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
  it("se nessun articolo la prevede lo dice, e gli altri restano raggiungibili", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[cemento]} />);
    expect(screen.getByText(/Nessun articolo del magazzino prevede una matricola/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Altri articoli (1)" })).toBeInTheDocument();
  });
  it("non presenta un comando vuoto quando non esistono articoli tracciabili", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[{ ...item, quantity: 0 }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("non propone seriali per lavorazioni e descrizioni riclassificate", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[{ ...item, natura_riga: "lavorazione" }, { ...item, id: "d", natura_riga: "descrizione" }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(query).toHaveBeenLastCalledWith([]);
  });
});
