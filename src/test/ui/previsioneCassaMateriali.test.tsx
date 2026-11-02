import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrevisioneCassaMateriali } from "@/components/orders/PrevisioneCassaMateriali";

afterEach(cleanup);

describe("previsione di cassa sui materiali, a gradini", () => {
  it("se l'incassato non copre i materiali dice quanto si anticipa e fino a quando", () => {
    render(<PrevisioneCassaMateriali incassato={10000} materiali={16000} saldoResiduo={20000} saldoData="2099-06-30" />);
    expect(screen.getByText(/anticipi/)).toHaveTextContent("6.000,00");
    expect(screen.getByText(/anticipi/)).toHaveTextContent("30/06/2099");
    const gradini = within(screen.getByRole("list", { name: "Cassa a gradini" })).getAllByRole("listitem");
    expect(gradini.map((g) => g.textContent)).toEqual([
      expect.stringMatching(/Incassato.*\+10\.000,00/),
      expect.stringMatching(/Materiali dai fornitori.*−16\.000,00/),
      expect.stringMatching(/Punto più basso della cassa.*−6\.000,00/),
      expect.stringMatching(/Saldo a fine lavori.*\+20\.000,00/),
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
