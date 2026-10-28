import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SicurezzaCantiere from "@/pages/azienda/SicurezzaCantiere";
const state = vi.hoisted(() => ({
  readonly: false,
  noRows: false,
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{
    table: string;
    patch: Record<string, unknown>;
    filters: unknown[][];
  }>,
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "co" }, user: { id: "u" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: true,
    solaLettura: state.readonly,
  }),
}));
vi.mock("@/hooks/useSubscriptionLimits", () => ({
  useSubscriptionLimits: () => ({ isScopriPlan: false }),
}));
vi.mock("@/components/sicurezza/PosElencoTab", () => ({
  PosElencoTab: () => null as React.ReactNode,
}));
vi.mock("@/components/sicurezza/FigureSicurezzaTab", () => ({
  FigureSicurezzaTab: () => null as React.ReactNode,
}));
vi.mock("@/components/sicurezza/DocumentiSicurezza", () => ({
  DocumentiSicurezza: () => null as React.ReactNode,
}));
vi.mock("@/components/shared/EntityCustomFieldsSection", () => ({
  EntityCustomFieldsSection: () => null as React.ReactNode,
}));
vi.mock("sonner", () => ({
  toast: { error: state.error, success: state.success },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null;
      const filters: unknown[][] = [];
      const result = () => {
        if (patch) {
          state.updates.push({ table, patch, filters });
          if (state.noRows)
            return { data: null as unknown, error: { message: "zero rows" } };
          const row = state.rows.find((r) => r.id === "a1");
          if (row) Object.assign(row, patch);
          return { data: { id: "a1" }, error: null };
        }
        return {
          data: table === "adempimenti_sicurezza" ? state.rows : [],
          error: null,
        };
      };
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          filters.push(args);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        or: () => builder,
        is: () => builder,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return builder;
        },
        single: async () => result(),
        then: (resolve: (value: unknown) => void) => resolve(result()),
      };
      return builder;
    },
  },
}));
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={["/azienda/sicurezza-cantiere?tab=scadenzario"]}
      >
        <SicurezzaCantiere />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function move() {
  await screen.findByText("Controllo test");
  fireEvent.click(
    screen.getByRole("button", { name: "Pipeline", exact: true }),
  );
  fireEvent.pointerDown(
    await screen.findByRole("button", { name: "Sposta Controllo test" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "Completati" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Conferma completamento" }),
  );
}
beforeEach(() => {
  sessionStorage.clear();
  state.readonly = false;
  state.noRows = false;
  state.rows = [
    {
      id: "a1",
      order_id: null,
      titolo: "Controllo test",
      tipo: "corso_formazione",
      scadenza_data: "2026-01-01",
      stato: "da_fare",
    },
  ];
  state.updates = [];
  state.error.mockClear();
  state.success.mockClear();
});
afterEach(cleanup);
describe("Persistenza adempimenti dalla pipeline", () => {
  it("salva il completamento con azienda e stato di partenza e ricarica la fase", async () => {
    open();
    await move();
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toMatchObject({
      table: "adempimenti_sicurezza",
      patch: { stato: "completato" },
    });
    expect(state.updates[0].filters).toContainEqual(["company_id", "co"]);
    expect(state.updates[0].filters).toContainEqual(["stato", "da_fare"]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(state.rows[0].stato).toBe("completato");
  });
  it("non dichiara completato quando l’update è rifiutato o non tocca righe", async () => {
    state.noRows = true;
    open();
    await move();
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.rows[0].stato).toBe("da_fare");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("in sola lettura la pipeline resta consultabile senza comandi di modifica", async () => {
    state.readonly = true;
    open();
    await screen.findByText("Controllo test");
    expect(
      screen.getByRole("table", { name: "Elenco Adempimenti" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aggiungi adempimento" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Sposta Controllo test" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Completa" }),
    ).not.toBeInTheDocument();
    expect(state.updates).toHaveLength(0);
  });
});
