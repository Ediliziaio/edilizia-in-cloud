import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposizioneCosti } from "@/components/orders/generali/design/ComposizioneCosti";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

const m = vi.hoisted(() => ({ completo: true, errore: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useGeneralePiano", () => ({
  useGeneralePianoNumeri: () => ({
    isLoading: false,
    isError: m.errore,
    refetch: vi.fn(),
    piano: {
      budgetCompleto: m.completo,
      confronto: {
        costi: [
          { categoria: "materiali", reale: 150, stima: 300 },
          { categoria: "manodopera", reale: 50, stima: 100 },
        ],
      },
    },
  }),
}));
const riepilogo = {
  generale: { id: "g" },
  permessi: { costi: true, margini: true, importi: true },
} as RiepilogoGenerale;
const disegna = (r = riepilogo) =>
  render(
    <MemoryRouter>
      <ComposizioneCosti riepilogo={r} />
    </MemoryRouter>,
  );
afterEach(cleanup);
beforeEach(() => {
  m.completo = true;
  m.errore = false;
});

describe("composizione costi nel portale", () => {
  it("la legenda apre il piano con la categoria corretta e la base del grafico", () => {
    function Indirizzo() { return <output data-testid="url">{useLocation().search}</output>; }
    render(<MemoryRouter><ComposizioneCosti riepilogo={riepilogo} /><Indirizzo /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Filtra costi: Materiali" }));
    expect(screen.getByTestId("url")).toHaveTextContent("scheda=piano");
    expect(screen.getByTestId("url")).toHaveTextContent("categorie-costo=materiali");
    expect(screen.getByTestId("url")).toHaveTextContent("base-costi=reale");
  });
  it("cambia base senza sommare registrato e stima finale", () => {
    disegna();
    expect(screen.getByText(/200\s*€/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stima finale" }));
    expect(screen.getByText(/400\s*€/)).toBeVisible();
    expect(screen.queryByText(/600\s*€/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stima finale" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("un budget incompleto non abilita il grafico previsionale", () => {
    m.completo = false;
    disegna();
    expect(screen.getByRole("button", { name: "Stima finale" })).toBeDisabled();
    expect(screen.getByText(/200\s*€/)).toBeVisible();
  });
  it("non espone importi, legende o totale a chi non vede i costi", () => {
    const { container } = disegna({
      ...riepilogo,
      permessi: { importi: true, costi: false, margini: false },
    });
    expect(container).toBeEmptyDOMElement();
  });
  it("un errore di lettura non diventa uno zero registrato", () => {
    m.errore = true;
    disegna();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Costi momentaneamente non disponibili",
    );
    expect(screen.queryByText(/200\s*€/)).not.toBeInTheDocument();
  });
});
