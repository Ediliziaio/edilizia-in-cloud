import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { OrdersTable } from "@/components/orders/OrdersTable";
import type { OrderWithDetails } from "@/lib/orderUtils";

/** Lista commesse (30/10/2026): le generali si riconoscono e non mostrano un importo zero che sembra vero. */
afterEach(cleanup);

const riga = (id: string, codice: string, totale: number) =>
  ({ id, order_code: codice, description: `Lavoro ${codice}`, created_at: "2026-10-15", total_amount: totale, vat_rate: 0, deposit_amount: 0, balance_amount: totale, deposit_paid: false, balance_paid: false }) as OrderWithDetails;

describe("commesse generali nella lista", () => {
  it("la generale ha l'etichetta col numero di commesse e nessun importo; la figlia dice dove sta", () => {
    const mappaGenerali = {
      figliePerGenerale: new Map([["g", 2]]),
      generaleDellaFiglia: new Map([["a", { id: "g", etichetta: "C-014" }]]),
    };
    render(
      <MemoryRouter>
        <OrdersTable orders={[riga("g", "C-014", 0), riga("a", "ODL-1", 1000), riga("n", "C-020", 500)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} visibleColumns={new Set(["totalIvato"])} mappaGenerali={mappaGenerali} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Generale · 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("in C-014").length).toBeGreaterThan(0);
    const generale = screen.getAllByText("Generale · 2")[0].closest("tr")!;
    expect(generale).toHaveTextContent("—");
    expect(generale).not.toHaveTextContent("0,00");
  });

  it("senza generali la tabella non cambia", () => {
    render(<MemoryRouter><OrdersTable orders={[riga("n", "C-020", 500)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} /></MemoryRouter>);
    expect(screen.queryByText(/Generale ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^in /)).not.toBeInTheDocument();
  });
});
