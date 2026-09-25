import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuoteLivePreviewPanel, type QuoteLivePreviewProps } from "@/components/quotes/QuoteLivePreviewPanel";
import type { QuoteItemPro } from "@/types/quoteItem";
import { formatCurrency } from "@/lib/formatters";

const line = (overrides: Partial<QuoteItemPro> = {}): QuoteItemPro => ({
  item_type: "product", item_category: "prodotto", name: "Finestra di prova", description: "Configurazione scelta", quantity: 2, unit_price: 100, discount_percent: 0, vat_rate: 22, unit_of_measure: "pz", sort_order: 0, mostra_nel_pdf: true, ...overrides,
} as QuoteItemPro);
const props: QuoteLivePreviewProps = {
  template: { cover_title: "Una proposta per {{cliente.nome_completo}}", payment_terms_text: "", delivery_terms_text: "" },
  companyName: "Impresa test", clientName: "Cliente di prova", title: "Nuove finestre", validityDays: 30,
  items: [line()], subtotal: 200, net: 180, total: 219.6, vatBreakdown: { "22": 39.6 }, discountPercent: 10, manualPrice: false,
  showPrices: true, onlyTotal: false, showDiscounts: true, showNotes: true, showConditions: true, showSignature: true,
  paymentMethod: "Bonifico", paymentPhases: [],
};
afterEach(cleanup);

describe("Anteprima live del preventivo classico", () => {
  it("usa cliente e prodotti reali e si aggiorna senza generare o salvare un PDF", () => {
    const { rerender } = render(<QuoteLivePreviewPanel {...props} />);
    expect(screen.getByText("Cliente di prova")).toBeInTheDocument();
    expect(screen.getByText("Finestra di prova")).toBeInTheDocument();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(219.6));
    rerender(<QuoteLivePreviewPanel {...props} clientName="Altro cliente" total={109.8} net={90} subtotal={100} vatBreakdown={{ "22": 19.8 }} />);
    expect(screen.getByText("Altro cliente")).toBeInTheDocument();
    expect(screen.queryByText("Cliente di prova")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(109.8));
  });
  it("sostituisce i segnaposto della copertina e gestisce una foto non disponibile", () => {
    render(<QuoteLivePreviewPanel {...props} template={{ ...props.template, show_cover_image: true }} coverSrc="/missing-cover.jpg" />);
    fireEvent.click(screen.getByRole("button", { name: "Copertina" }));
    expect(screen.getByText("Una proposta per Cliente di prova")).toBeInTheDocument();
    fireEvent.error(screen.getByAltText(""));
    expect(screen.queryByAltText("")).not.toBeInTheDocument();
  });
  it("non espone righe nascoste, distingue gli optional e usa i totali autoritativi", () => {
    render(<QuoteLivePreviewPanel {...props} items={[line({ name: "Nascosta", mostra_nel_pdf: false }), line({ name: "Optional", is_optional: true })]} />);
    expect(screen.queryByText("Nascosta")).not.toBeInTheDocument();
    expect(screen.getByText("Opzionale · escluso dal totale")).toBeInTheDocument();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(219.6));
    expect(screen.getByText(/Le righe nascoste/)).toBeInTheDocument();
  });
  it("con prezzo manuale non mostra prezzi riga ingannevoli", () => {
    render(<QuoteLivePreviewPanel {...props} manualPrice subtotal={1000} net={900} total={1098} vatBreakdown={{ "22": 198 }} />);
    expect(screen.getByText("Prezzo concordato")).toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(200))).not.toBeInTheDocument();
    expect(screen.getByTestId("live-quote-total").textContent).toBe(formatCurrency(1098));
  });
  it("rispetta solo totale e i controlli di visibilità di note, condizioni e firma", () => {
    render(<QuoteLivePreviewPanel {...props} onlyTotal notes="Nota riservata al documento" showNotes={false} showSignature={false} showConditions={false} template={{ contractual_terms_text: "Clausola test" }} />);
    expect(screen.queryByText("Finestra di prova")).not.toBeInTheDocument();
    expect(screen.queryByText("Nota riservata al documento")).not.toBeInTheDocument();
    expect(screen.queryByText("Clausola test")).not.toBeInTheDocument();
    expect(screen.queryByText(/Data e firma/)).not.toBeInTheDocument();
    expect(screen.getByText("IVA 22%")).toBeInTheDocument();
  });
  it("ricalcola il piano pagamenti sul totale mostrato", () => {
    render(<QuoteLivePreviewPanel {...props} paymentPhases={[{ label: "Acconto", type: "deposit", percent: 30, amount: 0 }, { label: "Saldo", type: "balance", percent: 70, amount: 0 }]} />);
    expect(screen.getByText(/Acconto: 30%/).textContent).toContain(formatCurrency(65.88));
    expect(screen.getByText(/Saldo: 70%/).textContent).toContain(formatCurrency(153.72));
  });
});

const manualFlag = vi.hoisted(() => ({ data: false, isLoading: false, isError: false }));
vi.mock("@/hooks/usePrezzoFinaleAMano", () => ({ usePrezzoFinaleAMano: () => manualFlag }));
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";

describe("Prezzo manuale individuabile e reversibile", () => {
  it("mostra perché non è abilitato senza scavalcare le impostazioni aziendali", () => {
    render(<PrezzoPreventivoAMano id="manual" companyId="demo" value={null} sommaVoci={200} onCommit={vi.fn()} showDisabledHint />);
    expect(screen.getByText(/Disponibile quando l'azienda/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("applica il prezzo con Invio e permette di tornare alle righe", () => {
    manualFlag.data = true;
    const commit = vi.fn();
    render(<PrezzoPreventivoAMano id="manual" companyId="demo" value={200} sommaVoci={200} onCommit={commit} showDisabledHint />);
    const input = screen.getByRole("spinbutton");
    input.focus();
    fireEvent.change(input, { target: { value: "1000.50" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).toHaveBeenCalledWith(1000.5);
    fireEvent.click(screen.getByRole("button", { name: "Torna alla somma delle righe" }));
    expect(commit).toHaveBeenLastCalledWith(null);
    manualFlag.data = false;
  });
});
