import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterventiCampo } from "@/components/campo/InterventiCampo";
import type { InterventoCampo } from "@/hooks/campo/useMieiInterventi";

const state = vi.hoisted(() => ({ interventi: [] as InterventoCampo[], loading: false }));
vi.mock("@/hooks/campo/useMieiInterventi", () => ({
  useMieiInterventi: () => ({ data: state.interventi, isLoading: state.loading }),
}));

const oggiISO = () => {
  const d = new Date(); d.setHours(9, 0, 0, 0); return d.toISOString();
};

const intervento = (extra: Partial<InterventoCampo> = {}): InterventoCampo => ({
  id: "i1", titolo: "Perdita rubinetto", tipo: "intervento", stato: "in_lavorazione",
  data: oggiISO(), indirizzo: "Via Roma 10, Milano", lat: null, lng: null,
  note: "Portare guarnizioni da mezzo pollice", cliente: "Marco Ricci", telefono_cliente: "340 1112223",
  order_id: null, da_squadra: false, squadra: null, ...extra,
});

afterEach(cleanup);
beforeEach(() => { state.interventi = []; state.loading = false; });

const draw = () => render(<MemoryRouter><InterventiCampo /></MemoryRouter>);

describe("App di cantiere: Interventi da fare", () => {
  it("senza interventi non occupa spazio", () => {
    const { container } = draw();
    expect(container).toBeEmptyDOMElement();
  });

  it("dice quando, dove, cosa fare e chi è il cliente, con Portami lì e Chiama", () => {
    state.interventi = [intervento()];
    draw();
    expect(screen.getByText("Perdita rubinetto")).toBeInTheDocument();
    expect(screen.getByText("Marco Ricci")).toBeInTheDocument();
    expect(screen.getByText("Via Roma 10, Milano")).toBeInTheDocument();
    expect(screen.getByText("Portare guarnizioni da mezzo pollice")).toBeInTheDocument();
    expect(screen.getByText(/Oggi/)).toBeInTheDocument();
    const portami = screen.getByRole("link", { name: /Portami lì/ });
    expect(portami).toHaveAttribute("href", expect.stringContaining("Via%20Roma%2010"));
    expect(screen.getByRole("link", { name: /Chiama/ })).toHaveAttribute("href", "tel:3401112223");
  });

  it("un intervento della squadra dice con quale squadra", () => {
    state.interventi = [intervento({ da_squadra: true, squadra: "Squadra Muratori", cliente: null, telefono_cliente: null, note: null })];
    draw();
    expect(screen.getByText("con Squadra Muratori")).toBeInTheDocument();
    // senza telefono niente bottone Chiama
    expect(screen.queryByRole("link", { name: /Chiama/ })).not.toBeInTheDocument();
  });

  it("senza data lo dice invece di inventarla", () => {
    state.interventi = [intervento({ data: null })];
    draw();
    expect(screen.getByText("Data da fissare")).toBeInTheDocument();
  });
});
