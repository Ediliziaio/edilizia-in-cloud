// src/test/ui/modelliPagamentoConfig.test.tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelliPagamentoConfig from "@/components/settings/ModelliPagamentoConfig";
import {
  MODELLI_PAGAMENTO_DI_PARTENZA, modelliPagamentoDaOffrire, modelliPagamentoPerInizializzare,
  type ModelloPagamento, type RataModello,
} from "@/lib/orders/modelliPagamento";

const state = vi.hoisted(() => ({
  modelli: [] as unknown[], inizializzati: true, predefinito: null as string | null, disponibile: true, isLoading: false,
  puoModificare: true, inizializzaErrore: false,
  salva: vi.fn(), elimina: vi.fn(), inizializza: vi.fn(), impostazioni: vi.fn(), successo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.puoModificare ? "company_admin" : "staff" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsOrders: false }) }));
vi.mock("@/hooks/useModelliPagamento", () => ({
  useModelliPagamento: () => ({
    modelli: state.modelli,
    offerti: modelliPagamentoDaOffrire(state.inizializzati, state.modelli as ModelloPagamento[]),
    inizializzati: state.inizializzati, predefinito: state.predefinito, salMatura: "emesso",
    disponibile: state.disponibile, isLoading: state.isLoading,
    salva: { mutate: state.salva, isPending: false },
    elimina: { mutate: state.elimina, isPending: false },
    inizializza: { mutate: state.inizializza, isPending: false, isError: state.inizializzaErrore },
    impostazioni: { mutate: state.impostazioni, isPending: false },
  }),
}));

const rata = (nome: string, percent: number, tipo: RataModello["tipo"], evento: RataModello["evento"], numero: number | null = null): RataModello =>
  ({ nome, percent, tipo, evento, numero, preavviso: 7 });
const mio: ModelloPagamento = {
  id: "m1", origine: "azienda", nome: "Tre rate", descrizione: "",
  righe: [rata("Alla firma", 30, "deposit", "firma_contratto"), rata("SAL 1", 40, "deposit", "sal_numero", 1), rata("Saldo", 30, "balance", "fine_lavori")],
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { modelli: [], inizializzati: true, predefinito: null, disponibile: true, isLoading: false, puoModificare: true, inizializzaErrore: false });
});
afterEach(cleanup);

describe("la prima volta: i modelli di partenza diventano dell'azienda", () => {
  beforeEach(() => { state.inizializzati = false; });

  it("chi può modificare li porta tra i suoi, una volta sola", () => {
    const { rerender } = render(<ModelliPagamentoConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: false });
    rerender(<ModelliPagamentoConfig />);
    expect(state.inizializza).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Preparo i tuoi modelli/)).toBeInTheDocument();
  });
  it("nel frattempo si vedono, senza comandi sui singoli modelli", () => {
    render(<ModelliPagamentoConfig />);
    expect(screen.getByText("Acconto e saldo (30/70)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifica Acconto e saldo (30/70)" })).not.toBeInTheDocument();
  });
  it("chi non può modificare non li prepara: li vede e basta", () => {
    state.puoModificare = false;
    render(<ModelliPagamentoConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText(/Sono i modelli di partenza/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo modello" })).not.toBeInTheDocument();
  });
  it("non parte mentre carica, né se i modelli non si leggono", () => {
    state.isLoading = true;
    const { rerender } = render(<ModelliPagamentoConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    state.isLoading = false; state.disponibile = false;
    rerender(<ModelliPagamentoConfig />);
    expect(state.inizializza).not.toHaveBeenCalled();
    expect(screen.getByText(/Non riesco a leggere i modelli/)).toBeInTheDocument();
  });
  it("se la preparazione fallisce lo dice e si può riprovare", () => {
    state.inizializzaErrore = true;
    render(<ModelliPagamentoConfig />);
    state.inizializza.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: false });
  });
});

describe("con i modelli dell'azienda", () => {
  it("elenca i modelli con il riepilogo di come si incassa", () => {
    state.modelli = [mio];
    render(<ModelliPagamentoConfig />);
    expect(screen.getByText("Tre rate")).toBeInTheDocument();
    expect(screen.getByText("30% alla firma del contratto · 40% al SAL n. 1 · 30% a fine lavori")).toBeInTheDocument();
    expect(state.inizializza).not.toHaveBeenCalled();
  });

  it("la stella sceglie il modello per le commesse nuove; premuta di nuovo lo toglie", () => {
    state.modelli = [mio];
    const { rerender } = render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Usa Tre rate per le commesse nuove" }));
    expect(state.impostazioni).toHaveBeenCalledWith({ modelloPredefinito: "m1" });
    state.predefinito = "m1";
    rerender(<ModelliPagamentoConfig />);
    expect(screen.getByText("Per le commesse nuove")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Togli Tre rate dalle commesse nuove" }));
    expect(state.impostazioni).toHaveBeenLastCalledWith({ modelloPredefinito: null });
  });

  it("«Modifica» apre l'editor con il modello com'è, e salva con il suo id", () => {
    state.modelli = [mio];
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Modifica Tre rate" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Tre rate");
    expect(within(dialogo).getByLabelText("Nome rata 2")).toHaveValue("SAL 1");
    expect(within(dialogo).getByLabelText("Numero del SAL rata 2")).toHaveValue(1);
    expect(within(dialogo).getByText(/Totale 100%/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Percentuale rata 2"), { target: { value: "35" } });
    fireEvent.change(within(dialogo).getByLabelText("Percentuale rata 3"), { target: { value: "35" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      {
        id: "m1", nome: "Tre rate", descrizione: null,
        righe: [
          { nome: "Alla firma", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 7 },
          { nome: "SAL 1", percent: 35, tipo: "deposit", evento: "sal_numero", numero: 1, preavviso: 7 },
          { nome: "Saldo", percent: 35, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
        ],
      },
      expect.any(Object),
    );
  });

  it("«Duplica» apre una copia: «Copia di …», senza id", () => {
    state.modelli = [mio];
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Tre rate" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("Nome del modello")).toHaveValue("Copia di Tre rate");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(expect.objectContaining({ id: null, nome: "Copia di Tre rate" }), expect.any(Object));
  });

  it("un modello nuovo parte da acconto e saldo (30/70): serve solo il nome", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), { target: { value: "  Il mio piano " } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).toHaveBeenCalledWith(
      {
        id: null, nome: "Il mio piano", descrizione: null,
        righe: [
          { nome: "Acconto", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 7 },
          { nome: "Saldo", percent: 70, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
        ],
      },
      expect.any(Object),
    );
  });

  it("un modello senza nome, o che non somma cento, non si salva", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText("Nome del modello"), { target: { value: "Mio" } });
    fireEvent.change(within(dialogo).getByLabelText("Percentuale rata 2"), { target: { value: "60" } });
    expect(within(dialogo).getByText(/Totale 90% · manca il 10%/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    expect(state.salva).not.toHaveBeenCalled();
  });

  it("«Metti il resto sul saldo» porta il totale a cento", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Percentuale rata 1"), { target: { value: "20" } });
    fireEvent.change(within(dialogo).getByLabelText("Percentuale rata 2"), { target: { value: "50" } });
    expect(within(dialogo).getByText(/Totale 70% · manca il 30%/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Metti il resto sul saldo" }));
    expect(within(dialogo).getByLabelText("Percentuale rata 2")).toHaveValue(80);
    expect(within(dialogo).getByText(/Totale 100%/)).toBeInTheDocument();
  });

  it("una rata aggiunta sta prima del saldo, che resta l'ultimo", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi una rata" }));
    expect(within(dialogo).getByLabelText("Nome rata 2")).toHaveValue("Rata");
    expect(within(dialogo).getByLabelText("Nome rata 3")).toHaveValue("Saldo");
    expect(within(dialogo).getByText("Saldo", { selector: "span" })).toBeInTheDocument();
  });

  it("scegliere «Al SAL numero…» chiede il numero del SAL e ne propone uno", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).queryByLabelText("Numero del SAL rata 1")).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("combobox", { name: "Quando si incassa la rata 1" }));
    fireEvent.click(screen.getByText("Al SAL numero…"));
    expect(within(dialogo).getByLabelText("Numero del SAL rata 1")).toHaveValue(1);
  });

  it("«stato commessa» non è tra i momenti che si possono scegliere in un modello", () => {
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Quando si incassa la rata 1" }));
    expect(screen.queryByText("Quando la commessa arriva a…")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "A fine lavori" })).toBeInTheDocument();
  });

  it("si riordinano le rate, e l'ultima torna sempre saldo", () => {
    state.modelli = [mio];
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Duplica Tre rate" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sposta giù rata 2" }));
    expect(within(dialogo).getByLabelText("Nome rata 2")).toHaveValue("Saldo");
    expect(within(dialogo).getByLabelText("Nome rata 3")).toHaveValue("SAL 1");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva modello" }));
    const righe = state.salva.mock.calls[0][0].righe as RataModello[];
    expect(righe.map((r) => r.tipo)).toEqual(["deposit", "deposit", "balance"]);
  });

  it("eliminare chiede conferma e poi elimina", () => {
    state.modelli = [mio];
    render(<ModelliPagamentoConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tre rate" }));
    expect(state.elimina).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il modello" }));
    expect(state.elimina).toHaveBeenCalledWith("m1");
  });

  it("senza nessun modello c'è l'invito a crearne o a rimettere quelli di partenza", () => {
    render(<ModelliPagamentoConfig />);
    expect(screen.getByText(/Non hai modelli/)).toBeInTheDocument();
    expect(screen.getByText("Ti mancano 6 modelli di partenza.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ripristina i predefiniti" })).toBeInTheDocument();
  });

  it("«Ripristina i predefiniti» rimette solo quelli che mancano (il server li riconosce dal nome)", () => {
    state.modelli = [{ ...mio, id: "a", nome: MODELLI_PAGAMENTO_DI_PARTENZA[0].nome }];
    render(<ModelliPagamentoConfig />);
    expect(screen.getByText("Ti mancano 5 modelli di partenza.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina i predefiniti" }));
    expect(state.inizializza).toHaveBeenCalledWith({ modelli: modelliPagamentoPerInizializzare(), soloMancanti: true }, expect.any(Object));
  });

  it("chi non può modificare vede l'elenco ma nessun comando", () => {
    state.modelli = [mio];
    state.puoModificare = false;
    render(<ModelliPagamentoConfig />);
    expect(screen.getByText("Tre rate")).toBeInTheDocument();
    for (const nome of ["Nuovo modello", "Modifica Tre rate", "Duplica Tre rate", "Elimina Tre rate", "Usa Tre rate per le commesse nuove"]) {
      expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });
});
