import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { OrdersPipelineCard } from "@/components/orders/OrdersPipelineCard";
import { OrdersPipelineView } from "@/components/orders/OrdersPipelineView";
import { PipelineDragScope } from "@/components/orders/PipelineDrag";
import type { OrderWithDetails } from "@/lib/orderUtils";
import { formatCurrency } from "@/lib/formatters";

const ordine: OrderWithDetails = {
  id: "commessa",
  order_code: "DEMO-27",
  description: "Manutenzione straordinaria di fabbricato rurale",
  total_amount: 35000,
  deposit_amount: 0,
  deposit_paid: null,
  deposit_2_amount: null,
  deposit_2_paid: null,
  balance_amount: 35000,
  balance_paid: false,
  expected_date: null,
  warehouse_arrival_date: null,
  created_at: "2026-11-01",
  current_status_id: "firmato",
  customer: { first_name: "SILVIA", last_name: "ROSSI", email: "" },
  status: { name: "Firmato", color: "#2563eb" },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function scheda(order = ordine, showAmounts = true) {
  return render(<MemoryRouter><PipelineDragScope>
    <OrdersPipelineCard order={order} stage="firmato" showAmounts={showAmounts} />
  </PipelineDragScope></MemoryRouter>);
}

it("mostra il cestino soltanto quando l'azione è autorizzata e non apre la commessa", () => {
  const elimina = vi.fn();
  render(<MemoryRouter><PipelineDragScope><OrdersPipelineCard order={ordine} stage="firmato" onDelete={elimina} /></PipelineDragScope></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Elimina commessa DEMO-27" }));
  expect(elimina).toHaveBeenCalledOnce();
  expect(elimina).toHaveBeenCalledWith(ordine);
});

function verificaIntestazione(contenitore: HTMLElement, nome: string) {
  const t = within(contenitore);
  const riga = t.getByText(nome).parentElement!;
  expect(riga).toContainElement(t.getByText("DEMO-27"));
  expect(riga.nextElementSibling).toHaveTextContent(ordine.description);
}

it("mostra cliente e codice sopra la descrizione nella scheda e nell’anteprima", () => {
  scheda();
  verificaIntestazione(screen.getByRole("group", { name: "Apri dettagli commessa DEMO-27" }), "Silvia Rossi");
  fireEvent.click(screen.getByRole("button", { name: "Anteprima commessa DEMO-27" }));
  const riepilogo = screen.getByRole("dialog", { name: "Riepilogo commessa DEMO-27" });
  verificaIntestazione(riepilogo, "Silvia Rossi");
  expect(within(riepilogo).getByText("Da incassare")).toBeInTheDocument();
  expect(within(riepilogo).getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", "/azienda/ordini/commessa");
  fireEvent.click(within(riepilogo).getByRole("button", { name: "Chiudi riepilogo commessa" }));
  expect(riepilogo).not.toBeInTheDocument();
});

it("mantiene l’anteprima aperta mentre si passa dalla scheda al riquadro", () => {
  vi.useFakeTimers();
  scheda();
  const titolo = screen.getByText("Silvia Rossi");
  fireEvent.pointerOver(titolo, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(650));
  const riepilogo = screen.getByRole("dialog", { name: "Riepilogo commessa DEMO-27" });
  fireEvent.pointerOut(titolo, { pointerType: "mouse" });
  fireEvent.pointerOver(riepilogo, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(300));
  expect(riepilogo).toBeInTheDocument();
  fireEvent.pointerOut(riepilogo, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(250));
  expect(riepilogo).not.toBeInTheDocument();
});

it("mostra fasi e task completati, materiali e squadra sulla scheda, con gli incassi nell’anteprima", () => {
  scheda({
    ...ordine, total_amount: 10000, vat_rate: 10, deposit_amount: 2500, deposit_paid: true,
    fasiPipeline: { total: 3, done: 1 },
    taskUfficioPipeline: { total: 4, done: 2 },
    order_items: [{ id: "m1", status: "in_magazzino", quantity: 1 }],
    order_external_teams: [{ external_team: { id: "s1", name: "Squadra A", kind: "interna" } }],
  });
  const t = within(screen.getByRole("group", { name: "Apri dettagli commessa DEMO-27" }));
  expect(t.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(t.getByText("1/3 completate")).toBeInTheDocument();
  expect(t.getByText("2/4 fatti")).toBeInTheDocument();
  expect(t.getByText("1/1 pronti")).toBeInTheDocument();
  expect(t.getByText("Squadra A")).toBeInTheDocument();
  expect(t.getByText("Importo contratto").nextElementSibling).toHaveTextContent(formatCurrency(11000).replace(/\u00a0/g, " "));
  expect(t.queryByText("Totale con IVA")).not.toBeInTheDocument();
  expect(t.queryByText("Incassato")).not.toBeInTheDocument();
  expect(t.queryByText("Da incassare")).not.toBeInTheDocument();
  expect(t.queryByText("Posa")).not.toBeInTheDocument();
  fireEvent.click(t.getByRole("button", { name: "Anteprima commessa DEMO-27" }));
  const anteprima = within(screen.getByRole("dialog", { name: "Riepilogo commessa DEMO-27" }));
  expect(anteprima.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(anteprima.getByText("2/4 fatti")).toBeInTheDocument();
  expect(anteprima.getByText("Squadre interne · Squadra A")).toBeInTheDocument();
  expect(anteprima.getByText("Totale con IVA").nextElementSibling).toHaveTextContent(formatCurrency(11000).replace(/\u00a0/g, " "));
  expect(anteprima.getByText("Incassato").nextElementSibling).toHaveTextContent(formatCurrency(2500).replace(/\u00a0/g, " "));
  expect(anteprima.getByText("Da incassare").nextElementSibling).toHaveTextContent(formatCurrency(8500).replace(/\u00a0/g, " "));
  expect(anteprima.queryByText("Data prevista")).not.toBeInTheDocument();
});

it("prepara un’email al cliente senza navigare e apre la commessa al clic sul titolo", () => {
  function Percorso() {
    return <output data-testid="percorso">{useLocation().pathname}</output>;
  }
  render(<MemoryRouter initialEntries={["/azienda/ordini"]}><PipelineDragScope>
    <div onClick={event => {
      if (event.target instanceof Element && event.target.closest('a[href^="mailto:"]')) event.preventDefault();
    }}>
      <OrdersPipelineCard order={{
        ...ordine,
        customer: { first_name: "SILVIA", last_name: "ROSSI", email: "silvia@no-email.ediliziaincloud.local" },
        client_email: "silvia+commesse@example.com",
      }} stage="firmato" isDraggable />
    </div>
    <Percorso />
  </PipelineDragScope></MemoryRouter>);
  const email = screen.getByRole("link", { name: "Scrivi al cliente · DEMO-27" });
  expect(email).toHaveAttribute("href", "mailto:silvia%2Bcommesse@example.com?subject=Commessa%20DEMO-27");
  fireEvent.click(email);
  expect(screen.getByTestId("percorso")).toHaveTextContent(/^\/azienda\/ordini$/);
  fireEvent.click(screen.getByText("Silvia Rossi"));
  expect(screen.getByTestId("percorso")).toHaveTextContent("/azienda/ordini/commessa");
});

it("distingue fasi e task assenti da quelli presenti ma ancora da completare", () => {
  const vuoto = { total: 0, done: 0 };
  const { rerender } = scheda({ ...ordine, fasiPipeline: vuoto, taskUfficioPipeline: vuoto });
  expect(screen.getByText("Da definire")).toBeInTheDocument();
  expect(screen.getByText("Nessuna attività")).toBeInTheDocument();
  rerender(<MemoryRouter><PipelineDragScope>
    <OrdersPipelineCard order={{ ...ordine, fasiPipeline: { total: 1, done: 0 }, taskUfficioPipeline: { total: 2, done: 0 } }} stage="firmato" />
  </PipelineDragScope></MemoryRouter>);
  expect(screen.getByText("0/1 completate")).toBeInTheDocument();
  expect(screen.getByText("0/2 fatti")).toBeInTheDocument();
});

it("usa il nominativo importato e toglie dalla descrizione solo le ripetizioni del cliente", () => {
  scheda({
    ...ordine,
    customer: null,
    client_name: "ESEMPIO COSTRUZIONI S.R.L.",
    description: `ESEMPIO COSTRUZIONI S.R.L. — ${ordine.description} — ESEMPIO COSTRUZIONI S.R.L.`,
  });
  verificaIntestazione(screen.getByRole("group", { name: "Apri dettagli commessa DEMO-27" }), "Esempio Costruzioni S.R.L.");
  expect(screen.getByText(ordine.description)).toBeInTheDocument();
});

it("mostra le scorciatoie effettive e rispetta i permessi di visibilità degli importi", () => {
  const { rerender } = scheda();
  expect(screen.getByRole("link", { name: "Fatture e incassi · DEMO-27" })).toHaveAttribute("href", "/azienda/ordini/commessa?tab=finanza&vista_economia=pagamenti");
  expect(screen.getByRole("link", { name: "Materiali · DEMO-27" })).toHaveAttribute("href", "/azienda/ordini/commessa?tab=articoli");
  expect(screen.getByRole("link", { name: "Cronoprogramma · DEMO-27" })).toHaveAttribute("href", "/azienda/ordini/commessa?tab=cantiere&vista_cantiere=cronoprogramma");
  expect(screen.getByRole("link", { name: "Squadra e lavorazioni · DEMO-27" })).toHaveAttribute("href", "/azienda/ordini/commessa?tab=cantiere&vista_cantiere=lavorazioni");

  rerender(<MemoryRouter><PipelineDragScope>
    <OrdersPipelineCard order={ordine} stage="firmato" showAmounts={false} />
  </PipelineDragScope></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Anteprima commessa DEMO-27" }));
  expect(screen.queryByText(/incassare/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Totale con IVA")).not.toBeInTheDocument();
  expect(screen.queryByText("Importo contratto")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Scrivi al cliente/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Modifica commessa/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sposta commessa/ })).not.toBeInTheDocument();
});

it("trascina la scheda dal testo, chiude l’anteprima e invia soltanto la fase di destinazione", async () => {
  const sposta = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const x = this.getAttribute("aria-label") === "Colonna In lavorazione" ? 280 : 0;
    return { x, y: 0, left: x, top: 0, right: x + 270, bottom: 220, width: 270, height: 220, toJSON: () => ({}) };
  });
  render(<MemoryRouter><OrdersPipelineView
    orders={[ordine]}
    statuses={[{ id: "firmato", name: "Firmato", color: "#2563eb" }, { id: "lavori", name: "In lavorazione", color: "#059669" }]}
    canEdit showAmounts onStatusChange={sposta}
  /></MemoryRouter>);
  const card = screen.getByRole("group", { name: "Apri dettagli commessa DEMO-27" });
  const titolo = within(card).getByText("Silvia Rossi");
  fireEvent.mouseDown(titolo, { button: 0, clientX: 40, clientY: 40 });
  fireEvent.mouseMove(document, { clientX: 80, clientY: 40 });
  await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
  expect(document.querySelector("[data-pipeline-drag-preview]")).toHaveTextContent(ordine.description);
  expect(screen.queryByRole("dialog", { name: /Riepilogo commessa/ })).not.toBeInTheDocument();
  fireEvent.mouseMove(document, { clientX: 340, clientY: 40 });
  fireEvent.mouseUp(document, { clientX: 340, clientY: 40 });
  await waitFor(() => expect(sposta).toHaveBeenCalledExactlyOnceWith("commessa", "lavori"));
  await new Promise(resolve => setTimeout(resolve, 60));
});
