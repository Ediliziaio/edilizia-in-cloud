import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrevisioneCassaMateriali } from "@/components/orders/PrevisioneCassaMateriali";

afterEach(cleanup);

describe("previsione di cassa sui materiali, a gradini", () => {
  it("se l'incassato non copre i materiali dice quanto si anticipa senza inventare la data di rientro", () => {
    render(<PrevisioneCassaMateriali incassato={10000} materiali={16000} saldoResiduo={20000} saldoData="2099-06-30" />);
    expect(screen.getByText(/anticipi/)).toHaveTextContent("6.000,00");
    expect(screen.getByText(/anticipi/)).not.toHaveTextContent("30/06/2099");
    expect(screen.getByText(/Residuo aggregato/)).toBeTruthy();
    const gradini = within(screen.getByRole("list", { name: "Cassa a gradini" })).getAllByRole("listitem");
    expect(gradini.map((g) => g.textContent)).toEqual([
      expect.stringMatching(/Incassato.*\+10\.000,00/),
      expect.stringMatching(/Materiali dai fornitori.*−16\.000,00/),
      expect.stringMatching(/Punto più basso della cassa.*−6\.000,00/),
      expect.stringMatching(/Residuo complessivo da incassare.*\+20\.000,00/),
      expect.stringMatching(/Cassa a lavori finiti.*14\.000,00/),
    ]);
  });
  it("se copre, niente anticipo; senza incassi né materiali non si mostra", () => {
    const { rerender, container } = render(<PrevisioneCassaMateriali incassato={20000} materiali={5000} saldoResiduo={0} saldoData={null} />);
    expect(screen.getByText(/non serve anticipare/)).toBeInTheDocument();
    rerender(<PrevisioneCassaMateriali incassato={0} materiali={0} saldoResiduo={0} saldoData={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

it("CHECK-67: rappresenta le tre rate correnti invece di un saldo unico", () => {
  render(<PrevisioneCassaMateriali incassato={0} materiali={24.4} saldoResiduo={122} saldoData="2026-12-03" rate={[
    { label: "Acconto", amount: 20, is_paid: false, expected_date: "2026-11-30" },
    { label: "Secondo acconto", amount: 30, is_paid: false, expected_date: "2026-12-02" },
    { label: "Saldo", amount: 72, is_paid: false, expected_date: "2026-12-03" },
    { label: "Già pagato", amount: 10, is_paid: true },
  ]} />);
  expect(screen.getByText("Acconto · 30/11/2026")).toBeTruthy();
  expect(screen.getByText("Secondo acconto · 02/12/2026")).toBeTruthy();
  expect(screen.getByText("Saldo · 03/12/2026")).toBeTruthy();
  expect(screen.queryByText(/Residuo aggregato|Già pagato/)).toBeNull();
});
