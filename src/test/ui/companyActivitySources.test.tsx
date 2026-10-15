import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyActivityTab } from "@/components/admin/company/CompanyActivityTab";
const state = vi.hoisted(() => ({ fail: "" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = () => ({
        data:
          state.fail === "*" || state.fail === table
            ? null
            : table === "admin_audit_log"
              ? [
                  {
                    id: "audit-1",
                    action: "impersonation_start",
                    details: { company_name: "Demo" },
                    created_at: "2026-10-15T08:00:00Z",
                  },
                ]
              : table === "email_delivery_log"
                ? [
                    {
                      id: "mail-1",
                      subject: "Benvenuto",
                      status: "sent",
                      sent_at: "2026-10-14T08:00:00Z",
                    },
                  ]
                : [],
        error:
          state.fail === "*" || state.fail === table
            ? { message: "Fonte non disponibile" }
            : null,
      });
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        then: (fn: any) => Promise.resolve(result()).then(fn),
      };
      return q;
    },
  },
}));
afterEach(cleanup);
beforeEach(() => {
  state.fail = "";
});
const open = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CompanyActivityTab companyId="demo" />
    </QueryClientProvider>,
  );
describe("Registro operazioni: fonti e guasti", () => {
  it("include gli invii e traduce i nomi tecnici delle operazioni", async () => {
    open();
    expect(
      await screen.findByText("Invio email della piattaforma"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Accesso amministrativo all’azienda"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutti 2" })).toBeInTheDocument();
  });
  it("se una fonte fallisce segnala lo storico parziale e conserva gli altri eventi", async () => {
    state.fail = "subscription_logs";
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Registro parziale",
    );
    expect(
      screen.getByText("Invio email della piattaforma"),
    ).toBeInTheDocument();
  });
  it("se tutte le fonti falliscono non mostra un falso storico vuoto", async () => {
    state.fail = "*";
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare",
    );
    expect(screen.queryByText("Nessuna attività registrata")).toBeNull();
  });
});
