import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const m = vi.hoisted(() => ({
  eq: vi.fn(),
  or: vi.fn(),
  is: vi.fn(),
  row: {
    id: "cantiere",
    order_code: "COMM-42",
    description: "Ristrutturazione",
    client_name: "Cliente demo",
    work_address: "Via del Cantiere 42",
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-corrente" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: (...a: unknown[]) => {
          m.eq(...a);
          return q;
        },
        is: (...a: unknown[]) => {
          m.is(...a);
          return q;
        },
        order: () => q,
        limit: () => q,
        or: (s: string) => {
          m.or(s);
          return q;
        },
        single: () => Promise.resolve({ data: m.row, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [m.row], error: null }).then(resolve),
      };
      return q;
    },
  },
}));
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
const apri = (value: string | null = null, onSelection = vi.fn()) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CommessaCombobox
        value={value}
        onChange={vi.fn()}
        onSelection={onSelection}
      />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  m.eq.mockClear();
  m.or.mockClear();
  m.is.mockClear();
});
afterEach(cleanup);
describe("Ricerca commessa", () => {
  it("limita anche la commessa selezionata all'azienda corrente", async () => {
    apri("cantiere");
    await screen.findByText(/COMM-42/);
    expect(m.eq).toHaveBeenCalledWith("company_id", "azienda-corrente");
  });
  it("restituisce i dati di cantiere e cliente per compilare la copia", async () => {
    const scelta = vi.fn();
    apri(null, scelta);
    fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
    fireEvent.click(await screen.findByText("Cliente demo"));
    expect(scelta).toHaveBeenCalledWith(m.row);
    expect(m.is).toHaveBeenCalledWith("deleted_at", null);
  });
  it("cerca anche cliente e indirizzo e neutralizza la sintassi PostgREST", async () => {
    apri();
    fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
    fireEvent.change(
      screen.getByPlaceholderText("Cerca codice, cliente o cantiere…"),
      { target: { value: "Cliente, (lotto)" } },
    );
    await waitFor(() => expect(m.or).toHaveBeenCalled());
    const filtro = m.or.mock.calls.at(-1)![0];
    expect(filtro).toContain("client_name.ilike.");
    expect(filtro).toContain("work_address.ilike.");
    expect(filtro).not.toContain("(lotto)");
  });
});
