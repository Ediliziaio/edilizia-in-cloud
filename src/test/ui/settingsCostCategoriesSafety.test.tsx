import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsCostCategories from "@/pages/azienda/settings/SettingsCostCategories";

const state = vi.hoisted(() => ({ edit: true, readError: false, usageError: false, writeError: false, writes: [] as string[], success: vi.fn(), error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, isLoading: false, canViewCosts: state.edit, solaLettura: !state.edit }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let write = false;
  const result = () => ({ data: write ? null : table === "cost_categories" ? [{ id: "c1", company_id: "company-1", name: "Materiali", color: "#6366f1", created_at: "2026-10-08" }] : [], error: (write ? state.writeError : table === "cost_categories" ? state.readError : state.usageError) ? { message: "errore simulato" } : null });
  const builder = { select: () => builder, eq: () => builder, not: () => builder, order: () => builder, single: async () => result(),
    insert: () => { write = true; state.writes.push(table); return builder; }, update: () => { write = true; state.writes.push(table); return builder; }, delete: () => { write = true; state.writes.push(table); return builder; },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }; return builder;
} } }));
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><SettingsCostCategories /></QueryClientProvider>);
beforeEach(() => { state.edit = true; state.readError = false; state.usageError = false; state.writeError = false; state.writes.length = 0; state.success.mockClear(); state.error.mockClear(); });
afterEach(cleanup);
describe("Categorie costi: storico protetto e layout", () => {
  it("un errore degli utilizzi non rende eliminabili le categorie", async () => {
    state.usageError = true; open();
    await screen.findByText("Categorie costi non disponibili");
    expect(screen.getByRole("button", { name: "Elimina Materiali" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inutilizzate" })).toBeDisabled();
    expect(screen.getByText("Non usate").closest("div.p-3")).toHaveTextContent("–");
  });
  it("senza utilizzi si può cambiare colore ma non il nome", async () => {
    state.usageError = true; open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Modifica Materiali" }));
    expect(screen.getByLabelText("Nome categoria Materiali")).toBeDisabled();
    expect(screen.getByLabelText("Colore categoria Materiali")).toBeEnabled();
  });
  it("la lettura fallita non è uno stato vuoto e blocca l'importazione", async () => {
    state.readError = true; open(); await screen.findByText("Categorie costi non disponibili");
    expect(screen.queryByText("Nessuna categoria configurata.")).toBeNull();
    expect(screen.getByLabelText("Nuova categoria")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Importa dai costi" })).toBeDisabled();
  });
  it("l'importazione richiede una conferma e non parte aprendo il dialog", async () => {
    open(); await screen.findByText("Materiali");
    fireEvent.click(screen.getByRole("button", { name: "Importa dai costi" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Non modifica i movimenti storici");
    expect(state.writes).toHaveLength(0);
  });
  it("la sola lettura non mostra comandi di modifica", async () => {
    state.edit = false; open(); await screen.findByText("Materiali");
    expect(screen.queryByRole("button", { name: "Modifica Materiali" })).toBeNull();
    expect(screen.queryByLabelText("Nuova categoria")).toBeNull();
  });
  it("una creazione fallita conserva la bozza", async () => {
    state.writeError = true; open(); await screen.findByText("Materiali");
    fireEvent.change(screen.getByLabelText("Nuova categoria"), { target: { value: "Trasferte" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nuova categoria")).toHaveValue("Trasferte");
    expect(state.success).not.toHaveBeenCalled();
  });
});
