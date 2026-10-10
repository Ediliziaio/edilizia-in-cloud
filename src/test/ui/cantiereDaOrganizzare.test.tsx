// src/test/ui/cantiereDaOrganizzare.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accessi: [] as unknown[], accessiInLettura: false, accessiNonLetti: false,
  controlli: ["indirizzo", "date", "fasi", "chi", "pagamenti"] as string[], impostazioniInLettura: false,
  salva: vi.fn(), conferma: vi.fn(),
  manodopera: false, manodoperaInLettura: false, manodoperaErrore: false,
}));
vi.mock("@/hooks/useManodoperaPresenteCommessa", () => ({
  useManodoperaPresenteCommessa: () => ({ data: state.manodopera, isLoading: state.manodoperaInLettura, isError: state.manodoperaErrore }),
}));
vi.mock("@/hooks/useAccessiCommessa", () => ({
  useAccessiCommessa: () => ({ data: state.accessi, isLoading: state.accessiInLettura, isError: state.accessiNonLetti }),
}));
vi.mock("@/hooks/useImpostazioniAvvio", () => ({
  useImpostazioniAvvio: () => ({
    modelloFasi: null as string | null, controlli: state.controlli, isLoading: state.impostazioniInLettura, salva: { mutate: state.salva },
  }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => state.conferma }));

import { CantiereDaOrganizzare } from "@/components/orders/CantiereDaOrganizzare";

const props = {
  orderId: "o1", indirizzo: "", inizio: null as string | null, fine: null as string | null,
  fasi: 0 as number | null, rate: 0 as number | null, puoModificare: true, puoConfigurare: true, onVai: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    accessi: [], accessiInLettura: false, accessiNonLetti: false,
    manodopera: false, manodoperaInLettura: false, manodoperaErrore: false,
    controlli: ["indirizzo", "date", "fasi", "chi", "pagamenti"], impostazioniInLettura: false,
  });
  state.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Cantiere da organizzare", () => {
  it("una commessa vuota dice tutto quello che manca, con un pulsante per ogni cosa", () => {
    render(<CantiereDaOrganizzare {...props} />);
    expect(screen.getByText("Cantiere da organizzare")).toBeInTheDocument();
    expect(screen.getByText(/Mancano: l'indirizzo del cantiere, le date dei lavori, le fasi di lavoro, chi lavora in cantiere e come si paga/)).toBeInTheDocument();
    for (const azione of ["Aggiungi l'indirizzo", "Imposta le date", "Scegli le fasi", "Scegli chi lavora", "Imposta i pagamenti"]) {
      expect(screen.getByRole("button", { name: azione })).toBeInTheDocument();
    }
  });

  it("il pulsante porta a sistemare quella cosa", () => {
    render(<CantiereDaOrganizzare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Scegli le fasi" }));
    expect(props.onVai).toHaveBeenCalledWith("fasi");
  });

  it("una commessa organizzata non mostra niente", () => {
    state.accessi = [{ id: "a1" }];
    const { container } = render(<CantiereDaOrganizzare {...props} indirizzo="Via Roma 1" inizio="2026-11-02" fine="2026-12-15" fasi={3} rate={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("conta solo quello che l'azienda ha scelto di controllare", () => {
    state.controlli = ["indirizzo"];
    render(<CantiereDaOrganizzare {...props} />);
    expect(screen.getByText(/Manca: l'indirizzo del cantiere/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scegli le fasi" })).not.toBeInTheDocument();
  });

  it("operai o ditte senza account app non risultano mancanti", () => {
    state.manodopera = true;
    const { container } = render(<CantiereDaOrganizzare {...props} indirizzo="Via Roma 1" inizio="2025-01-03" fine="2025-02-28" fasi={6} rate={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("non inventa un'assenza durante lettura o errore della manodopera", () => {
    state.manodoperaInLettura = true;
    expect(render(<CantiereDaOrganizzare {...props} />).container).toBeEmptyDOMElement();
    cleanup();
    state.manodoperaInLettura = false;
    state.manodoperaErrore = true;
    render(<CantiereDaOrganizzare {...props} />);
    expect(screen.queryByRole("button", { name: "Scegli chi lavora" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeInTheDocument();
  });

  it("senza nessun controllo scelto non mostra niente", () => {
    state.controlli = [];
    const { container } = render(<CantiereDaOrganizzare {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("aspetta che i dati siano letti: niente allarmi a metà caricamento", () => {
    for (const mod of [{ fasi: null as number | null }, { rate: null as number | null }]) {
      const { container, unmount } = render(<CantiereDaOrganizzare {...props} {...mod} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    state.accessiInLettura = true;
    expect(render(<CantiereDaOrganizzare {...props} />).container).toBeEmptyDOMElement();
    cleanup();
    state.accessiInLettura = false; state.impostazioniInLettura = true;
    expect(render(<CantiereDaOrganizzare {...props} />).container).toBeEmptyDOMElement();
  });

  it("se non si leggono gli accessi non dice che manca chi lavora", () => {
    state.accessiNonLetti = true;
    render(<CantiereDaOrganizzare {...props} />);
    expect(screen.queryByRole("button", { name: "Scegli chi lavora" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeInTheDocument();
  });

  it("chi non può modificare la commessa non lo vede", () => {
    const { container } = render(<CantiereDaOrganizzare {...props} puoModificare={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("«non mi serve» chiede conferma e toglie quel controllo per tutta l'azienda", async () => {
    render(<CantiereDaOrganizzare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Non ricordarmi più: le fasi di lavoro" }));
    await waitFor(() => expect(state.salva).toHaveBeenCalledWith({ controlli: ["indirizzo", "date", "chi", "pagamenti"] }));
    expect(state.conferma).toHaveBeenCalledWith(expect.objectContaining({ title: "Non ricordarmi più «fasi di lavoro»?" }));
  });

  it("se non si conferma non cambia niente", async () => {
    state.conferma.mockResolvedValue(false);
    render(<CantiereDaOrganizzare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Non ricordarmi più: come si paga" }));
    await waitFor(() => expect(state.conferma).toHaveBeenCalled());
    expect(state.salva).not.toHaveBeenCalled();
  });

  it("chi non può cambiare le impostazioni non ha il «non mi serve»", () => {
    render(<CantiereDaOrganizzare {...props} puoConfigurare={false} />);
    expect(screen.queryByRole("button", { name: /Non ricordarmi più/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeInTheDocument();
  });
});
