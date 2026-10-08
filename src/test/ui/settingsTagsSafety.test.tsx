import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TagsConfig } from "@/components/settings/TagsConfig";

const state = vi.hoisted(() => ({ edit: true, usageError: false, readError: false, writeError: false, writes: [] as string[], success: vi.fn(), error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, isLoading: false, canEditSettingsCustomization: state.edit }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let write = false;
  const result = () => ({ data: write ? null : table === "marketing_tags" ? [{ id: "t1", company_id: "company-1", name: "cliente caldo", color: "#3B82F6", created_at: "2026-10-08" }] : [], error: (write ? state.writeError : table === "marketing_tags" ? state.readError : state.usageError) ? { message: "errore simulato" } : null });
  const builder = { select: () => builder, eq: () => builder, not: () => builder, order: () => builder,
    insert: () => { write = true; state.writes.push(table); return builder; }, update: () => { write = true; state.writes.push(table); return builder; }, delete: () => { write = true; state.writes.push(table); return builder; }, upsert: () => { write = true; state.writes.push(table); return builder; },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }; return builder;
} } }));
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><TagsConfig /></QueryClientProvider>);
beforeEach(() => { state.edit = true; state.usageError = false; state.readError = false; state.writeError = false; state.writes.length = 0; state.success.mockClear(); state.error.mockClear(); });
afterEach(cleanup);
describe("Tag: permessi, bozze e dati", () => {
  it("in sola lettura non propone modifica, eliminazione o creazione", async () => {
    state.edit = false; open();
    await screen.findByText("cliente caldo");
    expect(screen.queryByRole("button", { name: "Modifica tag cliente caldo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina tag cliente caldo" })).toBeNull();
    expect(screen.queryByLabelText("Nuovo tag")).toBeNull();
    expect(screen.getByRole("button", { name: "Ripara collegamenti" })).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });
  it("un errore di lettura blocca creazione e riparazione", async () => {
    state.readError = true; open();
    await screen.findByText("Tag non disponibili");
    expect(screen.getByLabelText("Nuovo tag")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ripara collegamenti" })).toBeDisabled();
  });
  it("non identifica come inutilizzati i tag con conteggi non disponibili", async () => {
    state.usageError = true; open();
    await screen.findByText("Utilizzi non aggiornati");
    expect(screen.getByText("Tag non usati").parentElement).toHaveTextContent("–");
    expect(screen.getByRole("button", { name: "Elimina tag cliente caldo" })).toBeDisabled();
  });
  it("richiede conferma prima della riparazione massiva", async () => {
    open(); await screen.findByText("cliente caldo");
    fireEvent.click(screen.getByRole("button", { name: "Ripara collegamenti" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("modifica i dati dell'azienda");
    expect(state.writes).toHaveLength(0);
  });
  it("un errore di creazione mantiene il nome da correggere", async () => {
    state.writeError = true; open(); await screen.findByText("cliente caldo");
    fireEvent.change(screen.getByLabelText("Nuovo tag"), { target: { value: "Nuovo cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nuovo tag")).toHaveValue("Nuovo cliente");
    expect(state.success).not.toHaveBeenCalled();
  });
});
