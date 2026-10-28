import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { LiquidazioneIVA } from "@/components/contabilita/LiquidazioneIVA";
import type { LiquidazioneIVAResult } from "@/hooks/useLiquidazioneIVA";
afterEach(cleanup);
const result: LiquidazioneIVAResult = {
  iva_vendite: 22,
  iva_acquisti: 30,
  saldo: -8,
  credito: true,
  dovuto: false,
  periodo_label: "Ottobre",
  ipotesi: ["Date di ricezione da verificare"],
  escluso: { split_payment: 0 },
  documenti: { vendite: 1, acquisti: 2 },
  dettaglio_aliquote: [{ lato: "vendite", aliquota: 22, imposta: 22 }],
  esigibilita_differita: null,
  calcolabile: true,
};
it("shows readable server facts and a documentary comparison without raw JSON", () => {
  const calc = vi.fn(async () => {});
  const { container } = render(
    <MemoryRouter initialEntries={["/?anno=2026&mese=10"]}>
      <LiquidazioneIVA
        risultato={result}
        isCalcolando={false}
        calcola={calc}
        reset={vi.fn()}
        documental={{ vendite: 2200, acquisti: 1000 }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText(/Periodo condiviso/)).toHaveTextContent("01/10/2026");
  expect(screen.getByText(/Documenti: 10,00/)).toHaveTextContent(
    /Differenza: 20,00/,
  );
  fireEvent.click(screen.getByText("Fonti, esclusioni e ipotesi del calcolo"));
  expect(screen.getByText("Documenti di vendita")).toBeVisible();
  expect(screen.getByText("IVA a esigibilità differita")).toBeVisible();
  expect(screen.getAllByText("Non disponibile").length).toBeGreaterThan(0);
  expect(container.querySelector("pre")).toBeNull();
  expect(calc).not.toHaveBeenCalled();
});
it("does not compare or present amounts as valid when the server cannot calculate", () => {
  render(
    <MemoryRouter>
      <LiquidazioneIVA
        risultato={{ ...result, calcolabile: false, motivo: "Dati mancanti" }}
        isCalcolando={false}
        calcola={vi.fn()}
        reset={vi.fn()}
        documental={{ vendite: null, acquisti: null }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText("Dati mancanti")).toBeVisible();
  expect(
    screen.queryByText("Confronto con il Registro IVA documentale"),
  ).toBeNull();
});
