import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoOggi } from "@/components/campo/CampoOggi";
import { ChiLavoraCampo } from "@/components/campo/ChiLavoraCampo";

const state = vi.hoisted(() => ({ giornata: null as unknown, chi: null as unknown }));

vi.mock("@/hooks/campo/useCampoGiornata", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/hooks/campo/useCampoGiornata")>();
  return {
    ...vero,
    useMiaGiornata: () => ({ data: state.giornata, isLoading: false, isError: false, refetch: vi.fn() }),
    useChiLavora: () => ({ data: state.chi }),
  };
});

const cantiere = (extra: Record<string, unknown> = {}) => ({
  order_id: "o1", codice: "ORD-030", titolo: "Pavimentazione Caputo", indirizzo: "Via Garibaldi 15, Varese",
  sono_capocantiere: false, fasi: ["Demolizioni"],
  squadra: { nome: "Squadra Muratori", colore: "#2563EB", sono_caposquadra: false, caposquadra: { nome: "Andrea Conti", telefono: "+39 340 444 4444" } },
  capocantiere: { nome: "Marco Verdi", telefono: "+393201234567" },
  ...extra,
});

afterEach(cleanup);
beforeEach(() => { state.giornata = null; state.chi = null; });

describe("App di cantiere: Oggi", () => {
  it("dice dove andare, cosa fare, con chi e chi chiamare", () => {
    state.giornata = { giorni: [
      { giorno: "2026-10-15", cantieri: [cantiere()] },
      { giorno: "2026-10-16", cantieri: [cantiere({ order_id: "o2", titolo: "Bagno Rossi", fasi: ["Opere murarie"] })] },
    ], senza_date: [] };
    render(<MemoryRouter><CampoOggi /></MemoryRouter>);
    expect(screen.getByText("Pavimentazione Caputo")).toBeInTheDocument();
    expect(screen.getByText("Demolizioni")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Portami lì/ })).toHaveAttribute("href", expect.stringContaining("Via%20Garibaldi%2015"));
    expect(screen.getByRole("link", { name: "Chiama Andrea Conti" })).toHaveAttribute("href", "tel:+393404444444");
    expect(screen.getByRole("link", { name: "Chiama Marco Verdi" })).toHaveAttribute("href", "tel:+393201234567");
    expect(screen.getByText("Domani")).toBeInTheDocument();
    // l'operaio semplice non vede «Chi c'è oggi»
    expect(screen.queryByRole("link", { name: /Chi c'è oggi/ })).not.toBeInTheDocument();
  });

  it("al caposquadra e al capocantiere apre «Chi c'è oggi»", () => {
    state.giornata = { giorni: [{ giorno: "2026-10-15", cantieri: [cantiere({
      sono_capocantiere: true, capocantiere: null,
      squadra: { nome: "Squadra Muratori", colore: null, sono_caposquadra: true, caposquadra: null } })] }], senza_date: [] };
    render(<MemoryRouter><CampoOggi /></MemoryRouter>);
    expect(screen.getByText("Il capocantiere sei tu")).toBeInTheDocument();
    expect(screen.getByText("· sei il caposquadra")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chi c'è oggi/ })).toHaveAttribute("href", "/campo/squadra/o1");
  });

  it("senza lavoro oggi indica il prossimo giorno; senza date non occupa spazio", () => {
    state.giornata = { giorni: [
      { giorno: "2026-10-13", cantieri: [] },
      { giorno: "2026-10-14", cantieri: [] },
      { giorno: "2026-10-15", cantieri: [cantiere()] },
    ], senza_date: [] };
    const { unmount } = render(<MemoryRouter><CampoOggi /></MemoryRouter>);
    expect(screen.getByText("Oggi non hai cantieri in programma.")).toBeInTheDocument();
    expect(screen.getByText(/giovedì 15 ottobre/i)).toBeInTheDocument();
    unmount();
    state.giornata = { giorni: [{ giorno: "2026-10-13", cantieri: [] }], senza_date: [{ order_id: "o9" }] };
    const { container } = render(<MemoryRouter><CampoOggi /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("App di cantiere: Con chi lavori", () => {
  it("la squadra coi nomi, il caposquadra da chiamare e chi altro c'è", () => {
    state.chi = {
      giorno: "2026-10-15", sono_capocantiere: false,
      capocantiere: { nome: "Marco Verdi", telefono: "320 1234567" },
      mie_squadre: [{ id: "s1", nome: "Squadra Muratori", colore: "#2563EB", sono_caposquadra: false, oggi_qui: true,
        caposquadra: { nome: "Andrea Conti", telefono: "340 4444444" },
        compagni: [{ nome: "Antonio Bello", sei_tu: false }, { nome: "Luca Rossi", sei_tu: true }, { nome: "Giovanni Colombo", sei_tu: false }] }],
      anche_oggi: ["Squadra Finiture", "Edil Alfa"],
    };
    render(<MemoryRouter><ChiLavoraCampo orderId="o1" /></MemoryRouter>);
    expect(screen.getByText("Antonio Bello, Giovanni Colombo")).toBeInTheDocument();
    expect(screen.queryByText(/Luca Rossi/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chiama Andrea Conti" })).toHaveAttribute("href", "tel:3404444444");
    expect(screen.getByRole("link", { name: "Chiama Marco Verdi" })).toBeInTheDocument();
    expect(screen.getByText("Squadra Finiture, Edil Alfa")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chi c'è oggi/ })).not.toBeInTheDocument();
  });

  it("la ditta vede solo il capocantiere", () => {
    state.chi = { giorno: "2026-10-21", sono_capocantiere: false, capocantiere: { nome: "Marco Verdi", telefono: null }, mie_squadre: [], anche_oggi: [] };
    render(<MemoryRouter><ChiLavoraCampo orderId="o1" /></MemoryRouter>);
    expect(screen.getByText("Marco Verdi")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chiama/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Con te/)).not.toBeInTheDocument();
  });
});
