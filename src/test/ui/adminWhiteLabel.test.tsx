import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TabWhiteLabel } from "@/components/admin/company/TabWhiteLabel";

const state = vi.hoisted(() => ({
  included: true,
  manual: "none",
  effective: "full",
  fail: "",
  auditFailure: false,
  mutations: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1" } }),
}));
vi.mock("@/hooks/useIncludedWhitelabel", () => ({
  useIncludedWhitelabel: () => ({
    isIncluded: state.included,
    planName: state.included ? "Pro" : "Starter",
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let values: Record<string, unknown> | null = null;
      const result = () => {
        if (state.fail === table)
          return { data: null as unknown, error: new Error("Errore di rete") };
        if (values) {
          state.mutations.push({ table, values });
          if (table === "whitelabel_audit_log")
            return {
              data: null as unknown,
              error: state.auditFailure
                ? new Error("Audit non disponibile")
                : null,
            };
          state.manual = String(
            values.whitelabel_manual_tier ?? values.whitelabel_tier,
          );
          state.effective =
            state.manual === "agency"
              ? "agency"
              : state.included
                ? "full"
                : state.manual;
          return {
            data: {
              whitelabel_tier: state.effective,
              whitelabel_manual_tier: state.manual,
            },
            error: null,
          };
        }
        return {
          data:
            table === "company_branding"
              ? {
                  whitelabel_tier: state.effective,
                  whitelabel_manual_tier: state.manual,
                  custom_domain: "crm.demo.example",
                  custom_domain_verified: false,
                }
              : table === "companies"
                ? {
                    name: "Demo",
                    subscription_plan_id: "pro",
                    white_label_enabled: true,
                    brand_platform_name: "Nome aziendale reale",
                    brand_primary_color: "#1E40AF",
                    brand_accent_color: "#DBEAFE",
                    brand_text_on_primary: "#FFFFFF",
                  }
                : table === "whitelabel_tiers"
                  ? ["none", "basic", "full", "agency"].map((slug) => ({
                      slug,
                      can_change_colors: slug !== "none",
                    }))
                  : [],
          error: null,
        };
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result(),
        single: async () => result(),
        update: (v: Record<string, unknown>) => {
          values = v;
          return chain;
        },
        insert: (v: Record<string, unknown>) => {
          values = v;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  },
}));
afterEach(cleanup);
beforeEach(() => {
  state.included = true;
  state.manual = "none";
  state.effective = "full";
  state.fail = "";
  state.auditFailure = false;
  state.mutations = [];
  vi.clearAllMocks();
});
function open(companyId = "company-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TabWhiteLabel companyId={companyId} />
    </QueryClientProvider>,
  );
}

describe("White label superadmin", () => {
  it("mostra inclusione Pro, marchio reale e dominio senza aprire l'editor", async () => {
    open();
    expect(
      await screen.findByText("Incluso nel piano Pro"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nome aziendale reale")).toBeInTheDocument();
    expect(screen.getByText("Colori standard")).toBeInTheDocument();
    expect(screen.getByText("crm.demo.example")).toBeInTheDocument();
    expect(
      screen.getByText("Nessuna operazione registrata."),
    ).toBeInTheDocument();
    expect(state.mutations).toEqual([]);
  });
  it("salva solo la concessione e registra operatore, prima e dopo; Pro resta Full", async () => {
    state.manual = "basic";
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestisci concessione" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Nessuno" }));
    expect(screen.getByRole("status")).toHaveTextContent("Full");
    fireEvent.click(screen.getByRole("button", { name: "Salva concessione" }));
    await waitFor(() => expect(state.mutations).toHaveLength(2));
    expect(state.mutations[0]).toEqual({
      table: "company_branding",
      values: {
        whitelabel_manual_tier: "none",
        whitelabel_tier: "full",
        is_active: true,
      },
    });
    expect(state.mutations[1].values).toMatchObject({
      actor_id: "admin-1",
      old_value: { tier: "full", manual_tier: "basic" },
      new_value: { tier: "full", manual_tier: "none" },
    });
    expect(state.effective).toBe("full");
  });
  it("annullare non salva e riapre la concessione originale", async () => {
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestisci concessione" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Agency" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Gestisci concessione" }),
    );
    expect(screen.getByRole("radio", { name: "Nessuno" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Salva concessione" }),
    ).toBeDisabled();
    expect(state.mutations).toEqual([]);
  });
  it("Starter segue la concessione manuale", async () => {
    state.included = false;
    state.effective = "none";
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestisci concessione" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    expect(screen.getByRole("status")).toHaveTextContent("Basic");
    fireEvent.click(screen.getByRole("button", { name: "Salva concessione" }));
    await waitFor(() => expect(state.effective).toBe("basic"));
  });
  it("blocca l'editor se i dati non vengono caricati", async () => {
    state.fail = "company_branding";
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare",
    );
    expect(
      screen.queryByRole("button", { name: "Gestisci concessione" }),
    ).toBeNull();
  });
  it("distingue un errore di storico da uno storico vuoto", async () => {
    state.fail = "whitelabel_audit_log";
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storico non disponibile",
    );
    expect(screen.queryByText("Nessuna operazione registrata.")).toBeNull();
  });
  it("mantiene la bozza se il salvataggio fallisce", async () => {
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestisci concessione" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Agency" }));
    state.fail = "company_branding";
    fireEvent.click(screen.getByRole("button", { name: "Salva concessione" }));
    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("radio", { name: "Agency" })).toBeChecked();
    expect(state.mutations).toEqual([]);
  });
  it("se lo storico fallisce segnala che il livello è comunque salvato", async () => {
    state.auditFailure = true;
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "Gestisci concessione" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Agency" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva concessione" }));
    const { toast } = await import("sonner");
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Livello salvato, ma lo storico non è stato aggiornato.",
      ),
    );
    expect(state.effective).toBe("agency");
  });
});
