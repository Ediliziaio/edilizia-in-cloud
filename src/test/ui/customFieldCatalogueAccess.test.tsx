import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";

const state = vi.hoisted(() => ({
  company: "11111111-1111-4111-8111-111111111111", permissions: {} as Record<string, boolean>,
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  rows: [] as Record<string, unknown>[], error: null as Error | null,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: state.company }, user: { id: "user" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call = { table, ops: [] as Array<[string, unknown[]]> }; state.calls.push(call);
  const q: unknown = new Proxy({}, { get(_t, key: string) {
    if (key === "then") return (ok: (v: unknown) => unknown) => {
      const range = call.ops.find(([m]) => m === "range")?.[1] ?? [0, 199];
      return Promise.resolve({ data: state.rows.slice(Number(range[0]), Number(range[1]) + 1), error: state.error }).then(ok);
    };
    if (["insert", "update", "upsert", "delete"].includes(key)) throw new Error("Questo catalogo non deve scrivere");
    return (...args: unknown[]) => { call.ops.push([key, args]); return q; };
  } }); return q;
} } }));
import { fetchFieldDefinitions, useFederatedFieldCatalogue } from "@/hooks/useFederatedFieldCatalogue";
import { FederatedFieldCatalogue } from "@/components/settings/FederatedFieldCatalogue";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}
beforeEach(() => { state.calls.length = 0; state.rows = []; state.error = null; state.company = "11111111-1111-4111-8111-111111111111"; state.permissions = { isLoading: false, canViewSettingsCustomization: true, canViewSettingsPricing: true, canViewSopralluoghi: true, canViewFirmaElettronica: true }; });
afterEach(cleanup);

describe("origini dei campi: letture delimitate e accessi", () => {
  it.each(["catalogue", "documents", "contracts", "forms"] as const)("%s filtra per azienda prima della paginazione, senza leggere valori", async source => {
    await fetchFieldDefinitions(source, state.company, new AbortController().signal);
    expect(state.calls).toHaveLength(1);
    const call = state.calls[0];
    expect(call.ops).toContainEqual(["eq", [source === "catalogue" ? "listino_macrocategorie.company_id" : "company_id", state.company]]);
    expect(call.ops).toContainEqual(["range", [0, 199]]);
    expect(call.ops.find(([m]) => m === "select")?.[1][0]).not.toMatch(/custom_field_values|header_data|file_url|contact_id|\*/);
  });
  it("sopralluoghi: include solo azienda selezionata o modelli globali esplicitamente di sistema", async () => {
    await fetchFieldDefinitions("surveys", state.company, new AbortController().signal);
    expect(state.calls[0].ops).toContainEqual(["or", [`company_id.eq.${state.company},and(is_system.eq.true,company_id.is.null)`]]);
  });
  it("documenti: sceglie la FK composita per evitare l'ambiguità fra due relazioni", async () => {
    await fetchFieldDefinitions("documents", state.company, new AbortController().signal);
    expect(state.calls[0].ops.find(([m]) => m === "select")?.[1][0]).toContain("documento_templates!documento_fields_template_company_fk!inner");
    expect(state.calls[0].ops).toContainEqual(["eq", ["documento_templates.company_id", state.company]]);
  });
  it("HR: non legge le configurazioni candidature senza permesso persone", async () => {
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    await screen.findByText(/Nessuna definizione trovata/);
    fireEvent.change(screen.getByLabelText("Origine dei campi"), { target: { value: "recruitment" } });
    expect(await screen.findByText(/serve anche il permesso/)).toBeTruthy();
    expect(state.calls.some(c => c.table === "hr_candidatura_forms")).toBe(false);
  });
  it("HR: legge soltanto le configurazioni del modulo attivo della propria azienda", async () => {
    await fetchFieldDefinitions("recruitment", state.company, new AbortController().signal);
    expect(state.calls[0].table).toBe("hr_candidatura_forms");
    expect(state.calls[0].ops).toContainEqual(["select", ["id, titolo, campi"]]);
    expect(state.calls[0].ops).toContainEqual(["eq", ["company_id", state.company]]);
    expect(state.calls[0].ops).toContainEqual(["eq", ["attivo", true]]);
  });
  it("aggiorna la fonte attiva senza caricare le altre", async () => {
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    await screen.findByText(/Nessuna definizione trovata/);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna catalogo" }));
    await waitFor(() => expect(state.calls).toHaveLength(2));
    expect(state.calls.every(c => c.table === "listino_macrocategoria_fields")).toBe(true);
  });
  it("un modello senza campi rimane selezionabile senza inventare definizioni", async () => {
    state.rows = [{ id: "vuoto", name: "Accordo senza extra", contractual_terms_text: "Nessun campo" }];
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    fireEvent.change(screen.getByLabelText("Origine dei campi"), { target: { value: "contracts" } });
    expect(await screen.findByText("Accordo senza extra · Nessun campo configurato")).toBeTruthy();
    expect(screen.getByText("0 campi trovati · 1 modello o scheda")).toBeTruthy();
  });
  it("rifiuta un ID azienda non valido prima di costruire filtri", async () => {
    await expect(fetchFieldDefinitions("surveys", "x,company_id.not.is.null", new AbortController().signal)).rejects.toThrow("Azienda");
    expect(state.calls).toHaveLength(0);
  });
  it("senza permesso del modulo non avvia letture e non mostra un falso elenco vuoto", async () => {
    state.permissions.canViewSettingsPricing = false;
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    expect(await screen.findByText(/serve anche il permesso/)).toBeTruthy();
    expect(state.calls).toHaveLength(0); expect(screen.queryByText(/Nessuna definizione trovata/)).toBeNull();
  });
  it("non carica tutte le origini all'apertura e legge quella nuova soltanto quando scelta", async () => {
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    await screen.findByText(/Nessuna definizione trovata/);
    expect(state.calls.map(c => c.table)).toEqual(["listino_macrocategoria_fields"]);
    fireEvent.change(screen.getByLabelText("Origine dei campi"), { target: { value: "documents" } });
    await waitFor(() => expect(state.calls.map(c => c.table)).toEqual(["listino_macrocategoria_fields", "documento_template_fields"]));
  });
  it("un errore remoto resta un errore: nessun conteggio zero presentato come dato reale", async () => {
    state.error = new Error("RLS denied"); render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    await screen.findByRole("alert"); expect(screen.queryByText(/Nessuna definizione trovata/)).toBeNull(); expect(screen.queryByText(/0 campi trovati/)).toBeNull();
  });
  it("i campi dello stesso nome in due modelli sono cercabili e filtrabili separatamente", async () => {
    state.rows = ["A", "B"].map(id => ({ id, macrocategoria_id: id, field_key: "materiale", field_label: "Materiale", field_type: "text", listino_macrocategorie: { nome: `Scheda ${id}` } }));
    render(<FederatedFieldCatalogue />, { wrapper: wrapper() });
    expect(await screen.findAllByText("Materiale")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Modello o scheda"), { target: { value: "B" } });
    expect(screen.getAllByText("Materiale")).toHaveLength(1);
    expect(screen.getByText("1 campo trovato · 2 modelli o schede")).toBeTruthy();
  });
  it("cambio azienda: l'hook usa una cache diversa e non riporta i dati di A su B", async () => {
    state.rows = [{ id: "a", name: "Modello A", contractual_terms_text: "{{ contratto.data_a }}" }];
    const h = renderHook(() => useFederatedFieldCatalogue("contracts", true), { wrapper: wrapper() });
    await waitFor(() => expect(h.result.current.data?.[0].name).toBe("Data a"));
    state.company = "22222222-2222-4222-8222-222222222222";
    state.rows = [{ id: "b", name: "Modello B", contractual_terms_text: "{{ contratto.data_b }}" }]; h.rerender();
    expect(h.result.current.data?.some(f => f.scope === "Modello A")).not.toBe(true);
    await waitFor(() => expect(h.result.current.data?.[0].name).toBe("Data b"));
    expect(state.calls.at(-1)?.ops).toContainEqual(["eq", ["company_id", state.company]]);
  });
  it("revoca permesso: non espone dati già presenti in cache", async () => {
    state.rows = [{ id: "a", name: "Modello A", contractual_terms_text: "{{ contratto.data_a }}" }];
    const h = renderHook(() => useFederatedFieldCatalogue("contracts", true), { wrapper: wrapper() });
    await waitFor(() => expect(h.result.current.data).toHaveLength(1));
    state.permissions = { ...state.permissions, canViewSettingsPricing: false }; h.rerender();
    expect(h.result.current.allowed).toBe(false); expect(h.result.current.data).toBeUndefined();
  });
});
