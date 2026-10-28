import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  PipelineCardHeading,
  PipelineDragScope,
  PipelineDrop,
  PipelineMoveCard,
} from "@/components/orders/PipelineDrag";
import { OperationalColumnFrame } from "@/components/orders/OperationalBoard";

const move = vi.fn();
const action = vi.fn();
const openCard = vi.fn();
function setup(readonly = false) {
  return render(
    <PipelineDragScope onMove={readonly ? undefined : move}>
      <PipelineDrop id="draft" label="Bozza">
        <PipelineMoveCard
          id="doc"
          label="Documento"
          stage="draft"
          onOpen={openCard}
          actions={<button onClick={action}>PDF</button>}
          targets={[
            { id: "draft", label: "Bozza" },
            { id: "done", label: "Completato" },
          ]}
        >
          <article>
            <PipelineCardHeading>
              <p>Contenuto da trascinare</p>
            </PipelineCardHeading>
            <a href="/detail" onClick={(event) => event.preventDefault()}>
              Apri documento
            </a>
            <button onClick={action}>Modifica</button>
          </article>
        </PipelineMoveCard>
      </PipelineDrop>
      <PipelineDrop id="done" label="Completato">
        Destinazione
      </PipelineDrop>
    </PipelineDragScope>,
  );
}
const bounds = (x: number, width: number, height = 200) => ({
  x,
  y: 0,
  left: x,
  top: 0,
  right: x + width,
  bottom: height,
  width,
  height,
  toJSON: () => ({}),
});
beforeEach(() => {
  move.mockReset();
  action.mockReset();
  openCard.mockReset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute("aria-label") === "Colonna Completato")
        return bounds(260, 252);
      return bounds(0, 252);
    },
  );
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // dnd-kit retains its document click guard for 50 ms after a drop.
  await new Promise((resolve) => setTimeout(resolve, 60));
});
async function drag(element: HTMLElement) {
  fireEvent.mouseDown(element, { button: 0, clientX: 40, clientY: 40 });
  fireEvent.mouseMove(document, { clientX: 80, clientY: 40 });
  await waitFor(() =>
    expect(
      screen.getByRole("group", { name: "Trascina Documento" }),
    ).toHaveAttribute("aria-pressed", "true"),
  );
  fireEvent.mouseMove(document, { clientX: 320, clientY: 40 });
  fireEvent.mouseUp(document, { clientX: 320, clientY: 40 });
}
describe("Trascinamento dell’intera scheda", () => {
  it("apre dal rettangolo e con Invio, senza aprire dai comandi superiori", () => {
    setup();
    const card = screen.getByRole("group", { name: "Trascina Documento" });
    fireEvent.click(screen.getByText("Contenuto da trascinare"));
    fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
    expect(openCard).toHaveBeenCalledTimes(2);
    const pdf = screen.getByRole("button", { name: "PDF" });
    expect(pdf.closest("[data-pipeline-card-heading]")).toHaveTextContent(
      "Contenuto da trascinare",
    );
    fireEvent.click(pdf);
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    fireEvent.click(screen.getByRole("link", { name: "Apri documento" }));
    fireEvent.click(screen.getByRole("button", { name: "Sposta Documento" }));
    expect(action).toHaveBeenCalledTimes(2);
    expect(openCard).toHaveBeenCalledTimes(2);
    expect(move).not.toHaveBeenCalled();
  });
  it("apre anche in sola lettura senza rendere disponibili spostamenti", () => {
    setup(true);
    const card = screen.getByRole("group", { name: "Apri Documento" });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: " ", code: "Space" });
    expect(openCard).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Sposta Documento" }),
    ).toBeNull();
  });

  it("sposta dal testo della scheda e non richiede una maniglia", async () => {
    setup();
    await drag(screen.getByText("Contenuto da trascinare"));
    await waitFor(() =>
      expect(move).toHaveBeenCalledExactlyOnceWith("doc", "done"),
    );
    fireEvent.click(screen.getByText("Contenuto da trascinare"));
    expect(openCard).not.toHaveBeenCalled();
  });
  it("mantiene tutti i contenuti e le dimensioni della scheda nell’anteprima", async () => {
    const { container } = setup();
    const card = screen.getByRole("group", { name: "Trascina Documento" });
    fireEvent.mouseDown(screen.getByText("Contenuto da trascinare"), {
      button: 0,
      clientX: 40,
      clientY: 40,
    });
    fireEvent.mouseMove(document, { clientX: 80, clientY: 40 });
    await waitFor(() => expect(card).toHaveAttribute("aria-pressed", "true"));
    const preview = container.querySelector("[data-pipeline-drag-preview]");
    expect(preview).toHaveTextContent("Contenuto da trascinare");
    expect(preview).toHaveTextContent("Apri documento");
    expect(preview).toHaveTextContent("Modifica");
    expect(preview).not.toHaveTextContent("Sposta in");
    expect(preview).toHaveStyle({ width: "252px", height: "200px" });
    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() =>
      expect(
        container.querySelector("[data-pipeline-drag-preview]"),
      ).toBeNull(),
    );
    expect(move).not.toHaveBeenCalled();
  });
  it("permette di trascinare anche dal link, senza aprire il documento", async () => {
    setup();
    await drag(screen.getByRole("link", { name: "Apri documento" }));
    await waitFor(() =>
      expect(move).toHaveBeenCalledExactlyOnceWith("doc", "done"),
    );
  });
  it("rilasciare fuori dalle colonne annulla lo spostamento", async () => {
    setup();
    fireEvent.mouseDown(screen.getByText("Contenuto da trascinare"), {
      button: 0,
      clientX: 40,
      clientY: 40,
    });
    fireEvent.mouseMove(document, { clientX: 80, clientY: 40 });
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Trascina Documento" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    fireEvent.mouseMove(document, { clientX: 900, clientY: 300 });
    fireEvent.mouseUp(document, { clientX: 900, clientY: 300 });
    expect(move).not.toHaveBeenCalled();
  });
  it("spazio su un’azione interna non solleva la scheda", () => {
    setup();
    fireEvent.keyDown(screen.getByRole("button", { name: "Modifica" }), {
      code: "Space",
      key: " ",
    });
    expect(
      screen.getByRole("group", { name: "Trascina Documento" }),
    ).not.toHaveAttribute("aria-pressed", "true");
    expect(move).not.toHaveBeenCalled();
  });
  it("i pulsanti interni non attivano un trascinamento", () => {
    setup();
    const button = screen.getByRole("button", { name: "Modifica" });
    fireEvent.mouseDown(button, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.mouseMove(document, { clientX: 320, clientY: 40 });
    fireEvent.mouseUp(document);
    fireEvent.click(button);
    expect(move).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("group", { name: "Trascina Documento" }),
    ).not.toHaveAttribute("aria-pressed", "true");
  });
  it("un click sul collegamento e la sola lettura non avviano spostamenti", () => {
    setup(true);
    fireEvent.click(screen.getByRole("link", { name: "Apri documento" }));
    expect(move).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("group", { name: "Trascina Documento" }),
    ).not.toBeInTheDocument();
  });
  it("comprime le fasi vuote e le riapre quando arriva una scheda, rispettando la scelta manuale", () => {
    const frame = (count: number) => (
      <PipelineDragScope onMove={move}>
        <OperationalColumnFrame
          id="done"
          label="Completato"
          count={count}
          hint="Documenti"
        >
          <p>Scheda di prova</p>
        </OperationalColumnFrame>
      </PipelineDragScope>
    );
    const { rerender } = render(frame(0));
    expect(
      screen.getByRole("button", { name: "Espandi Completato" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Scheda di prova")).not.toBeInTheDocument();
    rerender(frame(1));
    expect(screen.getByText("Scheda di prova")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Comprimi Completato" }),
    );
    rerender(frame(2));
    expect(screen.queryByText("Scheda di prova")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
  it("comprime e riapre una fase mantenendo il conteggio e la destinazione", () => {
    render(
      <PipelineDragScope onMove={move}>
        <OperationalColumnFrame
          id="done"
          label="Completato"
          count={3}
          hint="Documenti completati"
          accent="border-t-green-500"
        >
          <p>Scheda visibile</p>
        </OperationalColumnFrame>
      </PipelineDragScope>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Comprimi Completato" }),
    );
    expect(screen.queryByText("Scheda visibile")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Colonna Completato" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Espandi Completato" }));
    expect(screen.getByText("Scheda visibile")).toBeInTheDocument();
  });
});
