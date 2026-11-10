import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
const state = vi.hoisted(() => ({ update: vi.fn(), payloads: [] as Array<unknown> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/lib/render/renderGalleryMeta", () => ({
  loadRenderGalleryMeta: vi.fn(async () => ({})),
  resolveRenderGalleryMeta: (source: { contact_id: string | null; opportunity_id: string | null }) => ({ createdByName: null as null, contactName: source.contact_id ? "Contatto demo" : null, opportunityName: source.opportunity_id ? "Opportunità demo" : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  if (table === "render_sessions") return { update: (payload: unknown) => { state.payloads.push(payload); return { eq: (key: string, id: string) => state.update(key, id) }; } };
  const rows = table === "marketing_contacts" ? [{ id: "contatto-demo", first_name: "Contatto", last_name: "demo" }] : [{ id: "opportunita-demo", name: "Opportunità demo" }];
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
  return q;
} } }));
import { RenderCrmLinker } from "@/components/render/RenderCrmLinker";
import { RenderCrmSummaryCard } from "@/components/render/RenderCrmSummaryCard";
beforeEach(() => { state.payloads = []; state.update.mockReset(); });
afterEach(cleanup);
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><RenderCrmSummaryCard contactId="contatto-demo" opportunityId="opportunita-demo" sessionId="sessione-demo" sessionTable="render_sessions" editable /></QueryClientProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Collegato a CRM/ }));
}
describe("collegamento CRM del render", () => {
  it("rimuove entrambi i collegamenti con un solo aggiornamento e blocca i doppi clic", async () => {
    let resolve!: (value: { error: null }) => void;
    state.update.mockImplementation(() => new Promise((r) => { resolve = r; }));
    setup();
    const remove = screen.getByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" });
    fireEvent.click(remove);
    fireEvent.click(remove);
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    expect(state.payloads).toEqual([{ contact_id: null, opportunity_id: null }]);
    expect(screen.getByRole("combobox", { name: "Contatto" })).toBeDisabled();
    await act(async () => resolve({ error: null }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" })).not.toBeInTheDocument());
  });
  it("conserva i collegamenti se la scrittura fallisce e consente di riprovare", async () => {
    state.update.mockResolvedValueOnce({ error: new Error("rete assente") }).mockResolvedValueOnce({ error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("collegamento CRM");
    expect(screen.getByRole("combobox", { name: "Contatto" })).toBeEnabled();
    expect(await screen.findByRole("link", { name: "Apri contatto Contatto demo" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" })).not.toBeInTheDocument());
    expect(state.update).toHaveBeenCalledTimes(2);
    expect(state.payloads).toEqual([{ contact_id: null, opportunity_id: null }, { contact_id: null, opportunity_id: null }]);
  });
  it("mantiene i due callback locali nei configuratori che non persistono subito", () => {
    const onContactChange = vi.fn();
    const onOpportunityChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RenderCrmLinker contactId="contatto-demo" opportunityId="opportunita-demo" onContactChange={onContactChange} onOpportunityChange={onOpportunityChange} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Collegato a CRM/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi collegamenti a contatto e opportunità" }));
    expect(onContactChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(onOpportunityChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(state.update).not.toHaveBeenCalled();
  });

});
