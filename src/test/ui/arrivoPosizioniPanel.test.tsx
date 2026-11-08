import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ElencoArrivo, PosizioneArrivo } from "@/lib/arrivi/arrivoPosizioni";

const state = vi.hoisted(() => ({
  elenco: null as unknown,
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { company_id: "c" } }) }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: (): null => null }));
vi.mock("@/components/ddt/ArrivoProblemi", () => ({ ArrivoProblemi: function ArrivoProblemi() { return <div>problemi-ufficio</div>; } }));
vi.mock("@/hooks/useArrivoPosizioni", () => ({
  useElencoArrivo: () => ({ data: state.elenco, isLoading: false, error: null as unknown }),
  useRegistraSpunte: () => ({ mutate: state.mutate, isPending: state.isPending }),
}));

import { ArrivoPosizioniPanel } from "@/components/ddt/ArrivoPosizioniPanel";

const pos = (id: string, riferimento: string, parte: Partial<PosizioneArrivo> = {}): PosizioneArrivo => ({
  poi_id: id, order_item_id: `o${id}`, nome: "Finestra", descrizione: null, riferimento, gruppo_id: "g",
  misure: { larghezza_mm: 1200, altezza_mm: 1400 }, misura_tipo: null, componente: null, unita: "pz", sku: null,
  quantita: 1, ricevuta: 0, riordino: false, riordino_motivo: null, problemi: [], ...parte,
});
const elenco = (posizioni: PosizioneArrivo[], parte: Partial<ElencoArrivo> = {}): ElencoArrivo => ({
  ordine: { id: "oda", numero: "ODA-1", stato: "confermato", order_id: "ord", fornitore: "Rossi", email_fornitore: null, commessa: "C-1", cliente: null },
  puo_riordinare: false, articoli_normali: 0, posizioni, righe_bolla: [], ...parte,
});
const apri = (props = {}) => render(<MemoryRouter><ArrivoPosizioniPanel odaId="oda" {...props} /></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); state.isPending = false; });

describe("Arrivo per posizione", () => {
  it("una riga per posizione, con le quattro scelte, e cosa manca in testa", () => {
    state.elenco = elenco([pos("1", "Cucina"), pos("2", "Bagno"), pos("3", "Sala", { ricevuta: 1 })]);
    apri();
    expect(screen.getByText(/Mancano 2 posizioni/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Danneggiata" })).toHaveLength(2);
    expect(screen.getByText("Arrivata giusta")).toBeTruthy();
  });

  it("registra una sola volta anche col doppio clic", () => {
    state.elenco = elenco([pos("1", "Cucina")]);
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Arrivata" }));
    const salva = screen.getByRole("button", { name: "Salva 1 posizione" });
    fireEvent.click(salva);
    fireEvent.click(salva);
    expect(state.mutate).toHaveBeenCalledTimes(1);
    const [arg] = state.mutate.mock.calls[0];
    expect(arg.righe).toEqual([expect.objectContaining({ poi_id: "1", esito: "arrivata", quantita: 1 })]);
    expect(arg.invioId).toBeTruthy();
  });

  it("«È arrivato tutto giusto» spunta solo quello che manca", () => {
    state.elenco = elenco([pos("1", "Cucina"), pos("2", "Bagno"), pos("3", "Sala", { ricevuta: 1 })]);
    apri();
    fireEvent.click(screen.getByRole("button", { name: /È arrivato tutto giusto/ }));
    expect(screen.getByRole("button", { name: "Salva 2 posizioni" })).toBeTruthy();
  });

  it("danneggiata chiede cosa non va e la foto", () => {
    state.elenco = elenco([pos("1", "Cucina")]);
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Danneggiata" }));
    expect(screen.getByLabelText("Nota per Cucina — Finestra")).toBeTruthy();
    expect(screen.getByText("Foto")).toBeTruthy();
  });

  it("propone la riga della bolla e chi riceve può toglierla", () => {
    state.elenco = elenco([pos("1", "Cucina")], { righe_bolla: [{ id: "r", posizione: 2, codice: null, descrizione: "Finestra 1200x1400", quantita: 1, unita: null, order_item_id: null, origine: "ai" }] });
    apri({ ddtId: "d" });
    fireEvent.click(screen.getByRole("button", { name: "Arrivata" }));
    expect(screen.getByText(/Sulla bolla: riga 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salva 1 posizione" }));
    expect(state.mutate.mock.calls[0][0].righe[0].ddt_riga_id).toBe("r");
  });

  it("un pezzo rotto si chiude solo col pezzo sostitutivo", () => {
    state.elenco = elenco([pos("1", "Cucina", { problemi: [{ id: "x", esito: "danneggiata", quantita: 1, stato: "aperto", foto: [], nota: null, creato_il: "", chi: null, riordino_po_id: null, riordino_numero: null }] })]);
    apri();
    expect(screen.queryByRole("button", { name: "Arrivata" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /pezzo sostitutivo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva 1 posizione" }));
    expect(state.mutate.mock.calls[0][0].righe[0]).toMatchObject({ esito: "arrivata", sostitutivo: true });
  });

  it("l'operaio non vede reclamo e riordino; l'ufficio sì", () => {
    state.elenco = elenco([pos("1", "Cucina")]);
    const { unmount } = apri();
    expect(screen.queryByText("problemi-ufficio")).toBeNull();
    unmount();
    state.elenco = elenco([pos("1", "Cucina")], { puo_riordinare: true });
    apri();
    expect(screen.getByText("problemi-ufficio")).toBeTruthy();
  });

  it("dentro la bolla non si vede niente se non ci sono posizioni su misura", () => {
    state.elenco = elenco([]);
    const { container } = apri({ nascondiSeVuoto: true });
    expect(container.textContent).toBe("");
  });
});
