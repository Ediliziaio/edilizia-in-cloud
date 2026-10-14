import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoLavoroDetail from "@/pages/campo/CampoLavoroDetail";

const state = vi.hoisted(() => ({ error: false, loading: false, refetch: vi.fn(), capo: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { id: "worker", company_id: "company" } }) }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isOperaio: true }) }));
vi.mock("@/hooks/useOrderDiary", () => ({ useOrderDiary: () => ({ timeline: [] as unknown[] }) }));
vi.mock("@/components/campo/NoteCantiereCampo", () => ({ NoteCantiereCampo: () : null => null }));
vi.mock("@/components/campo/ChiLavoraCampo", () => ({ ChiLavoraCampo: () : null => null }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: () : null => null }));
vi.mock("@/components/campo/FirmaPad", () => ({ FirmaPad: () => <div>Canvas firma di prova</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const history = queryKey[0] === "campo-rapportini-ordine";
    const data = queryKey[0] === "campo-lavoro" ? {
      id: "assignment", is_capocantiere: state.capo,
      order: { id: "order", order_code: "C-1", description: "Cantiere di prova", percentuale_avanzamento: 40, customer: null as null },
    } : history ? [
      { id: "daily", data_lavoro: "2026-10-12", stato: "inviato", ore_lavorate: 7, descrizione_lavori: "La giornata di posa", lavoro_completato: false },
      { id: "client", data_lavoro: "2026-10-11", stato: "inviato", ore_lavorate: 0, descrizione_lavori: "La consegna delle finestre", lavoro_completato: true, firma_cliente_url: "cliente.png", firma_cliente_nome: "Luca Bianchi" },
    ] : queryKey[0] === "campo-ruolo" ? { isCapocantiere: state.capo, esisteCapo: true, isCaposquadra: false } : undefined;
    return { data, isLoading: history && state.loading, isError: history && state.error, refetch: state.refetch };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function open(kind = "daily", tab = "rapportini") {
  return render(<MemoryRouter initialEntries={[`/campo/lavoro/order?tab=${tab}&tipo=${kind}`]}>
    <Routes><Route path="/campo/lavoro/:orderId" element={<CampoLavoroDetail />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => { state.error = false; state.loading = false; state.capo = true; vi.clearAllMocks(); });
afterEach(cleanup);

describe("Lo storico dell'app campo distingue i due lavori", () => {
  it("il cantiere non chiede più il check-in sicurezza e propone direttamente il rapportino", () => {
    open("daily", "descrizione");
    expect(screen.queryByRole("button", { name: /Sicurezza/ })).toBeNull();
    expect(screen.queryByText(/Completa la checklist/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Giornaliero" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Manda il rapportino per aggiornare commessa e diario.")).toBeInTheDocument();
  });
  it("il giornaliero non mescola i rapporti cliente e non è coperto dalla scheda Chiudi giornata", () => {
    open();
    expect(screen.getByText("La giornata di posa")).toBeInTheDocument();
    expect(screen.queryByText("La consegna delle finestre")).toBeNull();
    expect(screen.queryByText("Chiudi giornata")).toBeNull();
    expect(screen.getByRole("button", { name: "Scrivi il giornaliero" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checklist sicurezza" })).toBeNull();
  });
  it("Rapporti cliente mostra solo le conferme firmate e il percorso dedicato", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Rapporti cliente (1)" }));
    expect(screen.getByText("La consegna delle finestre")).toBeInTheDocument();
    expect(screen.getByText("Firma cliente presente · Luca Bianchi")).toBeInTheDocument();
    expect(screen.queryByText("La giornata di posa")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuovo rapporto di fine lavori" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Racconta a voce" })).toBeNull();
  });
  it("la propria firma viene spiegata senza chiedere al cliente di firmare il giornaliero", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi la tua firma" }));
    expect(screen.getByText("Firma di chi ha compilato il rapporto. Non è la firma del cliente.")).toBeInTheDocument();
  });
  it("non promette un nuovo rapporto cliente all'operaio con un capo", () => {
    state.capo = false; open("client");
    expect(screen.queryByRole("button", { name: "Nuovo rapporto di fine lavori" })).toBeNull();
    expect(screen.getByText(/gestita dal capocantiere/)).toBeInTheDocument();
  });
  it("una lettura fallita non viene presentata come storico vuoto", () => {
    state.error = true; open();
    expect(screen.getByRole("alert")).toHaveTextContent("Non significa che i rapporti siano assenti");
    fireEvent.click(screen.getByRole("button", { name: "Riprova lo storico" }));
    expect(state.refetch).toHaveBeenCalled();
  });
  it("durante il caricamento lo dice, senza mostrare una falsa assenza", () => {
    state.loading = true; open();
    expect(screen.getByRole("status")).toHaveTextContent("Carico i rapporti");
    expect(screen.queryByText("Nessun giornaliero per questo cantiere")).toBeNull();
  });
});
