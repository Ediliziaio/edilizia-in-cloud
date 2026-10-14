// src/test/ui/modelliFasiPicker.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelliFasiPicker } from "@/components/orders/ModelliFasiPicker";
import type { ModelloFasi } from "@/lib/orders/modelliFasi";

const state = vi.hoisted(() => ({ modelli: [] as unknown[], inizializzati: false, loading: false, error: false, settings: true, refetch: vi.fn() }));
vi.mock("@/hooks/useModelliFasi", () => ({ useModelliFasi: () => ({ modelli: state.modelli, inizializzati: state.inizializzati, isLoading: state.loading, isError: state.error, refetch: state.refetch }) }));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canViewSettingsOrders: state.settings})}));
vi.mock("@/hooks/useOrderWorkPhases", () => ({
  PHASE_TEMPLATES: [
    { key: "bagno", label: "Bagno", hint: "Rifacimento bagno", phases: ["Demolizioni", "Impianti"] },
    { key: "tetto", label: "Tetto", hint: "Copertura", phases: ["Ponteggio"] },
  ],
}));

const mio: ModelloFasi = {
  id: "m1", origine: "azienda", nome: "Impianti completi", descrizione: "Elettrico e idraulico",
  fasi: [
    { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
    { nome: "Collaudo", sottofasi: [] },
  ],
};
beforeEach(() => { state.modelli = []; state.inizializzati = false; state.error = false; state.loading = false; state.settings = true; vi.clearAllMocks(); });
afterEach(cleanup);

describe("ModelliFasiPicker", () => {
  it("indica la pagina dei modelli con il permesso corretto", () => {
    const {rerender} = render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByRole("link", {name: "Gestisci modelli"})).toHaveAttribute("href", "/azienda/impostazioni/modelli-fasi#modelli");
    state.settings = false; rerender(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.queryByRole("link", {name: "Gestisci modelli"})).not.toBeInTheDocument();
  });
  it.each(["loading", "error"] as const)("%s non applica modelli standard al posto di dati non letti", key => {
    state[key] = true; const onApplica = vi.fn(); render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    expect(screen.getByRole("button", {name: "Bagno"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Bagno"})); expect(onApplica).not.toHaveBeenCalled();
    if (key === "error") {fireEvent.click(screen.getByRole("button", {name: "Riprova modelli"})); expect(state.refetch).toHaveBeenCalledOnce();}
  });
  it("filtra i modelli senza applicare né cambiare quelli memorizzati", () => {
    state.inizializzati = true; state.modelli = Array.from({length: 6}, (_, i) => ({...mio, id: `m${i}`, nome: `Impianti ${i}`}));
    const onApplica = vi.fn(); render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.change(screen.getByLabelText("Cerca modello"), {target: {value: "impianti 3"}});
    expect(screen.getByRole("button", {name: "Impianti 3"})).toBeInTheDocument(); expect(screen.queryByRole("button", {name: "Impianti 1"})).not.toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled(); expect(state.modelli).toHaveLength(6);
  });
  it("finché l'azienda non li ha fatti suoi è quello di sempre: «Parti da un modello» e gli stessi modelli", () => {
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByText("Parti da un modello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tetto" })).toBeInTheDocument();
  });

  it("un modello salvato prima di aver fatto suoi quelli di partenza compare insieme a loro", () => {
    state.modelli = [mio];
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByRole("button", { name: "Impianti completi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bagno" })).toBeInTheDocument();
  });

  it("dopo: offre i modelli dell'azienda, e non più quelli di partenza", () => {
    state.modelli = [mio]; state.inizializzati = true;
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.getByRole("button", { name: "Impianti completi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bagno" })).not.toBeInTheDocument();
  });

  it("se l'azienda li ha tolti tutti: non tornano quelli di partenza, e c'è un invito a prepararli", () => {
    state.inizializzati = true;
    render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    expect(screen.queryByRole("button", { name: "Bagno" })).not.toBeInTheDocument();
    expect(screen.getByText(/Non hai modelli/)).toBeInTheDocument();
  });

  it("sceglie un modello, ne mostra fasi e sottofasi, e non applica finché non si preme", () => {
    state.modelli = [mio]; state.inizializzati = true;
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Impianti completi" }));
    expect(screen.getByText(/Elettrico e idraulico · 2 fasi · 2 sottofasi/)).toBeInTheDocument();
    expect(onApplica).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [
        { nome: "Elettrico", sottofasi: [{ nome: "Tracce", peso: 2 }, { nome: "Cavi", peso: 3 }] },
        { nome: "Collaudo", sottofasi: [] },
      ],
      expect.objectContaining({ id: "m1" }),
    );
  });

  it("un modello di partenza si applica con le sole fasi", () => {
    const onApplica = vi.fn();
    render(<ModelliFasiPicker onApplica={onApplica} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi le 2 fasi" }));
    expect(onApplica).toHaveBeenCalledWith(
      [{ nome: "Demolizioni", sottofasi: [] }, { nome: "Impianti", sottofasi: [] }],
      expect.objectContaining({ id: "partenza:bagno" }),
    );
  });

  it("mentre salva il pulsante è spento", () => {
    const {rerender} = render(<ModelliFasiPicker onApplica={vi.fn()} inCorso={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Bagno" }));
    rerender(<ModelliFasiPicker onApplica={vi.fn()} inCorso />);
    expect(screen.getByRole("button", { name: "Aggiungi le 2 fasi" })).toBeDisabled();
  });
});
