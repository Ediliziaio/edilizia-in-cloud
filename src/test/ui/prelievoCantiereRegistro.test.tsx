import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderWarehouseExitsCard } from "@/components/orders/OrderWarehouseExitsCard";
import WarehouseMovementsTab from "@/components/warehouse/WarehouseMovementsTab";

const date = new Date().toISOString();
const rows = vi.hoisted(() => ({
  warehouse_movements: [
    { id: "uscita", company_id: "impresa", order_id: "cantiere", stock_item_id: "tubo", performed_by: "operaio", quantity: 2.25, movement_type: "scarico" },
    { id: "altro", company_id: "impresa", order_id: "altro-cantiere", stock_item_id: "cavo", performed_by: "altro-operaio", quantity: 4, movement_type: "scarico" },
    { id: "carico", company_id: "impresa", order_id: "cantiere", stock_item_id: "cavo", performed_by: "altro-operaio", quantity: 8, movement_type: "carico" },
  ],
  warehouse_stock: [
    { id: "tubo", company_id: "impresa", name: "Tubo corrugato", unita_misura: "m" },
    { id: "cavo", company_id: "impresa", name: "Cavo", unita_misura: "m" },
  ],
  orders: [
    { id: "cantiere", company_id: "impresa", order_code: "C-064" },
    { id: "altro-cantiere", company_id: "impresa", order_code: "C-065" },
  ],
  profiles: [
    { id: "operaio", first_name: "Mario", last_name: "Rossi" },
    { id: "altro-operaio", first_name: "Anna", last_name: "Verdi" },
  ],
}));
const movimentiIniziali = rows.warehouse_movements.length;

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, canViewCosts: false }) }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://qa.example.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (request) => {
        const url = new URL(String(request));
        const table = url.pathname.split("/").at(-1) as keyof typeof rows;
        let results: Record<string, string | number>[] = rows[table];
        for (const [key, value] of url.searchParams) {
          if (value.startsWith("eq.")) results = results.filter(row => row[key] === value.slice(3));
          if (value.startsWith("in.")) results = results.filter(row => value.slice(4, -1).split(",").includes(String(row[key])));
        }
        if (table === "warehouse_movements") {
          expect(url.searchParams.get("company_id")).toBe("eq.impresa");
          expect(url.searchParams.get("select")).not.toContain("unit_cost");
          const cursore = url.searchParams.getAll("or").find(filtro => filtro.includes("id.gt."));
          const dopoId = cursore?.match(/id\.gt\.([^)]*)/)?.[1];
          const limite = Number(url.searchParams.get("limit") ?? 1000);
          results = results.filter(row => !dopoId || String(row.id) > dopoId)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .slice(0, limite)
            .map(row => ({ ...row, created_at: date }));
        }
        return Response.json(results);
      },
    },
  }) };
});

afterEach(() => {
  cleanup();
  rows.warehouse_movements.splice(movimentiIniziali);
});

describe("Prelievi e scarichi della commessa", () => {
  it("mostra i dati dello stesso scarico nella commessa e nel registro di magazzino", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrderWarehouseExitsCard companyId="impresa" orderId="cantiere" />
          <WarehouseMovementsTab companyId="impresa" warehouseFilter={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const scheda = await screen.findByRole("table", { name: "Prelievi e scarichi" });
    const scarico = within(scheda).getByRole("row", { name: /Tubo corrugato 2,25 m Mario Rossi/ });
    expect(scarico.querySelector("time")).toHaveAttribute("datetime", date);
    expect(within(scheda).queryByText("Cavo")).toBeNull();

    const registro = await screen.findByRole("table", { name: "" });
    expect(within(registro).getAllByText("Cavo")).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca nei movimenti" }), { target: { value: "mario rossi" } });
    const uscita = within(registro).getByRole("row", { name: /Scarico Tubo corrugato/ });
    expect(within(uscita).getByText("−2,25 m")).toBeInTheDocument();
    expect(within(uscita).getAllByText("Mario Rossi").length).toBeGreaterThan(0);
    expect(within(uscita).getAllByRole("link", { name: "C-064" })[0]).toHaveAttribute("href", "/azienda/ordini/cantiere");
    expect(uscita.querySelector("time")).toHaveTextContent(scarico.querySelector("time")!.textContent!);
    expect(uscita.querySelector("time")).toHaveAttribute("datetime", date);
    expect(within(registro).queryByText("Cavo")).toBeNull();
    expect(container).not.toHaveTextContent("Valore movimentato");
  });

  it("mostra tutte le uscite anche quando più movimenti hanno la stessa data e ora", async () => {
    const originale = rows.warehouse_movements[0];
    rows.warehouse_movements.push(...Array.from({ length: 21 }, (_, index) => ({
      ...originale,
      id: `uscita-${String(index).padStart(2, "0")}`,
    })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={queryClient}><OrderWarehouseExitsCard companyId="impresa" orderId="cantiere" /></QueryClientProvider>);
    const scheda = await screen.findByRole("table", { name: "Prelievi e scarichi" });
    expect(within(scheda).getAllByRole("row")).toHaveLength(21);
    fireEvent.click(screen.getByRole("button", { name: "Mostra altre uscite" }));
    await waitFor(() => expect(within(scheda).getAllByRole("row")).toHaveLength(23));
    expect(screen.queryByRole("button", { name: "Mostra altre uscite" })).toBeNull();
  });
});
