import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ConfrontoPiano } from "@/components/orders/generali/piano/ConfrontoPiano";
import {
  calcolaPianoEconomico,
  type RigaReale,
  type VocePiano,
} from "@/lib/orders/generali/pianoConti";
import { DA_STIMARE } from "@/lib/orders/generali/budgetCompletezza";
import { formatCurrency } from "@/lib/formatters";

afterEach(cleanup);
const euroTest = (n: number) => formatCurrency(n).replace(/\u00a0/g, " ");
const voce: VocePiano = {
  id: "materiali",
  tipo: "costo",
  categoria: "materiali",
  descrizione: "Materiali di prova",
  importo: 100,
  mese: "2026-11",
  durataMesi: 1,
  figliaId: null,
  categorieCosto: [],
  aFinire: null,
  nota: null,
  ordine: 0,
  origineId: null,
};
const reale = (id: string, importo: number): RigaReale => ({
  id,
  fonte: "spesa",
  rifId: id,
  orderId: "g",
  data: "2026-11-11",
  tipo: "costo",
  chiave: "materiali",
  categoria: null,
  descrizione: id,
  importo,
  voceId: "materiali",
});
function piano(
  righe = [reale("fattura-ordine", 100), reale("fattura-ddt-diretto", 50)],
  voci = [voce],
) {
  return calcolaPianoEconomico({
    generaleId: "g",
    oggi: "2026-11-11",
    voci,
    righe,
    incassi: [],
    figlie: [],
  });
}

it("spiega lo sforamento e apre le due righe nette senza aggiungere fatture o pagamenti al costo", () => {
  const apri = vi.fn(),
    categoria = vi.fn();
  render(
    <ConfrontoPiano
      piano={piano()}
      permessi={{ costi: true, importi: true }}
      onApriRighe={apri}
      onCategoria={categoria}
    />,
  );
  const confronto = screen.getByLabelText("Confronto costi in euro netti");
  expect(confronto).toHaveTextContent(euroTest(100));
  expect(within(confronto).getAllByText(euroTest(150))).toHaveLength(2);
  expect(screen.getByText(`${euroTest(50)} di costi in più`)).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Vedi costi registrati" }),
  );
  expect(apri.mock.calls[0][1].map((r: RigaReale) => r.id)).toEqual([
    "fattura-ordine",
    "fattura-ddt-diretto",
  ]);
  fireEvent.click(screen.getByRole("button", { name: /Materiali di prova/ }));
  expect(categoria).toHaveBeenCalledWith("materiali", "costo");
  fireEvent.click(screen.getByRole("button", { name: "Margine" }));
  expect(
    screen.getByLabelText("Confronto margine in euro netti"),
  ).toHaveTextContent(euroTest(-150));
  expect(
    screen.queryByRole("button", { name: "Vedi margine registrati" }),
  ).not.toBeInTheDocument();
});

it("conserva il segno delle rettifiche e distingue reale e stima", () => {
  render(
    <ConfrontoPiano
      piano={piano([reale("rettifica", -20)])}
      permessi={{ costi: true, importi: true }}
      onApriRighe={vi.fn()}
      onCategoria={vi.fn()}
    />,
  );
  expect(
    screen.getByLabelText("Confronto costi in euro netti"),
  ).toHaveTextContent(euroTest(-20));
  expect(
    screen.getByLabelText("Confronto costi in euro netti"),
  ).toHaveTextContent(euroTest(100));
  expect(screen.getByText("Nessuno scostamento sfavorevole")).toBeVisible();
});

it("non presenta come attendibili budget e previsione quando manca una stima", () => {
  render(
    <ConfrontoPiano
      piano={piano(undefined, [{ ...voce, importo: 0, nota: DA_STIMARE }])}
      permessi={{ costi: true, importi: true }}
      onApriRighe={vi.fn()}
      onCategoria={vi.fn()}
    />,
  );
  expect(
    within(screen.getByLabelText("Confronto costi in euro netti")).getAllByText(
      "Da completare",
    ),
  ).toHaveLength(2);
  expect(screen.getByText("Prima completa il budget")).toBeVisible();
  expect(screen.queryByText(/di costi in più/)).not.toBeInTheDocument();
});

it("non espone costi e margine attraverso grafici o priorità senza il permesso dei costi", () => {
  render(
    <ConfrontoPiano
      piano={piano()}
      permessi={{ costi: false, importi: true }}
      onApriRighe={vi.fn()}
      onCategoria={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Costi" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Margine" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Materiali di prova")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Confronto ricavi in euro netti")).toBeVisible();
});
