import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoCedolini from "@/pages/campo/CampoCedolini";

/**
 * I cedolini dell'operaio: un errore di lettura non deve passare per «nessun cedolino» (l'operaio leggeva che
 * l'ufficio non ne aveva caricati), e la scheda dipendente si cerca nell'azienda giusta.
 */
const state = vi.hoisted(() => ({
  scheda: { data: "emp" as string | null, isError: false }, cedolini: { data: [] as unknown[], isError: false, isLoading: false },
  rileggi: vi.fn(), filtri: [] as Array<[string, unknown]>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "azienda-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: (c: string, v: unknown) => { state.filtri.push([c, v]); return q; }, maybeSingle: async () => ({ data: { id: "emp" }, error: null as null }) };
  return q;
} } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: { queryKey: string[]; queryFn: () => Promise<unknown> }) => {
    if (queryKey[0] === "campo-emp-cedolini") { void queryFn(); return { ...state.scheda, refetch: state.rileggi }; }
    return { ...state.cedolini, refetch: state.rileggi };
  },
}));

const cedolino = (mese: number, stato = "emesso") => ({ id: `c${mese}`, mese, anno: 2026, stato, lordo: 2000, netto: 1500, ore_lavorate: 160, pdf_url: null as string | null });
beforeEach(() => { state.scheda = { data: "emp", isError: false }; state.cedolini = { data: [], isError: false, isLoading: false }; state.rileggi.mockClear(); state.filtri = []; });
afterEach(cleanup);

describe("Cedolini dell'operaio", () => {
  it("un errore di lettura NON dice «nessun cedolino»: dice di riprovare", () => {
    state.cedolini = { data: [], isError: true, isLoading: false };
    render(<CampoCedolini />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere i cedolini");
    expect(screen.queryByText("Nessun cedolino disponibile")).not.toBeInTheDocument();
    expect(screen.queryByText("Cedolini disponibili")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.rileggi).toHaveBeenCalledTimes(2);
  });

  it("anche l'errore nel cercare la scheda dipendente non diventa «nessun cedolino»", () => {
    state.scheda = { data: null, isError: true };
    render(<CampoCedolini />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Nessun cedolino disponibile")).not.toBeInTheDocument();
  });

  it("senza cedolini (e senza errori) lo dice com'è", () => {
    render(<CampoCedolini />);
    expect(screen.getByText("Nessun cedolino disponibile")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con i cedolini mostra il conto, l'ultimo e l'elenco", () => {
    state.cedolini = { data: [cedolino(9, "pagato"), cedolino(8)], isError: false, isLoading: false };
    render(<CampoCedolini />);
    expect(screen.getByText("Cedolini disponibili").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Set 2026")).toBeInTheDocument();
    expect(screen.getByText("Settembre 2026")).toBeInTheDocument();
    expect(screen.getByText("Agosto 2026")).toBeInTheDocument();
  });

  it("la scheda dipendente si cerca nell'azienda corrente: con due aziende le schede sono due", () => {
    render(<CampoCedolini />);
    expect(state.filtri).toEqual(expect.arrayContaining([["user_id", "worker"], ["company_id", "azienda-1"]]));
  });
});
