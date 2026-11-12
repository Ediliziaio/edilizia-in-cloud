import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Andamento } from "@/components/orders/generali/piano/Andamento";
import type { FotografiaPiano } from "@/lib/orders/generali/pianoLettura";
const m = vi.hoisted(() => ({
  foto: [] as FotografiaPiano[],
  scatta: vi.fn(),
}));
vi.mock("@/hooks/useGeneralePiano", () => ({
  useFotografieGenerale: () => ({
    data: m.foto,
    isLoading: false,
    isError: false,
  }),
  useFotografaOra: () => ({ mutate: m.scatta, isPending: false }),
  messaggioPiano: () => "Errore",
}));
afterEach(cleanup);
const foto = (
  mese: string,
  stato: FotografiaPiano["versioneStato"],
  costi: number,
): FotografiaPiano => ({
  mese,
  versioneNumero: 1,
  versioneStato: stato,
  ricaviPrevisti: 200,
  costiPrevisti: 100,
  ricaviReali: 0,
  costiReali: costi,
  ricaviStima: 200,
  costiStima: costi,
  capitaleMassimoPrevisto: 100,
  capitaleInvestito: costi,
  origine: "automatica",
});
it("filtra le fotografie senza sostituire lo storico con numeri correnti e apre il rendiconto del mese", () => {
  m.foto = [foto("2026-11", "bozza", 220), foto("2026-10", "approvata", 120)];
  const investitori = vi.fn();
  render(
    <Andamento
      generaleId="g"
      puoModificare={false}
      onInvestitori={investitori}
    />,
  );
  expect(
    screen.getByRole("table", { name: "Fotografie mensili del piano" }),
  ).toHaveTextContent("nov 2026");
  fireEvent.change(screen.getByLabelText("Stato delle fotografie"), {
    target: { value: "approvata" },
  });
  const tabella = screen.getByRole("table", {
    name: "Fotografie mensili del piano",
  });
  expect(tabella).not.toHaveTextContent("nov 2026");
  expect(tabella).toHaveTextContent("ott 2026");
  fireEvent.click(
    screen.getByRole("button", { name: "Rendiconto del periodo" }),
  );
  expect(investitori).toHaveBeenCalledWith("2026-10");
  fireEvent.click(
    within(tabella).getByRole("button", {
      name: "Apri fotografia di ott 2026",
    }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "Fotografia di ott 2026",
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("120,00");
  expect(
    screen.queryByRole("button", { name: "Fotografa adesso" }),
  ).not.toBeInTheDocument();
});
it("senza fotografie non inventa una serie e il filtro senza risultati resta esplicito", () => {
  m.foto = [];
  render(<Andamento generaleId="g" puoModificare={false} />);
  expect(
    screen.getByText("Lo storico parte dalla prima fotografia"),
  ).toBeVisible();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  cleanup();
  m.foto = [foto("2026-10", "bozza", 120)];
  render(<Andamento generaleId="g" puoModificare={false} />);
  fireEvent.change(screen.getByLabelText("Stato delle fotografie"), {
    target: { value: "approvata" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Nessuna fotografia");
});
