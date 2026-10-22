import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ upsert: vi.fn(), toast: vi.fn() }));
const loan = {
  id: "mutuo-a", company_id: "demo", banca: "Banca Alfa", descrizione: "Capannone", capitale_iniziale: 200000,
  capitale_residuo: 150000, tasso_pct: 3.9, rata_mensile: 1800, durata_mesi: 120, rate_pagate: 30,
  data_inizio: "2024-01-01", data_fine: "2034-01-01", is_active: true, note: null as unknown, created_at: "", updated_at: "",
};
vi.mock("@/hooks/controlloGestione/usePFN", () => ({
  usePFN: () => ({ data: { pfn: -6611.8, componenti: { cassa: 0, banche_positive: 746294.63, banche_negative: 496182.83, mutui_mlt: 243500 } } }),
  useContiPFN: () => ({ data: [
    { id: "a", nome: "Conto 2025", saldo: -496182.83, disponibile: null, aggiornato_al: null },
    { id: "b", nome: "Conto principale", saldo: 532740.29, disponibile: 112767.6, aggiornato_al: null as unknown },
  ] }),
  useLoans: () => ({ data: [loan] }),
  useAging: () => ({ data: { totale: 164337.84, totale_scaduto: 164337.84, n_aperte: 24, n_scadute: 24, fasce: { a_scadere: 0, sc_30: 0, sc_60: 0, sc_90: 0, sc_oltre: 164337.84 }, righe: [] as unknown[] } }),
  useUpsertLoan: () => ({ mutateAsync: state.upsert, isPending: false }),
  useDeleteLoan: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
import { TabPFNDebiti } from "@/components/controllo-gestione/tabs/TabPFNDebiti";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const apri = () => render(<MemoryRouter><TabPFNDebiti anno={new Date().getFullYear()} /></MemoryRouter>);

describe("PFN & Debiti", () => {
  it("spiega il segno della PFN e usa la virgola nelle percentuali", () => {
    apri();
    expect(screen.getByText(/Cassa netta: la liquidità copre/)).toBeInTheDocument();
    expect(screen.getByText("100,9%")).toBeInTheDocument();
    expect(screen.getByText("3,90%")).toBeInTheDocument();
    expect(screen.getByText(/Totale aperto 164\.337,84/)).toBeInTheDocument();
  });

  it("mostra da quali conti vengono liquidità e scoperti, con il disponibile del Previsionale", () => {
    apri();
    expect(screen.getByText("Conto 2025")).toBeInTheDocument();
    expect(screen.getByText(/-383\.415,23/)).toBeInTheDocument();
  });

  it("«Nuovo finanziamento» dopo una modifica parte vuoto e non sovrascrive il mutuo aperto prima", async () => {
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    expect(screen.getByDisplayValue("Banca Alfa")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Nuovo finanziamento/ }));
    expect(screen.queryByDisplayValue("Banca Alfa")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi finanziamento" }));
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Controlla i dati" }));
  });
});
