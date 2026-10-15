import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyFeatureOverridesCard } from "@/components/admin/company/CompanyFeatureOverridesCard";
const state = vi.hoisted(() => ({
  error: false,
  upserts: 0,
  errors: [] as string[],
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (message: string) => state.errors.push(message),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({
      data: [
        {
          feature_key: "modulo_bagni_attivo",
          is_enabled: true,
          source: "plan_default",
        },
        {
          feature_key: "modulo_cappotto_attivo",
          is_enabled: true,
          source: "plan_default",
        },
      ],
      error: state.error ? { message: "Risoluzione non disponibile" } : null,
    }),
    from: (table: string) => {
      const result = {
        data:
          table === "platform_feature_flags"
            ? [
                {
                  key: "modulo_bagni_attivo",
                  name: "Bagni",
                  default_value: false,
                },
                {
                  key: "modulo_cappotto_attivo",
                  name: "Cappotto",
                  default_value: false,
                },
                {
                  key: "white_label",
                  name: "White label",
                  default_value: false,
                },
              ]
            : [],
        error: null as Error | null,
      };
      const query: any = {
        upsert: () => {
          state.upserts++;
          return query;
        },
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        then: (fn: any) => Promise.resolve(result).then(fn),
      };
      return query;
    },
  },
}));
afterEach(cleanup);
beforeEach(() => {
  state.error = false;
  state.upserts = 0;
  state.errors = [];
});
const open = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CompanyFeatureOverridesCard
        companyId="demo"
        companyName="Demo"
        planId="pro"
        planSlug="pro"
      />
    </QueryClientProvider>,
  );
describe("Stato funzionalità azienda", () => {
  it("usa il resolver del piano anche se il default del catalogo è spento", async () => {
    open();
    expect(
      await screen.findByRole("switch", { name: "Disponibilità Bagni" }),
    ).toBeChecked();
  });
  it("non espone un secondo interruttore white label e blocca i moduli in arrivo", async () => {
    open();
    expect(
      await screen.findByRole("switch", { name: "Disponibilità Cappotto" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("switch", { name: "Disponibilità White label" }),
    ).toBeNull();
  });
  it("distingue funzionalità attive e moduli in arrivo dalle personalizzazioni manuali", async () => {
    open();
    await screen.findByRole("switch", { name: "Disponibilità Bagni" });
    expect(screen.getByText("Attive").parentElement).toHaveTextContent("1");
    expect(screen.getByText("In arrivo / non disponibili").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Nel catalogo").parentElement).toHaveTextContent("2");
    expect(screen.getByText("0 personalizzazioni manuali")).toBeInTheDocument();
    expect(screen.queryByText(/override attivi/)).not.toBeInTheDocument();
  });
  it("se il resolver fallisce non spaccia il default per stato reale", async () => {
    state.error = true;
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile verificare",
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("un cambio disponibilità apre il riepilogo e Annulla non scrive nulla", async () => {
    open();
    fireEvent.click(
      await screen.findByRole("switch", { name: "Disponibilità Bagni" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "funzionalità bloccata",
    );
    expect(state.upserts).toBe(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.upserts).toBe(0);
  });
  it("rifiuta un prezzo negativo prima di scrivere l’override", async () => {
    open();
    await screen.findByRole("switch", { name: "Disponibilità Bagni" });
    fireEvent.click(
      within(screen.getByRole("row", { name: /Bagni/ })).getByRole("button", {
        name: "Avanzate",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Prezzo personalizzato (EUR/mese)"),
      { target: { value: "-1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salva override" }),
    );
    await waitFor(() =>
      expect(state.errors).toContain(
        "Il prezzo deve essere un importo non negativo",
      ),
    );
    expect(state.upserts).toBe(0);
  });
});
