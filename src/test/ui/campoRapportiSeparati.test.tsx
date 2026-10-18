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
      order: { id: "order", order_code: "C-1", description: "Cantiere di prova", percentuale_avanzamento: 40, status: "in_corso", customer: null as null },
    } : history ? [
      { id: "daily", data_lavoro: "2026-10-12", stato: "inviato", ore_lavorate: 7, descrizione_lavori: "La giornata di posa", lavoro_completato: false },
      { id: "client", data_lavoro: "2026-10-11", stato: "inviato", ore_lavorate: 0, descrizione_lavori: "La consegna delle finestre", lavoro_completato: true, firma_cliente_url: "cliente.png", firma_cliente_nome: "Luca Bianchi" },
    ] : queryKey[0] === "campo-ruolo" ? { isCapocantiere: state.capo, esisteCapo: true, isCaposquadra: false } : undefined;
    return { data, isLoading: history && state.loading, isError: history && state.error, refetch: state.refetch };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function open(query = "tab=rapportini") {
  return render(<MemoryRouter initialEntries={[`/campo/lavoro/order?${query}`]}>
    <Routes><Route path="/campo/lavoro/:orderId" element={<CampoLavoroDetail />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => { state.error = false; state.loading = false; state.capo = true; vi.clearAllMocks(); });
afterEach(cleanup);

describe("Rapportino (operaio) e Collaudo (cliente) restano due cose separate", () => {
  it("i tab sono cinque, ognuno con un solo significato", () => {
    open("tab=descrizione");
    for (const t of ["Info", "Bolle", "Rapportini", "Collaudo", "Chat"]) {
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Documenti" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Diario" })).toBeNull();
  });

  it("la giornata ha un solo bottone: la barra in basso, senza la scheda che la ripeteva", () => {
    open("tab=descrizione");
    expect(screen.getByRole("button", { name: "Scrivi il rapportino" })).toBeInTheDocument();
    expect(screen.queryByText("Chiudi giornata")).toBeNull();
    expect(screen.queryByRole("button", { name: /Sicurezza/ })).toBeNull();
    // Lo stato si legge in parole, non in codice.
    expect(screen.getByText("In corso")).toBeInTheDocument();
  });

  it("il diario del cantiere sta in Info e si apre solo a richiesta", () => {
    open("tab=descrizione");
    expect(screen.getByRole("button", { name: /Diario del cantiere/ })).toBeInTheDocument();
  });

  it("Rapportini mostra solo i giornalieri, con un solo bottone", () => {
    open();
    expect(screen.getByText("La giornata di posa")).toBeInTheDocument();
    expect(screen.queryByText("La consegna delle finestre")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Scrivi il rapportino" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Racconta a voce" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rapporti cliente/ })).toBeNull();
  });

  it("Collaudo mostra solo quanto firmato dal cliente, con i due modi di firma", () => {
    open("tab=collaudo");
    expect(screen.getByText("La consegna delle finestre")).toBeInTheDocument();
    expect(screen.getByText("Firma cliente presente · Luca Bianchi")).toBeInTheDocument();
    expect(screen.queryByText("La giornata di posa")).toBeNull();
    expect(screen.getByRole("button", { name: "Firma col cliente in cantiere" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mandalo da firmare via email" })).toBeInTheDocument();
  });

  it("i vecchi link (rapporti cliente e documenti) portano al Collaudo", () => {
    open("tab=rapportini&tipo=client");
    expect(screen.getByRole("button", { name: "Firma col cliente in cantiere" })).toBeInTheDocument();
    cleanup();
    open("tab=documenti");
    expect(screen.getByRole("button", { name: "Firma col cliente in cantiere" })).toBeInTheDocument();
  });

  it("non promette il collaudo all'operaio che ha un capocantiere", () => {
    state.capo = false; open("tab=collaudo");
    expect(screen.queryByRole("button", { name: "Firma col cliente in cantiere" })).toBeNull();
    expect(screen.getByText(/lo fa il capocantiere/)).toBeInTheDocument();
  });

  it("la propria firma viene spiegata senza chiedere al cliente di firmare il rapportino", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi la tua firma" }));
    expect(screen.getByText("Firma di chi ha compilato il rapporto. Non è la firma del cliente.")).toBeInTheDocument();
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
    expect(screen.queryByText("Nessun rapportino per questo cantiere")).toBeNull();
  });
});
