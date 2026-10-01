import type { ContextType } from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { SUPER_ADMIN_EMAIL_ALLOWLIST } from "@/config/superAdmin";
import { queryKeys } from "@/lib/queryKeys";
import adminRoutesSource from "@/routes/adminRoutes.tsx?raw";
import { ADMIN_SETTINGS_NAV } from "@/config/adminSettingsNav";

type Row = Record<string, unknown>;
type Call = { table: string; operation: string; filters: [string, unknown][]; payload?: Row | Row[] };
const state = vi.hoisted(() => ({
  calls: [] as Call[], pipelines: [] as Row[], stages: [] as Row[], denyWrite: false,
  success: vi.fn(), error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const React = await import("react");
  const AuthContext = React.createContext<unknown>(null);
  return { AuthContext, useAuth: () => React.useContext(AuthContext) };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsCustomization: true }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, operation: "select", filters: [] };
      const b: Record<string, unknown> = {};
      for (const op of ["select", "order", "single"]) b[op] = () => b;
      b.eq = (key: string, value: unknown) => { call.filters.push([key, value]); return b; };
      for (const op of ["insert", "update", "delete"]) {
        b[op] = (payload: Row | Row[]) => { call.operation = op; call.payload = payload; return b; };
      }
      b.then = (ok: (value: unknown) => unknown, fail?: (error: unknown) => unknown) => {
        state.calls.push(call);
        if (state.denyWrite && call.operation !== "select") {
          return Promise.resolve({ data: null, error: new Error("Scrittura negata") }).then(ok, fail);
        }
        const rows = table === "marketing_pipelines" ? state.pipelines : state.stages;
        const matches = (row: Row) => call.filters.every(([key, value]) => row[key] === value);
        let data: unknown = null;
        if (call.operation === "select") {
          data = rows.filter(matches).map(row => table === "marketing_pipelines"
            ? { ...row, marketing_pipeline_stages: state.stages.filter(s => s.pipeline_id === row.id) }
            : { ...row });
        } else if (call.operation === "update") {
          rows.filter(matches).forEach(row => Object.assign(row, call.payload));
        } else if (call.operation === "insert") {
          const payloads = Array.isArray(call.payload) ? call.payload : [call.payload!];
          const created = payloads.map((payload, i) => ({ id: `new-${table}-${rows.length + i}`, updated_at: "2026-09-30T10:00:00Z", ...payload }));
          rows.push(...created);
          data = created[0];
        }
        return Promise.resolve({ data, error: null, count: 0 }).then(ok, fail);
      };
      return b;
    },
  },
}));

import { AuthContext } from "@/contexts/AuthContext";
import { RequireSuperAdmin } from "@/components/auth/RequireSuperAdmin";
import AdminSettingsPipelines from "@/pages/admin/settings/AdminSettingsPipelines";

function mount(role = "super_admin", email = SUPER_ADMIN_EMAIL_ALLOWLIST[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = {
    role, user: { id: "admin-test", email }, isLoading: false,
    // Una selezione azienda residua non deve MAI cambiare lo scope del CRM admin.
    effectiveCompany: { id: "azienda-cliente", name: "Cliente" },
  } as ContextType<typeof AuthContext>;
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/admin/impostazioni/sequenze"]}>
          <RequireSuperAdmin><AdminSettingsPipelines /></RequireSuperAdmin>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  state.calls = [];
  state.denyWrite = false;
  state.success.mockReset();
  state.error.mockReset();
  state.pipelines = [
    { id: "p1", name: "Vendita SaaS", company_id: PLATFORM_ADMIN_COMPANY_ID, position: 0, updated_at: "2026-09-30T10:00:00Z" },
    { id: "p-client", name: "Pipeline del cliente", company_id: "azienda-cliente", position: 0, updated_at: "2026-09-30T10:00:00Z" },
  ];
  state.stages = [{ id: "s1", pipeline_id: "p1", company_id: PLATFORM_ADMIN_COMPANY_ID, name: "Lead nuovo", position: 0, auto_status: null, win_probability: 10, stalled_threshold_days: 7 }];
});
afterEach(cleanup);

describe("Superadmin: gestione pipeline interna", () => {
  it("la route ha la protezione superadmin e compare nelle impostazioni", () => {
    expect(adminRoutesSource).toContain('path="impostazioni/sequenze" element={<RequireSuperAdmin><AdminSettingsPipelines /></RequireSuperAdmin>}');
    expect(ADMIN_SETTINGS_NAV.flatMap(group => group.items)).toContainEqual(expect.objectContaining({
      url: "/admin/impostazioni/sequenze", label: "Pipeline di vendita",
    }));
  });

  it("elenca solo pipeline interne, anche con un'azienda cliente selezionata", async () => {
    mount();
    expect(await screen.findByText("Vendita SaaS")).toBeInTheDocument();
    expect(screen.queryByText("Pipeline del cliente")).not.toBeInTheDocument();
    expect(state.calls[0].filters).toContainEqual(["company_id", PLATFORM_ADMIN_COMPANY_ID]);
    expect(screen.getByRole("link", { name: "Torna alle opportunità" })).toHaveAttribute("href", "/admin/marketing/opportunita");
  });

  it("crea pipeline e fasi esclusivamente nel CRM interno", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Crea Sequenza" }));
    fireEvent.change(screen.getByPlaceholderText("Es: Pipeline Vendita"), { target: { value: "Consulenze" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Sequenza creata con le fasi"));
    const inserts = state.calls.filter(c => c.operation === "insert");
    expect(inserts.map(c => c.table)).toEqual(["marketing_pipelines", "marketing_pipeline_stages"]);
    expect(inserts[0].payload).toMatchObject({ name: "Consulenze", company_id: PLATFORM_ADMIN_COMPANY_ID });
    expect((inserts[1].payload as Row[]).length).toBeGreaterThan(0);
    for (const row of inserts[1].payload as Row[]) expect(row.company_id).toBe(PLATFORM_ADMIN_COMPANY_ID);
  });

  it("rinomina senza toccare le pipeline delle aziende", async () => {
    mount();
    const pipeline = await screen.findByText("Vendita SaaS");
    const row = pipeline.closest("div.cursor-pointer") ?? pipeline.closest("div").parentElement!;
    fireEvent.pointerDown(within(row as HTMLElement).getByRole("button"), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rinomina" }));
    fireEvent.change(screen.getByDisplayValue("Vendita SaaS"), { target: { value: "Vendite interne" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Sequenza aggiornata"));
    expect(state.calls.find(c => c.operation === "update")).toMatchObject({
      table: "marketing_pipelines", payload: { name: "Vendite interne" },
      filters: [["id", "p1"], ["company_id", PLATFORM_ADMIN_COMPANY_ID]],
    });
    expect(state.pipelines[1].name).toBe("Pipeline del cliente");
  });

  it("modifica e aggiunge fasi, poi invalida anche la cache del Kanban", async () => {
    const qc = mount();
    const key = queryKeys.pipelines.list(PLATFORM_ADMIN_COMPANY_ID);
    qc.setQueryData(key, [{ id: "p1", name: "Vendita SaaS" }]);
    fireEvent.click(await screen.findByText("Vendita SaaS"));
    fireEvent.change(await screen.findByDisplayValue("Lead nuovo"), { target: { value: "Da contattare" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Fase" }));
    fireEvent.change(screen.getByDisplayValue("Nuova fase"), { target: { value: "Demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Fasi salvate"));
    const update = state.calls.find(c => c.table === "marketing_pipeline_stages" && c.operation === "update");
    expect(update).toMatchObject({ payload: { name: "Da contattare" }, filters: [["id", "s1"], ["company_id", PLATFORM_ADMIN_COMPANY_ID]] });
    const insert = state.calls.find(c => c.table === "marketing_pipeline_stages" && c.operation === "insert");
    expect(insert?.payload).toEqual([expect.objectContaining({ pipeline_id: "p1", company_id: PLATFORM_ADMIN_COMPANY_ID, name: "Demo" })]);
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("se il database rifiuta il salvataggio non mostra un falso successo", async () => {
    mount();
    fireEvent.click(await screen.findByText("Vendita SaaS"));
    fireEvent.change(await screen.findByDisplayValue("Lead nuovo"), { target: { value: "Da chiamare" } });
    state.denyWrite = true;
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Scrittura negata"));
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Da chiamare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
  });

  it.each(["company_admin", "platform_marketing"])("nega l'accesso diretto a %s prima di leggere i dati", async role => {
    mount(role);
    expect(await screen.findByText("Accesso riservato")).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });

  it("mantiene il controllo email del superadmin", async () => {
    mount("super_admin", "non-autorizzato@example.test");
    expect(await screen.findByText("Accesso riservato")).toBeInTheDocument();
    expect(state.calls).toEqual([]);
  });
});
