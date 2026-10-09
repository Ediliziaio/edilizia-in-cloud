import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RapportiniDaCompilareOggi, RapportiniSospesi } from "@/components/campo/RapportiniDaFare";

/**
 * I promemoria dei rapportini nella Home. Un errore di lettura non fa sparire la scheda in silenzio (proprio con la
 * rete debole il promemoria della scadenza deve restare), e ogni riga apre il rapportino di QUEL giorno.
 */
const state = vi.hoisted(() => ({
  navigate: vi.fn(), refetch: vi.fn(), invalida: vi.fn(),
  daCompilare: { data: [] as unknown[], isLoading: false, isError: false },
  sospesi: [] as unknown[], sospesiErrore: false,
  filtri: [] as Array<[string, unknown]>,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "azienda-1" } }) }));
vi.mock("@/hooks/useCampoRapportiniDaCompilare", () => ({ useCampoRapportiniDaCompilare: () => ({ ...state.daCompilare, refetch: state.refetch }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: (c: string, v: unknown) => { state.filtri.push([c, v]); return q; }, in: () => q, lt: (c: string, v: unknown) => { state.filtri.push([c, v]); return q; }, order: async () => ({ data: state.sospesi, error: null as null }) };
  return q;
} } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => { void queryFn(); return { data: state.sospesi, isError: state.sospesiErrore, refetch: state.refetch }; },
  useQueryClient: () => ({ invalidateQueries: state.invalida }),
}));

const mancante = (order_id: string, giorno: string) => ({ order_id, data_lavoro: giorno, order_code: `C-${order_id}`, description: "Posa serramenti", ore_in_cantiere_stimate: 7 });
beforeEach(() => {
  vi.clearAllMocks(); state.daCompilare = { data: [], isLoading: false, isError: false }; state.sospesi = []; state.sospesiErrore = false; state.filtri = [];
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-06T09:00:00+02:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Da inviare (cantieri di oggi e di ieri senza rapportino)", () => {
  it("elenca i cantieri e apre il rapportino di quel giorno", () => {
    state.daCompilare = { data: [mancante("o1", "2026-10-05"), mancante("o2", "2026-10-06")], isLoading: false, isError: false };
    render(<RapportiniDaCompilareOggi />);
    expect(screen.getByText("2 rapportini da inviare")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/C-o1 · 05\/10/));
    expect(state.navigate).toHaveBeenCalledWith("/campo/lavoro/o1/rapportino?data=2026-10-05");
  });

  it("non c'è niente da inviare: non c'è nemmeno la scheda", () => {
    const { container } = render(<RapportiniDaCompilareOggi />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mentre carica non mostra niente", () => {
    state.daCompilare = { data: [], isLoading: true, isError: false };
    const { container } = render(<RapportiniDaCompilareOggi />);
    expect(container).toBeEmptyDOMElement();
  });

  it("se la lettura fallisce NON sparisce: dice che non riesce a controllare, e si può riprovare (anche i sospesi)", () => {
    state.daCompilare = { data: [], isLoading: false, isError: true };
    render(<RapportiniDaCompilareOggi />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a controllare se hai rapportini da inviare");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
    expect(state.invalida).toHaveBeenCalledWith({ queryKey: ["campo-rapportini-sospesi"] });
  });

  it("se c'erano dati già letti e un nuovo giro fallisce, i dati restano (non si sostituiscono con l'errore)", () => {
    state.daCompilare = { data: [mancante("o1", "2026-10-06")], isLoading: false, isError: true };
    render(<RapportiniDaCompilareOggi />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Rapportino da inviare")).toBeInTheDocument();
  });
});

describe("Da completare (giorni precedenti, bozze e respinti)", () => {
  const sospeso = (id: string, stato: string, giorno: string) => ({ id, order_id: `o-${id}`, data_lavoro: giorno, stato, order: { order_code: `C-${id}`, description: "Intonaci interni" } });

  it("un respinto si riconosce e apre il rapportino di quel giorno, già compilato", () => {
    state.sospesi = [sospeso("1", "rifiutato", "2026-10-02"), sospeso("2", "bozza", "2026-10-01")];
    render(<RapportiniSospesi />);
    expect(screen.getByText("2 rapportini da completare")).toBeInTheDocument();
    expect(screen.getByText("Respinto — da rifare")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/C-1/));
    expect(state.navigate).toHaveBeenCalledWith("/campo/lavoro/o-1/rapportino?data=2026-10-02");
  });

  it("«giorni precedenti» vuol dire prima di oggi in Italia, e solo l'azienda corrente", () => {
    render(<RapportiniSospesi />);
    expect(state.filtri).toEqual(expect.arrayContaining([["user_id", "worker"], ["company_id", "azienda-1"], ["data_lavoro", "2026-10-06"]]));
  });

  it("senza sospesi non c'è la scheda", () => {
    const { container } = render(<RapportiniSospesi />);
    expect(container).toBeEmptyDOMElement();
  });

  it("se la lettura fallisce NON sparisce: dice che non riesce a controllare, e si può riprovare", () => {
    state.sospesiErrore = true;
    render(<RapportiniSospesi />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a controllare i rapportini da completare");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("se c'erano sospesi già letti e un nuovo giro fallisce, la lista resta (non si sostituisce con l'errore)", () => {
    state.sospesi = [sospeso("1", "rifiutato", "2026-10-02")];
    state.sospesiErrore = true;
    render(<RapportiniSospesi />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("1 rapportino da completare")).toBeInTheDocument();
  });
});
