import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { source, catalog } from "./apartmentFixtures";
import { formatCurrency as currency } from "@/lib/formatters";
const formatCurrency = (n: number) => currency(n).replace(/\u00a0/g, " ");
const data = vi.hoisted(() => ({ sources: [] as unknown[], rows: [] as unknown[], error: null as Error | null, fetching: false, refetch: vi.fn() }));
vi.mock("@/lib/prezzario/queries", () => ({
  usePrezzarioFonti: () => ({ data: data.sources, isLoading: false, error: null as Error | null, refetch: data.refetch }),
  usePrezzarioVociPerCodici: () => ({ data: data.rows, isFetching: data.fetching, isError: !!data.error, error: data.error, refetch: data.refetch }),
}));
import LombardiaApartmentLab from "@/components/quotes/dev/LombardiaApartmentLab";
afterEach(cleanup);
beforeEach(() => { data.sources = [source]; data.rows = catalog; data.error = null; data.fetching = false; data.refetch.mockClear(); });
function open() { render(<LombardiaApartmentLab companyName="Demo Azienda 2" />); }
function load() {
  fireEvent.click(screen.getByRole("checkbox", { name: /Confermo l’uso/ }));
  fireEvent.click(screen.getByRole("button", { name: "Carica risposte di esempio" }));
}
function confirmFloor() { fireEvent.click(screen.getByRole("checkbox", { name: "Conferma Pavimento monocottura 30×30 su letto in malta" })); }
describe("Fonte reale, computo locale: interazioni senza scritture", () => {
  it("conferma solo le voci verificate e non mostra IVA 0% o un totale completo", () => {
    open(); load(); expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(0));
    confirmFloor(); expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(8000));
    expect(screen.queryByText("IVA 0%")).not.toBeInTheDocument();
    expect(screen.queryByText("Totale IVA inclusa")).not.toBeInTheDocument();
    expect(screen.getAllByText("Parziale netto · IVA da definire")).toHaveLength(2);
  });
  it("un edit revoca l'approvazione, conserva riferimento e non rilegge il catalogo", () => {
    open(); load(); confirmFloor();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Prezzo Pavimento monocottura 30×30 su letto in malta" }), { target: { value: "55" } });
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(0));
    expect(screen.getByText(/Prezzo manuale · riferimento/)).toHaveTextContent(formatCurrency(100));
    confirmFloor(); expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(4400));
    expect(data.refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina prezzo regionale" }));
    expect(screen.getByRole("spinbutton", { name: "Prezzo Pavimento monocottura 30×30 su letto in malta" })).toHaveValue(100);
  });
  it("cancellare la quantità non la trasforma in zero o uno", () => {
    open(); load(); confirmFloor();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantità Pavimento monocottura 30×30 su letto in malta" }), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Conferma Pavimento monocottura 30×30 su letto in malta" })).toBeDisabled();
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(0));
  });
  it("durante la lettura e in errore non usa prezzi vecchi o sintetici", () => {
    data.fetching = true; const view = render(<LombardiaApartmentLab companyName="Demo" />);
    load(); expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    data.fetching = false; data.error = new Error("Lettura interrotta"); view.rerender(<LombardiaApartmentLab companyName="Demo" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nessun prezzo sintetico sostitutivo");
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(0));
  });
  it("cambiare fonte revoca prezzi manuali e conferme; nessuna traduzione automatica", () => {
    data.sources = [source, { ...source, id: "new-edition", anno: 2026, nome: "Lombardia 2026" }];
    open(); load(); confirmFloor();
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte Lombardia" }), { target: { value: "new-edition" } });
    expect(screen.getByRole("checkbox", { name: /Confermo l’uso/ })).toBeDisabled();
    expect(screen.getByTestId("live-quote-total")).toHaveTextContent(formatCurrency(0));
  });
  it("rieseguire un caso non duplica righe e le misure ipotetiche sono dichiarate", () => {
    open(); load(); const count = screen.getAllByRole("spinbutton").length;
    fireEvent.click(screen.getByRole("button", { name: "Carica risposte di esempio" }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(count);
    expect(screen.getByText(/Risposte di esempio caricate/)).toHaveTextContent("non rilievi né deduzioni");
  });
});
