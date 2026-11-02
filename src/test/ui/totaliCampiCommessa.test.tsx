import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TotaliCampiCommessa } from "@/components/orders/TotaliCampiCommessa";

const stato = vi.hoisted(() => ({ risposta: { data: [] as unknown[], error: null as unknown }, mobile: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => stato.risposta } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const mostra = (rapportini: unknown[] = []) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TotaliCampiCommessa orderId="o1" rapportini={rapportini as never[]} />
</QueryClientProvider>);
beforeEach(() => { stato.risposta = { data: [], error: null }; stato.mobile = false; });
afterEach(cleanup);

describe("TotaliCampiCommessa", () => {
  it("senza dati né rapportini non mostra nulla", () => {
    const { container } = mostra();
    expect(container).toBeEmptyDOMElement();
  });
  it("mostra i totali con l'unità e i sì, separando da approvare", async () => {
    stato.risposta = { data: [
      { chiave: "p", etichetta: "Pezzi posati", tipo: "number", unita: "pz", phase_id: null, fase_nome: null, approvati: 12, da_approvare: 3 },
      { chiave: "s", etichetta: "Sicurezza", tipo: "boolean", unita: null, phase_id: null, fase_nome: null, approvati: 3, da_approvare: 0 },
    ], error: null };
    mostra();
    expect(await screen.findByText("12 pz")).toBeInTheDocument();
    expect(screen.getByText("3 pz da approvare")).toBeInTheDocument();
    expect(screen.getByText("3 sì")).toBeInTheDocument();
  });
  it("nomina la fase", async () => {
    stato.risposta = { data: [{ chiave: "p", etichetta: "Pezzi", tipo: "number", unita: null, phase_id: "f", fase_nome: "Posa", approvati: 1, da_approvare: 0 }], error: null };
    mostra();
    expect(await screen.findByText("Pezzi · Posa")).toBeInTheDocument();
  });
  it("con il database senza la funzione non dà errori", async () => {
    stato.risposta = { data: null as never, error: { code: "PGRST202" } };
    const { container } = mostra();
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
  it("offre l'Excel con dei rapportini, ma non da telefono", () => {
    const { unmount } = mostra([{ data_lavoro: "2026-11-02", campi_extra: [] }]);
    expect(screen.getByRole("button", { name: "Esporta Excel" })).toBeInTheDocument();
    unmount();
    stato.mobile = true;
    mostra([{ data_lavoro: "2026-11-02", campi_extra: [] }]);
    expect(screen.queryByRole("button", { name: "Esporta Excel" })).toBeNull();
  });
});
