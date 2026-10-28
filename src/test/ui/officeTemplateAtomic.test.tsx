import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { PlaybookEditorDialog } from "@/components/orders/PlaybookEditorDialog";
import { setupRadixMenus } from "@/test/helpers/radixMenus";
setupRadixMenus();
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  failed: false,
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error, info: vi.fn() },
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/hooks/useUffici", () => ({
  useUfficiAttivi: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const key of ["select", "eq", "is", "order", "maybeSingle"])
        q[key] = () => q;
      q.update = state.update;
      q.delete = state.remove;
      q.then = (yes: (r: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "companies"
              ? { playbook_auto_apply: false }
              : table === "order_task_template"
                ? [
                    {
                      id: "first",
                      updated_at: "2026-10-27T10:00:00Z",
                      titolo: "Contratto",
                      giorni_offset: 0,
                      giorni_dopo_sblocco: 0,
                      priorita: "normale",
                      attivo: true,
                      sort_order: 0,
                      assegna_a_utente: null,
                      assegna_a_ufficio_id: null,
                      dipende_da_id: null,
                      chiudi_su_evento: null,
                      fase_raggiunta_id: null,
                      activity_scope: "ufficio",
                      dopo_fase_lavorazione: null,
                      office_stage: "avvio",
                    },
                  ]
                : [],
          error:
            state.failed && table === "order_task_template"
              ? { message: "offline" }
              : null,
        }).then(yes);
      return q;
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.failed = false;
  state.rpc.mockResolvedValue({ data: 1, error: null });
});
afterEach(cleanup);
const mount = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PlaybookEditorDialog open companyId="company" onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
describe("workflow template transaction UI", () => {
  it("keeps advanced options collapsed and saves choices from rounded menus", async () => {
    mount();
    await screen.findByDisplayValue("Contratto");
    const summary = screen.getByText("Opzioni avanzate").closest("summary")!;
    expect(summary.parentElement).not.toHaveAttribute("open");
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Gruppo del passo 1" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Amministrazione" }),
    );
    fireEvent.click(summary);
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Priorità del passo 1" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Alta" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva flusso" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "salva_flusso_lavoro_atomico",
        expect.objectContaining({
          p_rows: [
            expect.objectContaining({
              id: "first",
              office_stage: "amministrazione",
              priorita: "alta",
            }),
          ],
        }),
      ),
    );
  });
  it("preserves the chosen predecessor and release days in the same save", async () => {
    mount();
    await screen.findByDisplayValue("Contratto");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi passo" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Titolo del passo 2" }),
      { target: { value: "Ordine materiali" } },
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Avvio del passo 2" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Dopo 1. Contratto" }),
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Giorni del passo 2" }),
      { target: { value: "3" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva flusso" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "salva_flusso_lavoro_atomico",
        expect.objectContaining({
          p_rows: [
            expect.objectContaining({ id: "first" }),
            expect.objectContaining({
              titolo: "Ordine materiali",
              dipende_da_posizione: 0,
              giorni_dopo_sblocco: 3,
            }),
          ],
        }),
      ),
    );
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("does not persist the auto-apply switch until the atomic save", async () => {
    mount();
    await screen.findByDisplayValue("Contratto");
    const toggle = screen.getAllByRole("switch")[0];
    fireEvent.click(toggle);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva flusso" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "salva_flusso_lavoro_atomico",
        expect.objectContaining({
          p_company_id: "company",
          p_auto_apply: true,
          p_expected: [{ id: "first", updated_at: "2026-10-27T10:00:00Z" }],
          p_rows: [
            expect.objectContaining({
              id: "first",
              office_stage: "avvio",
              activity_scope: "ufficio",
            }),
          ],
        }),
      ),
    );
    expect(state.remove).not.toHaveBeenCalled();
  });
  it("never falls back to destructive replacements when the RPC fails", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: new Error("Conflitto: ricarica"),
    });
    mount();
    await screen.findByDisplayValue("Contratto");
    fireEvent.click(screen.getByRole("button", { name: "Salva flusso" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.success).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Contratto")).toBeVisible();
  });
  it("disables saving if the source model failed to load", async () => {
    state.failed = true;
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Modello non disponibile",
    );
    expect(screen.getByRole("button", { name: "Salva flusso" })).toBeDisabled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
