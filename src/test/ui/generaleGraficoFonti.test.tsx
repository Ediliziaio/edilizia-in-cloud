import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraficoFonti } from "@/components/orders/generali/investitori/GraficoFonti";
import type { ContiInvestitori } from "@/lib/orders/generali/investitoriConti";

afterEach(cleanup);
const conti = { copertura: [{ gruppo: "propri", nome: "Mezzi propri", impegno: 100, dentro: 40 }, { gruppo: "investitori", nome: "Investitori", impegno: 200, dentro: 20 }, { gruppo: "debito", nome: "Banca e finanziamenti", impegno: 300, dentro: 0 }] } as ContiInvestitori;

describe("composizione e filtri delle fonti", () => {
  it("distingue gli impegni dal capitale effettivo senza sommarli", () => {
    render(<GraficoFonti conti={conti} />);
    expect(screen.getByText(/600\s*€/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Capitale dentro" }));
    expect(screen.getByText(/60\s*€/)).toBeVisible();
    expect(screen.queryByText(/660\s*€/)).not.toBeInTheDocument();
  });
  it("legenda e tastiera aprono il gruppo della fonte selezionata", () => {
    const filtra = vi.fn();
    render(<GraficoFonti conti={conti} onFiltra={filtra} />);
    fireEvent.click(screen.getByRole("button", { name: "Filtra fonti: Investitori" }));
    expect(filtra).toHaveBeenLastCalledWith("investitori");
    fireEvent.keyDown(screen.getByRole("button", { name: "Mostra Mezzi propri" }), { key: "Enter" });
    expect(filtra).toHaveBeenLastCalledWith("propri");
  });
});
