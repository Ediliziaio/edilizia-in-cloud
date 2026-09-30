import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderSerialsTrackingCard } from "@/components/orders/OrderSerialsTrackingCard";
import type { OrderItemData } from "@/lib/orderUtils";

const query = vi.hoisted(() => vi.fn(() => ({ data: new Map() })));
vi.mock("@/hooks/warehouse/useStockUnits", () => ({ useStockUnitsByOrderItemIds: query }));
vi.mock("@/components/warehouse/AssignSerialsDialog", () => ({ AssignSerialsDialog: () => <div role="dialog">Assegna seriali</div> }));
afterEach(() => { cleanup(); query.mockClear(); });
const item: OrderItemData = {
  id: "p", name: "Pompa di calore", description: null, quantity: 1, status: "installato", position: 0,
  supplier_id: null, purchase_price: null, vat_rate: null, stock_item_id: null,
  is_paid: null, paid_date: null, payment_method: null, unit_price: null,
  discount_percent: null, standard_cost: null, article_template_id: null,
  product_code: null, categoria: null, deposit_amount: null, deposit_paid: null,
  deposit_paid_date: null, balance_amount: null, balance_paid: null,
  balance_paid_date: null, balance_expected_date: null, deposit_expected_date: null,
};
describe("Comando esplicito seriali", () => {
  it("espande il dettaglio senza caricare seriali prima dell'apertura", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[item]} />);
    expect(query).toHaveBeenLastCalledWith([]);
    const toggle = screen.getByRole("button", { name: "Apri seriali e garanzie" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(query).toHaveBeenLastCalledWith(["p"]);
    expect(screen.getByRole("button", { name: "Chiudi seriali" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Gestisci seriali" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Assegna seriali");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi seriali" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(query).toHaveBeenLastCalledWith([]);
  });
  it("non presenta un comando vuoto quando non esistono articoli tracciabili", () => {
    render(<OrderSerialsTrackingCard orderId="order" orderItems={[{ ...item, quantity: 0 }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
