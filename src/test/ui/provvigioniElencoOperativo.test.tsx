import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>>, error: false, recentCreated: false, manyRows: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: (payload: Record<string, unknown>) => { state.updates.push(payload); return { eq: async () => ({ error: null as null }) }; } }) } }));
vi.mock("@/hooks/useCommesseGenerali", () => ({ useIncassiUnita: () => ({ data: { incassi: 0, permute: 0 }, isFetching: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@tanstack/react-query", async (original) => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const order = { id: "order-1", order_code: "COMM-001", total_amount: 10000, customer: { first_name: "Cliente", last_name: "Demo" } };
    const legacy: Array<{
      id: string; salesperson_id: string; commission_type: string; commission_value: number;
      commission_amount: number; deduction_amount: number; is_paid: boolean;
      paid_date: string | null; payment_expected_date: string | null; created_at: string;
      order: typeof order; salesperson: { first_name: string; last_name: string; commission_type?: string; commission_value?: number };
    }> = [
      { id: "c1", salesperson_id: "s1", commission_type: "percentage_sold", commission_value: 3, commission_amount: 300, deduction_amount: 20, is_paid: false, paid_date: null as string | null, payment_expected_date: "2020-02-15", created_at: "2020-01-10", order, salesperson: { first_name: "Mario", last_name: "Rossi", commission_type: "percentage_sold", commission_value: 9 } },
      { id: "c2", salesperson_id: "s2", commission_type: "percentage_collected", commission_value: 2, commission_amount: 0, deduction_amount: 0, is_paid: false, paid_date: null as string | null, payment_expected_date: null, created_at: "2020-01-11", order, salesperson: { first_name: "Anna", last_name: "Verdi" } },
    ];
    if (state.recentCreated) legacy[0].created_at = new Date().toISOString();
    if (state.manyRows) {
      const sample = legacy[0]; legacy.length = 0;
      for (let i = 0; i < 26; i++) legacy.push({ ...sample, id: `c${i}`, salesperson_id: `s${i}`, salesperson: { ...sample.salesperson, first_name: `Venditore ${i}`, last_name: "Demo" } });
    }
    return { data: queryKey[0] === "orders-commissions-overview" ? legacy : [], isLoading: false, error: state.error && queryKey[0] === "orders-commissions-overview" ? new Error("offline") : null };
  } };
});
import { OrderCommissionsOverview } from "@/components/orders/OrderCommissionsOverview";
function mount(url = "/azienda/ordini?tab=provvigioni") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><OrderCommissionsOverview /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { state.updates = []; state.error = false; state.recentCreated = false; state.manyRows = false; localStorage.clear(); });
afterEach(cleanup);

describe("Elenco operativo provvigioni", () => {
  it("mostra contratto, date e regola della commessa invece del valore predefinito del venditore", () => {
    mount();
    const row = screen.getByRole("button", { name: "Mario Rossi" }).closest("tr")!;
    expect(within(row).getByText("COMM-001")).toBeVisible();
    expect(within(row).getByText("3% su venduto")).toBeVisible();
    expect(within(row).queryByText("9% su venduto")).not.toBeInTheDocument();
    expect(within(row).getByText("10/01/2020")).toBeVisible();
    expect(within(row).getByText("15/02/2020")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Pagamento previsto" })).toBeVisible();
  });
  it("apre un popup con calcolo, date e collegamento alla commessa", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Mario Rossi" }));
    const dialog = screen.getByRole("dialog", { name: "Dettaglio compenso" });
    expect(within(dialog).getByText("Base calcolata")).toBeVisible();
    expect(within(dialog).getByText("Malus e decurtazioni")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Apri commessa / contratto" })).toHaveAttribute("href", "/azienda/ordini/order-1");
  });
  it("registra solo dopo conferma, usando la data scelta", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Mario Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra pagamento" }));
    const dialog = screen.getByRole("dialog", { name: "Registra pagamento" });
    expect(state.updates).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Data del pagamento"), { target: { value: "2020-02-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Conferma pagamento/ }));
    await waitFor(() => expect(state.updates).toEqual([{ is_paid: true, paid_date: "2020-02-20" }]));
  });
  it("non propone pagamenti per una provvigione stimata", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Anna Verdi" }));
    const dialog = screen.getByRole("dialog", { name: "Dettaglio compenso" });
    expect(within(dialog).getByText("Stimata")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();
  });
  it("passa dal riepilogo venditore alle sue righe e azzera i filtri", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Per venditore / beneficiario" }));
    fireEvent.click(screen.getByRole("button", { name: "Mario Rossi" }));
    expect(screen.queryByRole("button", { name: "Anna Verdi" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getByRole("button", { name: "Anna Verdi" })).toBeVisible();
  });
  it("non consente date di pagamento future", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Mario Rossi" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra pagamento" }));
    const dialog = screen.getByRole("dialog", { name: "Registra pagamento" });
    fireEvent.change(within(dialog).getByLabelText("Data del pagamento"), { target: { value: "2999-12-31" } });
    expect(within(dialog).getByRole("button", { name: /Conferma pagamento/ })).toBeDisabled();
    expect(state.updates).toHaveLength(0);
  });
  it("filtra per la data scelta senza confondere inserimento e pagamento previsto", () => {
    state.recentCreated = true; mount();
    fireEvent.click(screen.getByRole("combobox", { name: "Periodo" }));
    fireEvent.click(screen.getByRole("option", { name: "Mese corrente" }));
    expect(screen.queryByRole("button", { name: "Mario Rossi" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Data di riferimento del periodo" }));
    fireEvent.click(screen.getByRole("option", { name: "Inserimento compenso" }));
    expect(screen.getByRole("button", { name: "Mario Rossi" })).toBeVisible();
  });
  it("pagina le righe senza ridurre il riepilogo totale", () => {
    state.manyRows = true; mount();
    expect(screen.getAllByRole("button", { name: "Apri dettaglio" })).toHaveLength(25);
    expect(screen.getByText("26 compensi · 26 beneficiari")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    expect(screen.getAllByRole("button", { name: "Apri dettaglio" })).toHaveLength(1);
    expect(screen.getByText("26 compensi · 26 beneficiari")).toBeVisible();
  });
  it("mantiene la modalità commercialista senza azioni di pagamento", () => {
    mount("/azienda/ordini?tab=provvigioni&commercialistaMode=1");
    expect(screen.queryByRole("button", { name: "Aggiungi compenso" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mario Rossi" }));
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();
  });
  it("segnala letture incomplete senza presentarle come un elenco affidabile", () => {
    state.error = true; mount();
    expect(screen.getAllByRole("alert").some(alert => alert.textContent?.includes("Gli importi potrebbero essere incompleti"))).toBe(true);
  });
});
