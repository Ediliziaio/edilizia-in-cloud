/** Quadro del rapportino: provenienza del prezzo, modifica a mano, costo da completare (14/11/2026). */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  rpc: vi.fn(), insert: vi.fn(),
  permessi: { canViewOrderAmounts: true, canViewMargins: true },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => stato.rpc(...a),
    from: (t: string) => {
      if (t === "rapportino_voci_libere") return { insert: (r: unknown) => stato.insert(r), delete: () => ({ eq: async () => ({ error: null as Error | null }) }) };
      return { select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [] as unknown[] }) }), maybeSingle: async () => ({ data: null as unknown }) }) }) };
    },
  },
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" } }) }));
vi.mock("@/hooks/useCatalogoVociRapportino", () => ({ useCatalogoVociRapportino: () => ({ data: { voci: [] as unknown[], aMano: true } }) }));

import { QuadroEconomicoRapportino } from "@/components/orders/QuadroEconomicoRapportino";

const N = null as number | null;
const quadro = {
  appalto: false, a_corpo: false, registrato: false,
  persone: [
    { emp: "e1", nome: "Anna Costata", ditta: false, ore: 8, costo_orario: 25, costo: 200, unita: null as string | null, quantita: N, prezzo: N, ricavo: N },
    { emp: "e2", nome: "Marco Senzacosto", ditta: false, ore: 6, costo_orario: N, costo: N, unita: null as string | null, quantita: N, prezzo: N, ricavo: N },
  ],
  mezzi: [{ mezzo_id: "m1", nome: "Escavatore", noleggio: false, ore: 5, ore_stimate: false, costo_orario: 20, importo: 100 }],
  voci: [
    { id: "v1", descrizione: "Posa serramento", quantita: 2, unita: "pz", costo_unitario: 30, vendita_unitaria: 55, codice: "POS-01", prezzo_fonte: "committente", vendita_proposta: 45, prezzo_a_mano: true },
    { id: "v2", descrizione: "Trasporto", quantita: 1, unita: "fisso", costo_unitario: 40, vendita_unitaria: 60, codice: "TRA-01", prezzo_fonte: "generale", vendita_proposta: 60, prezzo_a_mano: false },
  ],
  costo_da_completare: [{ tipo: "persona", nome: "Marco Senzacosto", motivo: "costo orario mancante" }],
};
const listino = [
  { tariffa_id: "t1", codice: "POS-01", descrizione: "Posa serramento", unita: "pz", prezzo: 45, fonte: "committente", costo_unitario: 30, categoria: "posa" },
  { tariffa_id: "t3", codice: "SMA-01", descrizione: "Smaltimento", unita: "pz", prezzo: N, fonte: "mancante", costo_unitario: 10, categoria: "smaltimento" },
];

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <QuadroEconomicoRapportino rapportinoId="r1" puoModificare />
  </QueryClientProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  stato.permessi = { canViewOrderAmounts: true, canViewMargins: true };
  stato.rpc.mockImplementation(async (f: string) => (f === "rapportino_quadro_economico" ? { data: quadro, error: null } : { data: listino, error: null }));
  stato.insert.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Quadro economico del rapportino", () => {
  it("costo mancante: avviso, «Costo da completare», costo parziale e margine incompleto", async () => {
    disegna();
    expect(await screen.findByRole("status")).toHaveTextContent("Costo da completare: Marco Senzacosto (costo orario mancante)");
    expect(screen.getByText("Costo da completare", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Costo (parziale)")).toBeInTheDocument();
    expect(screen.getByText(/Incompleto: 1 costo da completare/)).toBeInTheDocument();
    // ore × costo orario per operai e mezzi
    expect(screen.getByText(/8 h × 25,00/)).toBeInTheDocument();
    expect(screen.getByText(/5 h × 20,00/)).toBeInTheDocument();
  });
  it("provenienza del prezzo e modifica a mano distinte", async () => {
    disegna();
    expect(await screen.findByText(/Prezzo applicato: listino committente · modificato a mano \(listino 45,00/)).toBeInTheDocument();
    expect(screen.getByText("Prezzo applicato: listino generale")).toBeInTheDocument();
  });
  it("chi non vede gli importi non vede né prezzi né provenienza", async () => {
    stato.permessi = { canViewOrderAmounts: false, canViewMargins: false };
    disegna();
    await screen.findByText("Posa serramento");
    expect(screen.queryByText(/Prezzo applicato/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ricavo/)).not.toBeInTheDocument();
  });
  it("«Aggiungi voce» cerca nel listino, propone il prezzo della regola e salva la voce per id", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Aggiungi voce/ }));
    fireEvent.change(screen.getByLabelText("Cerca nel listino"), { target: { value: "pos" } });
    fireEvent.click(await screen.findByRole("button", { name: /^POS-01\s*Posa serramento/ }));
    expect(screen.getByText(/Prezzo applicato: listino committente 45,00/)).toBeInTheDocument();
    expect(screen.getByLabelText("Vendita unitaria")).toHaveValue("45");
    fireEvent.change(screen.getByLabelText("Vendita unitaria"), { target: { value: "50" } });
    expect(screen.getByText("· prezzo modificato a mano")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(stato.insert).toHaveBeenCalledWith(expect.objectContaining({ rapportino_id: "r1", tariffa_id: "t1", vendita_unitaria: 50, descrizione: "Posa serramento" })));
    expect(stato.rpc).toHaveBeenCalledWith("rapportino_listino_cerca", { p_rapportino_id: "r1", p_testo: "pos", p_limite: 20 });
  });
  it("voce senza prezzo in nessun listino: «Prezzo da definire», si scrive a mano", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Aggiungi voce/ }));
    fireEvent.change(screen.getByLabelText("Cerca nel listino"), { target: { value: "sma" } });
    fireEvent.click(await screen.findByRole("button", { name: /^SMA-01\s*Smaltimento/ }));
    expect(screen.getByText("Prezzo da definire", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByLabelText("Vendita unitaria")).toHaveAttribute("placeholder", "Prezzo da definire");
  });
});
