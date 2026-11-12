import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CassaScadenze } from "@/components/orders/generali/piano/CassaScadenze";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
const m = vi.hoisted(() => ({ incompleta: false }));
vi.mock("@/hooks/useCassaOperazione", () => ({
  useCassaOperazione: () => ({
    registrati: [
      {
        id: "p",
        entry_date: "2026-11-01",
        amount: 183,
        direction: "uscita",
        reversal_of: null as string | null,
      },
    ],
    previsti: m.incompleta
      ? [{ id: "attesa", date: null as string | null, cents: 5000, direction: "out" }]
      : [],
    avvisi: [] as string[],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useGeneraleInvestitori", () => ({
  useMovimentiFonti: () => ({
    data: [
      {
        id: "s",
        fonteId: "socio",
        tipo: "versamento",
        data: "2026-11-01",
        importo: 500,
        nota: null as string | null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  m.incompleta = false;
});
it("distingue 183 € pagati dai 500 € delle fonti e apre investitori e pagamenti", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
  const investitori = vi.fn(),
    pagamenti = vi.fn();
  render(
    <CassaScadenze
      riepilogo={
        {
          generale: { id: "g" },
          permessi: { margini: true },
        } as RiepilogoGenerale
      }
      onInvestitori={investitori}
      onPagamenti={pagamenti}
    />,
  );
  const kpi = screen.getByLabelText("Cassa registrata dell’intera operazione");
  expect(kpi).toHaveTextContent("183,00");
  expect(kpi).not.toHaveTextContent("500,00");
  expect(
    screen.getByRole("table", { name: "Movimenti di cassa per mese" }),
  ).toHaveTextContent("-183,00");
  fireEvent.click(
    screen.getByRole("button", { name: /Apri fonti e investitori/ }),
  );
  expect(investitori).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /Apri i pagamenti/ }));
  expect(pagamenti).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Ancora attesi" }));
  expect(
    screen.getByRole("table", { name: "Movimenti di cassa per mese" }),
  ).not.toHaveTextContent("183,00");
});
it("non mostra un fabbisogno residuo certo se una scadenza manca", () => {
  m.incompleta = true;
  render(
    <CassaScadenze
      riepilogo={
        {
          generale: { id: "g" },
          permessi: { margini: true },
        } as RiepilogoGenerale
      }
    />,
  );
  expect(screen.getByText("Da completare")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "movimenti senza data 1",
  );
});
