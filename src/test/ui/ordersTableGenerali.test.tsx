import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { OrdersTable } from "@/components/orders/OrdersTable";
import type { OrderWithDetails } from "@/lib/orderUtils";

/**
 * Lista commesse (30-31/10/2026): una commessa generale si apre ad albero con le sue commesse
 * sotto e i totali sommati; le commesse di una generale che non è nella pagina dicono dove stanno.
 */
afterEach(cleanup);

const riga = (id: string, codice: string, totale: number) =>
  ({ id, order_code: codice, description: `Lavoro ${codice}`, created_at: "2026-10-15", total_amount: totale, vat_rate: 0, deposit_amount: 0, balance_amount: totale, deposit_paid: false, balance_paid: false }) as OrderWithDetails;

const mappaGenerali = {
  figliePerGenerale: new Map([["g", 2], ["altra", 1]]),
  generaleDellaFiglia: new Map([
    ["a", { id: "g", etichetta: "C-014" }],
    ["b", { id: "g", etichetta: "C-014" }],
    ["x", { id: "altra", etichetta: "C-099" }],
  ]),
};

const disegna = () => render(
  <MemoryRouter>
    <OrdersTable
      orders={[riga("g", "C-014", 0), riga("a", "ODL-1", 1000), riga("b", "ODL-2", 500), riga("x", "ODL-9", 300), riga("n", "C-020", 500)]}
      onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} visibleColumns={new Set(["totalIvato"])} mappaGenerali={mappaGenerali}
    />
  </MemoryRouter>,
);

const tabella = () => screen.getByRole("table");

describe("commesse generali nella lista", () => {
  it("chiusa: le commesse dentro non sono sparse in lista, la generale ne somma gli importi", () => {
    disegna();
    expect(within(tabella()).queryByText("ODL-1")).not.toBeInTheDocument();
    const generale = within(tabella()).getByText("Generale · 2").closest("tr")!;
    expect(generale).toHaveTextContent(/1\.500,00/);
  });

  it("aperta: le commesse dentro compaiono subito sotto, senza ripetere «in C-014»", () => {
    disegna();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Apri le 2 commesse dentro" }));
    const righe = within(tabella()).getAllByRole("row").map((r) => r.textContent ?? "");
    const pos = (t: string) => righe.findIndex((r) => r.includes(t));
    expect(pos("C-014")).toBeLessThan(pos("ODL-1"));
    expect(pos("ODL-1")).toBe(pos("C-014") + 1);
    expect(within(tabella()).queryByText("in C-014")).not.toBeInTheDocument();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Chiudi le commesse dentro" }));
    expect(within(tabella()).queryByText("ODL-1")).not.toBeInTheDocument();
  });

  it("una commessa la cui generale non è nella pagina resta al suo posto e dice dov'è", () => {
    disegna();
    expect(within(tabella()).getByText("in C-099")).toBeInTheDocument();
  });

  it("senza generali la tabella non cambia", () => {
    cleanup();
    render(<MemoryRouter><OrdersTable orders={[riga("n", "C-020", 500)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} /></MemoryRouter>);
    expect(screen.queryByText(/Generale ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /commesse dentro/ })).not.toBeInTheDocument();
  });
});
