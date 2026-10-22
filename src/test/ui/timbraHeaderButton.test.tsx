import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimbraHeaderButton } from "@/components/layouts/TimbraHeaderButton";

// Le pagine personali sono mockate: qui si verifica il popup «Il mio stato»
// (riepilogo + scheda giusta), non il loro contenuto (hanno i loro test).
vi.mock("@/pages/azienda/TimbraturePersonali", () => ({ default: () => <div>Pagina ore</div> }));
vi.mock("@/pages/azienda/FeriePersonali", () => ({ default: () => <div>Pagina ferie</div> }));
vi.mock("@/pages/azienda/CedoliniPersonali", () => ({ default: () => <div>Pagina cedolini</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.ruolo }) }));

const state = vi.hoisted(() => ({
  profilo: null as Record<string, unknown> | null,
  ruolo: "company_admin" as string,
  mutate: vi.fn(),
}));
vi.mock("@/hooks/useTimbratura", async () => {
  const vero = await vi.importActual<typeof import("@/hooks/useTimbratura")>("@/hooks/useTimbratura");
  return {
    calcolaOreLavorate: vero.calcolaOreLavorate,
    riepilogoMese: vero.riepilogoMese,
    useMyHrProfilo: () => ({ data: state.profilo, isLoading: false }),
    useMyTodayTimbrature: () => ({ data: [] as unknown[], isLoading: false }),
    useMyTimbratureMese: () => ({ data: [] as unknown[], isLoading: false }),
    useTimbra: () => ({ mutate: state.mutate, isPending: false }),
  };
});
vi.mock("@/hooks/useMyCedolini", () => ({
  useMyCedolini: () => ({
    employeeId: "e1", loadingEmployee: false, loadingCedolini: false,
    cedolini: [{ id: "c1", mese: 9, anno: 2026, lordo: 2100, netto: 1500, contributi_dipendente: 190, ritenute_irpef: 300, stato: "pagato", note: null as string | null, documento_id: null as string | null }],
  }),
}));

const mostra = () => render(<MemoryRouter><TimbraHeaderButton /></MemoryRouter>);

beforeEach(() => {
  state.mutate.mockReset();
  state.ruolo = "company_admin";
  state.profilo = { id: "p1", nome: "Florin", cognome: "Rossi", ore_giornaliere: 8, ferie_residue: 12, permessi_residui_ore: 16, rol_residuo_ore: 8 };
});
afterEach(cleanup);

describe("Timbra nella barra in alto", () => {
  it("timbra l'entrata con l'hook condiviso (stessa cache della scheda Ore)", () => {
    mostra();
    // Il bottone in alto dice la prossima mossa, e apre il popup (non timbra da solo).
    expect(screen.getByText("Timbra entrata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Timbra e il mio stato" }));
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Entrata$/ }));
    expect(state.mutate).toHaveBeenCalledWith(
      { companyId: "company", profiloId: "p1", tipo: "entrata", gps: null },
      expect.anything(),
    );
  });

  it("«Il mio stato» si apre sulla scheda scelta, con il riepilogo in cima", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Timbra e il mio stato" }));
    fireEvent.click(screen.getByRole("button", { name: /Cedolini e contributi/ }));
    expect(await screen.findByText("Pagina cedolini")).toBeInTheDocument();
    expect(screen.getByText(/Il mio stato · Florin Rossi/)).toBeInTheDocument();
    // Riepilogo: ferie residue, permessi+ROL, ultimo netto con contributi.
    expect(screen.getByText("12 gg")).toBeInTheDocument();
    expect(screen.getByText(/permessi e ROL: 24 h/)).toBeInTheDocument();
    // it-IT non raggruppa le migliaia a 4 cifre: «1500,00 €» (o «1.500,00 €»).
    expect(document.body.textContent).toMatch(/1\.?500,00\s€/);
    expect(document.body.textContent).toMatch(/set 2026 · contributi 190,00\s€/);
    // Una tessera del riepilogo porta alla sua scheda.
    fireEvent.click(screen.getByRole("button", { name: /Ferie residue/ }));
    expect(await screen.findByText("Pagina ferie")).toBeInTheDocument();
  });

  it("l'avviso della busta paga (?stato=cedolini) apre «Il mio stato» sui cedolini, da qualunque pagina", async () => {
    render(<MemoryRouter initialEntries={["/azienda/attivita?stato=cedolini"]}><TimbraHeaderButton /></MemoryRouter>);
    expect(await screen.findByText("Pagina cedolini")).toBeInTheDocument();
  });

  it("un ruolo senza schede personali (es. call center) timbra, ma non vede «Il mio stato»", () => {
    state.ruolo = "call_center";
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Timbra e il mio stato" }));
    expect(screen.getByRole("button", { name: /^Entrata$/ })).toBeInTheDocument();
    expect(screen.queryByText("Il mio stato")).not.toBeInTheDocument();
  });

  it("chi non ha un profilo HR non vede il bottone", () => {
    state.profilo = null;
    const { container } = mostra();
    expect(container).toBeEmptyDOMElement();
  });
});
