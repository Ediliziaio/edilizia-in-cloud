// src/test/ui/modelliFasiConfig.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelliFasiConfig from "@/components/settings/ModelliFasiConfig";
import type { ModelloFasi, ModelloPerServer } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[], inizializzati: true, disponibile: true, isLoading: false, puoModificare: true, inizializzaErrore: false,
  salva: vi.fn(), elimina: vi.fn(), inizializza: vi.fn(), successo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.puoModificare ? "company_admin" : "staff" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));
vi.mock("@/hooks/useModelliFasi", () => ({
  useModelliFasi: () => ({
    modelli: state.modelli, inizializzati: state.inizializzati, disponibile: state.disponibile, isLoading: state.isLoading,
    salva: { mutate: state.salva, isPending: false },
    elimina: { mutate: state.elimina, isPending: false },
    inizializza: { mutate: state.inizializza, isPending: false, isError: state.inizializzaErrore },
  }),
}));

const PARTENZA_PER_SERVER: ModelloPerServer[] = [
  { nome: "Bagno", descrizione: "Rifacimento bagno", fasi: [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }] },
  { nome: "Tetto", descrizione: "Copertura", fasi: [{ nome: "Ponteggio", sottofasi: [] }] },
];
const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { modelli: [], inizializzati: true, disponibile: true, isLoading: false, puoModificare: true, inizializzaErrore: false });
});
afterEach(cleanup);

describe("la prima volta: i modelli di partenza diventano dell'azienda", () => {
  beforeEach(() => { state.inizializzati = false; });

  it("chi può modificare li porta tra i suoi, una volta sola", () => {
    const { rerender } = render(<ModelliFasiConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: false });
    rerender(<ModelliFasiConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Preparo i tuoi modelli/)).toBeInTheDocument();
  });

  it("nel frattempo si vedono, senza comandi sui singoli modelli", () => {
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Bagno")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifica Bagno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina Bagno" })).not.toBeInTheDocument();
  });

  it("chi non può modificare non li prepara: li vede e basta", () => {
    state.puoModificare = false;
    render(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText("Bagno")).toBeInTheDocument();
    expect(screen.getByText(/Sono i modelli di partenza/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).not.toBeInTheDocument();
  });

  it("non parte mentre carica, né se i modelli non si leggono", () => {
    state.isLoading = true;
    const { rerender } = render(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    state.isLoading = false; state.disponibile = false;
    rerender(<ModelliFasiConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText(/Non riesco a leggere i modelli/)).toBeInTheDocument();
  });

  it("se la preparazione fallisce lo dice e si può riprovare", () => {
    state.inizializzaErrore = true;
    render(<ModelliFasiConfig />);
    state.inizializza.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: false });
  });
});

describe("con i modelli dell'azienda", () => {
  it("elenca i modelli con fasi e sottofasi, e non rifà niente", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    expect(screen.getByText("2 fasi · 2 sottofasi")).toBeInTheDocument();
    expect(state.inizializza).not.toHaveBeenCalled();
  });

  it("«Modifica» apre l'editor con il modello com'è, e salva con il suo id", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Impianti completi");
    expect(within(dialogo).getByLabelText("Nome sottofase 1.2")).toHaveValue("Cavi");
    fireEvent.change(within(dialogo).getByLabelText("Peso sottofase 1.2"), { target: { value: "5" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      {
        id: "m1", nome: "Impianti completi", descrizione: null,
        fasi: [{ nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 5 }] }, { nome: "Collaudo", sottofasi: [] }],
      },
      expect.any(Object),
    );
  });

  it("«Duplica» apre una copia: «Copia di …», senza id, con fasi e sottofasi", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Copia di Impianti completi");
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Elettrico");
    expect(within(dialogo).getByLabelText("Nome sottofase 1.1")).toHaveValue("Tracce");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(expect.objectContaining({ id: null, nome: "Copia di Impianti completi" }), expect.any(Object));
  });

  it("un modello nuovo: aggiunge una sottofase col suo peso e salva il payload ripulito", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), { target: { value: "  Solo elettrico " } });
    fireEvent.change(within(dialogo).getByLabelText("Nome fase 1"), { target: { value: "Impianto elettrico" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi sottofase alla fase 1" }));
    fireEvent.change(within(dialogo).getByLabelText("Nome sottofase 1.1"), { target: { value: "Tracce" } });
    fireEvent.change(within(dialogo).getByLabelText("Peso sottofase 1.1"), { target: { value: "3" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      { id: null, nome: "Solo elettrico", descrizione: null, fasi: [{ nome: "Impianto elettrico", sottofasi: [{ nome: "Tracce", peso: 3 }] }] },
      expect.any(Object),
    );
  });

  it("un modello senza nome non si salva", () => {
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).not.toHaveBeenCalled();
  });

  it("si riordinano le fasi", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Impianti completi" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sposta giù fase 1" }));
    expect(within(dialogo).getByLabelText("Nome fase 1")).toHaveValue("Collaudo");
    expect(within(dialogo).getByLabelText("Nome fase 2")).toHaveValue("Elettrico");
  });

  it("eliminare chiede conferma e poi elimina", () => {
    state.modelli = [mio];
    render(<ModelliFasiConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina Impianti completi" }));
    expect(state.elimina).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello" }));
    expect(state.elimina).toHaveBeenCalledWith("m1");
  });

  it("senza nessun modello c'è l'invito a crearne o a rimettere quelli di partenza", () => {
    render(<ModelliFasiConfig />);
    expect(screen.getByText(/Non hai modelli/)).toBeInTheDocument();
    expect(screen.getByText("Ti mancano 2 modelli di partenza.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ripristina i predefiniti" })).toBeInTheDocument();
  });

  it("«Ripristina i predefiniti» rimette solo quelli che mancano (il server li riconosce dal nome)", () => {
    state.modelli = [{ ...mio, id: "a", nome: "Bagno" }];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Ti manca 1 modello di partenza.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina i predefiniti" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: PARTENZA_PER_SERVER, soloMancanti: true }, expect.any(Object));
  });

  it("se ha già tutti quelli di partenza non propone il ripristino", () => {
    state.modelli = [{ ...mio, id: "a", nome: "Bagno" }, { ...mio, id: "b", nome: "tetto " }];
    render(<ModelliFasiConfig />);
    expect(screen.queryByRole("button", { name: "Ripristina i predefiniti" })).not.toBeInTheDocument();
  });

  it("chi non può modificare vede l'elenco ma nessun comando", () => {
    state.puoModificare = false; state.modelli = [mio];
    render(<ModelliFasiConfig />);
    expect(screen.getByText("Impianti completi")).toBeInTheDocument();
    for (const nome of ["Nuovo modello", "Modifica Impianti completi", "Duplica Impianti completi", "Elimina Impianti completi", "Ripristina i predefiniti"]) {
      expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });
});
