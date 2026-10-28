import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FasiUfficio, inRitardo } from "@/components/orders/FasiUfficio";
import { setupRadixMenus } from "@/test/helpers/radixMenus";
setupRadixMenus();
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  update: vi.fn(),
  insert: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  denied: false,
  readError: false,
  editable: true,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: { id: "c" },
    user: { id: "u" },
    role: state.editable ? "company_admin" : "company_staff",
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canEditOrders: state.editable,
    canEditSettingsOrders: false,
  }),
}));
vi.mock("@/lib/taskActivityLog", () => ({ logTaskActivity: vi.fn() }));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({
  PlaybookEditorDialog: (): null => null,
}));
vi.mock("@/components/attivita/TaskDetailPanel", () => ({
  TaskDetailPanel: ({ task }: { task: { id: string; title: string } }) => (
    <div role="dialog" aria-label="Dettaglio attività">
      {task.title} · {task.id}
    </div>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({
      data: [
        {
          id: "p1",
          first_name: "Anna",
          last_name: "Rossi",
          roles: ["company_staff"],
        },
      ],
      error: null as null,
    }),
    from: (table: string) => {
      let write = false;
      let added = false;
      let patch: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "range"])
        q[method] = () => q;
      q.update = (p: Record<string, unknown>) => {
        write = true;
        patch = p;
        state.update(p);
        return q;
      };
      q.insert = (p: Record<string, unknown>) => {
        added = true;
        state.insert(p);
        return q;
      };
      q.single = () => q;
      q.then = (yes: (value: unknown) => unknown) =>
        Promise.resolve(
          write
            ? { data: state.denied ? [] : [{ id: "a", ...patch }], error: null }
            : added
              ? { data: { id: "new" }, error: null }
              : table === "tasks"
                ? {
                    data: state.rows,
                    error: state.readError ? { message: "offline" } : null,
                  }
                : table === "order_work_phases"
                  ? {
                      data: [{ id: "f1", name: "Rilievo misure" }],
                      error: null,
                    }
                  : { data: [], error: null },
        ).then(yes);
      return q;
    },
  },
}));
const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "a",
  title: "Contratto",
  status: "da_fare",
  due_date: null,
  completed_at: null,
  assigned_to: "p1",
  ufficio_id: null,
  sort_order: 1,
  bloccata_da_task_id: null,
  attende_fase_id: null,
  office_stage: "avvio",
  updated_at: "2026-10-27T10:00:00Z",
  ...over,
});
const mount = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FasiUfficio orderId="o" />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.denied = false;
  state.readError = false;
  state.editable = true;
});
afterEach(cleanup);
describe("office workspace", () => {
  it("shows actual assignees, groups and office progress independently of construction", async () => {
    state.rows = [
      row({ status: "completata" }),
      row({
        id: "b",
        title: "Ordine serramenti",
        status: "in_attesa",
        attende_fase_id: "f1",
        office_stage: "acquisti",
      }),
    ];
    mount();
    expect(
      await screen.findByText("1 di 2 completate · solo attività d’ufficio"),
    ).toBeVisible();
    expect(
      screen.getByText(/Aspetta il cantiere: «Rilievo misure»/),
    ).toBeVisible();
    expect(screen.getByText("Anna Rossi")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Completa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tutte" }));
    expect(
      screen.getByRole("button", { name: "Apri attività: Contratto" }),
    ).toBeVisible();
  });
  it("completes once without claiming a nonexistent successor was unlocked", async () => {
    state.rows = [row()];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Completa" }));
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith("Attività completata"),
    );
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completata" }),
    );
  });
  it("reports a zero-row update as a failure, never as saved", async () => {
    state.rows = [row()];
    state.denied = true;
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Completa" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.success).not.toHaveBeenCalled();
  });
  it("can start a ready activity", async () => {
    state.rows = [row()];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Inizia" }));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        status: "in_corso",
        completed_at: null,
      }),
    );
  });
  it("searches without modifying source data and opens the same task detail", async () => {
    state.rows = [row()];
    mount();
    await screen.findByRole("button", { name: "Apri attività: Contratto" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca attività d’ufficio" }),
      { target: { value: "Anna" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apri attività: Contratto" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Dettaglio attività" }),
    ).toHaveTextContent("Contratto · a");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("creates a single office-scoped task in the chosen group", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Nuova attività d’ufficio" }),
    );
    const form = await screen.findByRole("dialog");
    fireEvent.change(within(form).getByLabelText("Cosa c’è da fare"), {
      target: { value: "Ordina materiali" },
    });
    fireEvent.keyDown(
      within(form).getByRole("combobox", { name: "Fase dell’ufficio" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Acquisti" }));
    fireEvent.click(
      within(form).getByRole("button", { name: "Crea attività" }),
    );
    await waitFor(() => expect(state.insert).toHaveBeenCalledOnce());
    expect(state.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_scope: "ufficio",
        office_stage: "acquisti",
        order_id: "o",
        company_id: "c",
        assigned_to: "u",
      }),
    );
  });
  it("keeps waiting tasks undated until release", async () => {
    state.rows = [row()];
    mount();
    await screen.findByRole("button", { name: "Inizia" });
    fireEvent.click(
      screen.getByRole("button", { name: "Nuova attività d’ufficio" }),
    );
    const form = await screen.findByRole("dialog");
    fireEvent.change(within(form).getByLabelText("Cosa c’è da fare"), {
      target: { value: "Ordine" },
    });
    fireEvent.keyDown(
      within(form).getByRole("combobox", { name: "Parte dopo" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Contratto" }));
    fireEvent.click(
      within(form).getByRole("button", { name: "Crea attività" }),
    );
    await waitFor(() =>
      expect(state.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "in_attesa",
          due_date: null,
          bloccata_da_task_id: "a",
          sblocco_giorni: 2,
        }),
      ),
    );
  });
  it("does not expose creation or completion to a read-only user", async () => {
    state.editable = false;
    state.rows = [row()];
    mount();
    await screen.findByRole("button", { name: "Apri attività: Contratto" });
    expect(screen.queryByRole("button", { name: "Completa" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Nuova attività d’ufficio" }),
    ).toBeNull();
  });
  it("does not replace a loading failure with an empty success state", async () => {
    state.readError = true;
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Non riesco a leggere",
    );
    expect(
      screen.queryByText("Organizza il lavoro d’ufficio della commessa"),
    ).toBeNull();
  });
  it("does not count completed or blocked tasks as overdue", () => {
    expect(
      inRitardo({ status: "da_fare", due_date: "2026-10-01" }, "2026-10-27"),
    ).toBe(true);
    expect(
      inRitardo({ status: "in_attesa", due_date: "2026-10-01" }, "2026-10-27"),
    ).toBe(false);
    expect(
      inRitardo({ status: "completata", due_date: "2026-10-01" }, "2026-10-27"),
    ).toBe(false);
  });
});
