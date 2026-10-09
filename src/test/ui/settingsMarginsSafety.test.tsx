import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsMargini from "@/pages/azienda/settings/SettingsMargini";

const state = vi.hoisted(() => ({
  readError: false, writeError: false,
  values: { margine_minimo_percentuale: 18, margine_target_default: 30, overhead_percentuale: 8 },
  writes: [] as { table: string; value: Record<string, unknown> }[],
  error: vi.fn(), success: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: "company_admin" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, canEditSettingsPricing: true }) }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => ({ data: false, isLoading: false }), useImpostaPrezzoFinaleAMano: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: state.success } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let write = false;
  const response = () => ({
    data: write ? { id: "row-1" } : table === "preventivo_impostazioni" ? { ...state.values } : [
      { id: "c1", nome: "Ceramiche", margine_target_percentuale: 25 }, { id: "c2", nome: "Serramenti", margine_target_percentuale: 25 },
    ],
    error: (write ? state.writeError : state.readError) ? { message: "errore simulato" } : null,
  });
  const builder = {
    select: () => builder, eq: () => builder, order: () => builder,
    maybeSingle: async () => response(), single: async () => response(),
    upsert: (value: Record<string, unknown>) => { write = true; state.writes.push({ table, value }); return builder; },
    update: (value: Record<string, unknown>) => { write = true; state.writes.push({ table, value }); return builder; },
    then: (resolve: (value: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(resolve),
  };
  return builder;
} } }));
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><SettingsMargini /></MemoryRouter></QueryClientProvider>);
  return client;
}
beforeEach(() => { state.readError = false; state.writeError = false; state.writes.length = 0; state.error.mockClear(); state.success.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function loaded() { await waitFor(() => expect(screen.getByLabelText("Margine target default %")).toHaveValue(30)); }

describe("Margini: salvataggio esplicito e validazione", () => {
  it("non salva digitando, poi aggiorna soltanto il target modificato", async () => {
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine target default %"), { target: { value: "35" } });
    expect(state.writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.writes).toEqual([{ table: "preventivo_impostazioni", value: { company_id: "company-1", margine_target_default: 35 } }]);
  });
  it("non sovrascrive la bozza dopo un refetch", async () => {
    const client = open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine target default %"), { target: { value: "35" } });
    await client.refetchQueries();
    expect(screen.getByLabelText("Margine target default %")).toHaveValue(35);
    expect(state.writes).toHaveLength(0);
  });
  it("rifiuta un minimo maggiore del target", async () => {
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine minimo %"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(0);
  });
  it("mantiene la bozza quando il database rifiuta il salvataggio", async () => {
    state.writeError = true; open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine target default %"), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Margine target default %")).toHaveValue(35);
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
  });
  it("blocca modifiche quando la lettura fallisce", async () => {
    state.readError = true; open();
    await waitFor(() => expect(screen.getByLabelText("Margine target default %")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(state.writes).toHaveLength(0);
  });
  it("non perde la bozza passando a un'altra scheda se si annulla la conferma", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    open(); await loaded();
    fireEvent.change(screen.getByLabelText("Margine target default %"), { target: { value: "35" } });
    // «Apri Sconti» è un link a un'altra scheda del gruppo: con modifiche non salvate chiede conferma prima di partire.
    const evento = fireEvent.click(screen.getByRole("link", { name: "Apri Sconti" }));
    expect(conferma).toHaveBeenCalledOnce();
    expect(evento).toBe(false); // il clic è stato fermato
    expect(screen.getByLabelText("Margine target default %")).toHaveValue(35);
  });
  it("filtra le categorie senza salvare e valida prima della scrittura automatica", async () => {
    open(); await loaded();
    fireEvent.click(screen.getByText(/Margine per categoria/));
    fireEvent.change(screen.getByLabelText("Cerca una categoria"), { target: { value: "Ceram" } });
    expect(screen.queryByLabelText("Margine target Serramenti")).toBeNull();
    const input = screen.getByLabelText("Margine target Ceramiche");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.blur(input);
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.writes).toHaveLength(0);
  });
});
