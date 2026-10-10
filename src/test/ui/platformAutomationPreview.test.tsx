import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
const calls: string[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    calls.push(table);
    const chain: any = {};
    for (const method of ["select", "eq", "neq", "is", "ilike", "or", "order", "limit"]) chain[method] = () => chain;
    chain.then = (ok: any) => Promise.resolve({ data: table === "companies"
      ? [{ id: "company", name: "Demo", status: "active", email: "admin@example.it", trial_ends_at: null }]
      : [{ id: "contact", first_name: "Mario", last_name: "Rossi", email: "mario@example.it" }], error: null }).then(ok);
    chain.insert = chain.update = () => { throw new Error("WRITES FORBIDDEN IN PREVIEW"); };
    return chain;
  } },
}));
import { TestFlowDialog } from "@/components/flow-builder/TestFlowDialog";
afterEach(() => { cleanup(); calls.length = 0; });
function mount(itemId: string, companyId = PLATFORM_ADMIN_COMPANY_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TestFlowDialog open onClose={vi.fn()} flow={null} companyId={companyId} nodes={[
    { id: "trigger", type: "trigger", data: { itemId, label: "Evento", soglia_eur: itemId === "crediti_ai_bassi" ? 5 : undefined } },
    { id: "mail", type: "action", data: { itemId: "invia_email_admin_azienda", label: "Email", oggetto: "Prova", corpo: "Ciao {{azienda.name}}" } },
  ]} edges={[{ source: "trigger", target: "mail" }]} /></QueryClientProvider>);
}
describe("platform automation preview UI", () => {
  it("uses companies for lifecycle events, typed quick inputs and no real execution", async () => {
    mount("crediti_ai_bassi");
    fireEvent.click(await screen.findByRole("button", { name: /Demo.*active/ }));
    fireEvent.change(screen.getByLabelText("Evento da simulare"), { target: { value: "trigger" } });
    fireEvent.change(screen.getByLabelText("Crediti disponibili (€)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica percorso e testi" }));
    expect(screen.getByText(/Ciao Demo/)).toBeInTheDocument();
    expect(screen.getByText(/Nessun messaggio inviato/)).toBeInTheDocument();
    expect(calls).toEqual(["companies"]);
  });
  it("a balance equal to the threshold does not preview downstream sends", async () => {
    mount("crediti_ai_bassi");
    fireEvent.click(await screen.findByRole("button", { name: /Demo.*active/ }));
    fireEvent.change(screen.getByLabelText("Evento da simulare"), { target: { value: "trigger" } });
    fireEvent.change(screen.getByLabelText("Crediti disponibili (€)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica percorso e testi" }));
    expect(screen.getByText("I dati dell’evento simulato non soddisfano i filtri.")).toBeInTheDocument();
    expect(screen.queryByText(/Ciao Demo/)).not.toBeInTheDocument();
  });
  it.each([PLATFORM_ADMIN_COMPANY_ID, "tenant-company"])("preserves contact-based preview for CRM flows: %s", async companyId => {
    mount("contatto_creato", companyId);
    expect(await screen.findByRole("button", { name: /Mario.*Rossi.*mario@example.it/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Evento da simulare")).not.toBeInTheDocument();
    expect(calls).toEqual(["marketing_contacts"]);
  });
});
