import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/components/admin/RenderAiChiavi", () => ({ RenderAiChiavi: (): null => null }));
import { ErroriRecenti } from "@/pages/admin/PlatformHealthPage";
afterEach(() => { cleanup(); rpc.mockReset(); });
function open() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <ErroriRecenti />
  </QueryClientProvider>);
}
describe("Registro salute raggruppato", () => {
  it("mostra conteggio e causa dei blocchi senza confonderli con un guasto tecnico", async () => {
    const base = { avvenuto_il: new Date().toISOString(), primo_evento: new Date().toISOString(), azienda_nome: null as string | null, gravita: "avviso", origine: "cron", componente: "chiamata pianificata" };
    rpc.mockResolvedValue({ data: [
      { ...base, id: "credito", categoria: "azione_richiesta", numero_eventi: 1919, messaggio: "Crediti AI esauriti", codice: 402 },
      { ...base, id: "guasto", categoria: "errore_tecnico", numero_eventi: 3, messaggio: "Servizio non disponibile", codice: 503 },
    ], error: null });
    open();
    expect(await screen.findByText("1919")).toBeInTheDocument();
    expect(screen.getByText("Azione richiesta")).toBeInTheDocument();
    expect(screen.getByText("Errore tecnico")).toBeInTheDocument();
    expect(screen.getByText("Servizio non disponibile")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("admin_errori_raggruppati", { p_ore: 48, p_limit: 100 });
  });
  it("un errore di lettura non diventa 'Nessun errore' e permette di riprovare", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error("DB non raggiungibile") })
      .mockResolvedValue({ data: [], error: null });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare le segnalazioni");
    expect(screen.queryByText(/Nessun errore registrato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.getByText(/Nessun errore registrato/)).toBeInTheDocument());
  });
});
