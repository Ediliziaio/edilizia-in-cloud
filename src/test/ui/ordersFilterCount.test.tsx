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
describe("Filtri dell’elenco sempre disponibili", () => {
  it.each(["all", "pending"] as const)(
    "mostra i controlli senza aprire un pannello, anche con pagamento %s",
    (paymentFilter) => {
      const payment = vi.fn();
      const clear = vi.fn();
      const hideCompleted = vi.fn();
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
          paymentFilter={paymentFilter}
          onPaymentFilterChange={payment}
          monthFilter="all"
          onMonthFilterChange={vi.fn()}
          hasAnyFilter={paymentFilter !== "all"}
          onClearAllFilters={clear}
          hideCompleted={false}
          onHideCompletedChange={hideCompleted}
        />,
      );
      for (const name of [
        "Stato commessa",
        "Stato pagamento",
        "Periodo commesse",
        "Mese commesse",
      ]) {
        expect(screen.getByRole("combobox", { name })).toBeVisible();
      }
      expect(screen.getByRole("textbox")).toBeVisible();
      expect(
        screen.getByRole("combobox", { name: "Stato pagamento" }),
      ).toHaveTextContent(
        paymentFilter === "pending" ? "Da incassare" : "Tutti i pagamenti",
      );
      expect(payment).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", {
          name: "Nascondi commesse con lavori completati",
        }),
      );
      expect(hideCompleted).toHaveBeenCalledWith(true);
      if (paymentFilter !== "all") {
        fireEvent.click(
          screen.getByRole("button", { name: "Cancella tutti i filtri" }),
        );
        expect(clear).toHaveBeenCalledOnce();
      }
    },
  );
});
