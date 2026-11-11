import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  carica: vi.fn(),
  pagina: vi.fn(),
  testo: vi.fn(),
  disegna: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: m.carica,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "worker-pdf.js",
}));
import { PdfRigaConfronto } from "@/components/fatturazione/PdfRigaConfronto";
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  m.testo.mockReset().mockResolvedValue({ items: [] });
  m.disegna.mockReset().mockImplementation(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  m.pagina.mockReset().mockResolvedValue({
    getViewport: () => ({ width: 600, height: 840 }),
    getTextContent: m.testo,
    render: m.disegna,
  });
  const task = {
    destroy: vi.fn(),
    promise: Promise.resolve({
      numPages: 2,
      getPage: m.pagina,
      loadingTask: { destroy: vi.fn() },
    }),
  };
  m.carica.mockReset().mockReturnValue(task);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("mostra anche i PDF scansionati e cambia pagina senza dipendere dal visualizzatore del browser", async () => {
  const { container } = render(
    <PdfRigaConfronto
      url="https://files.example.test/bolla.pdf"
      nome="Bolla"
    />,
  );
  expect(await screen.findByLabelText("Pagina 1 di Bolla")).toBeInTheDocument();
  await waitFor(() => expect(m.disegna).toHaveBeenCalled());
  expect(m.testo).not.toHaveBeenCalled();
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Pagina PDF successiva" }),
  );
  await waitFor(() => expect(m.pagina).toHaveBeenCalledWith(2));
  expect(screen.getByLabelText("Pagina 2 di Bolla")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pagina PDF successiva" }),
  ).toBeDisabled();
});
it("senza testo riconoscibile conserva l’anteprima della scansione senza inventare evidenziazioni", async () => {
  render(
    <PdfRigaConfronto
      url="https://files.example.test/scansione.pdf"
      nome="Scansione"
      ricerca="Condizionatore"
    />,
  );
  await screen.findByText(/Voce non trovata nel testo/);
  expect(screen.getByLabelText("Pagina 1 di Scansione")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Riga trovata nel PDF"),
  ).not.toBeInTheDocument();
});
it("un caricamento fallito produce un errore leggibile e nessun riquadro PDF vuoto", async () => {
  m.carica.mockReturnValue({
    promise: Promise.reject(new Error("403")),
    destroy: vi.fn(),
  });
  const { container } = render(
    <PdfRigaConfronto
      url="https://files.example.test/negato.pdf"
      nome="Negato"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Puoi aprire l’originale",
  );
  expect(container.querySelector("iframe")).toBeNull();
});

it("se la ricerca testuale fallisce permette comunque di consultare le pagine", async () => {
  m.testo.mockRejectedValue(new Error("Testo non leggibile"));
  render(
    <PdfRigaConfronto
      url="https://files.example.test/scansione.pdf"
      nome="Scansione"
      ricerca="Condizionatore"
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Puoi comunque sfogliare il PDF",
  );
  expect(screen.getByLabelText("Pagina 1 di Scansione")).toBeInTheDocument();
});
