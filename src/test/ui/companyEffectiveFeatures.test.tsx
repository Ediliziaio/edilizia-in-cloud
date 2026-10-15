import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyFeatureOverridesCard } from "@/components/admin/company/CompanyFeatureOverridesCard";
const state = vi.hoisted(() => ({ error: false }));
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
        error: null,
      };
      const query: any = {
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
  it("se il resolver fallisce non spaccia il default per stato reale", async () => {
    state.error = true;
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile verificare",
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
