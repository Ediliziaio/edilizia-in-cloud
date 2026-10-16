import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  OrdersFilterSidebar,
  INITIAL_FILTER_STATE,
} from "@/components/orders/OrdersFilterSidebar";
afterEach(cleanup);
describe("Conteggio dei risultati nel pannello filtri", () => {
  it("mostra il totale filtrato, non le venti righe caricate", () => {
    const props = {
      filters: INITIAL_FILTER_STATE,
      onFiltersChange: vi.fn(),
      statuses: [] as Array<{ id: string; name: string; color: string }>,
      isOpen: true,
      onClose: vi.fn(),
    };
    const view = render(<OrdersFilterSidebar {...props} ordersCount={56} />);
    expect(screen.getByText("56 commesse")).toBeInTheDocument();
    expect(screen.queryByText("20 ordini")).not.toBeInTheDocument();
    view.rerender(<OrdersFilterSidebar {...props} ordersCount={null} />);
    expect(screen.getByText("Aggiornamento…")).toBeInTheDocument();
    view.rerender(<OrdersFilterSidebar {...props} ordersCount={1} />);
    expect(screen.getByText("1 commessa")).toBeInTheDocument();
  });
});

import { OrdersFilters } from "@/components/orders/OrdersFilters";
describe("Controlli secondari dell’elenco", () => {
  it("lascia la ricerca visibile e conserva i filtri quando i comandi vengono richiusi", () => {
    const payment = vi.fn();
    render(
      <OrdersFilters
        searchQuery=""
        onSearchChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
        statuses={[]}
        yearFilter="corrente"
        onYearFilterChange={vi.fn()}
        availableYears={[2026, 2025]}
        paymentFilter="pending"
        onPaymentFilterChange={payment}
        monthFilter="all"
        onMonthFilterChange={vi.fn()}
        hasAnyFilter
        onClearAllFilters={vi.fn()}
        hideCompleted={false}
        onHideCompletedChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Filtri elenco" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("1");
    expect(
      screen.getByRole("combobox", { name: "Stato pagamento" }),
    ).toHaveTextContent("Da incassare");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("combobox", { name: "Stato pagamento" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeVisible();
    expect(payment).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(
      screen.getByRole("combobox", { name: "Stato pagamento" }),
    ).toHaveTextContent("Da incassare");
  });
});
