import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { modelloComputoDiSerie } from "@/lib/computo/modelloComputo";
import ComputoModelloPanel from "@/components/computo/ComputoModelloPanel";

const stato = vi.hoisted(() => ({ mutate: vi.fn(), anteprima: vi.fn(), modello: {} as ReturnType<typeof modelloComputoDiSerie> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda", name: "Impresa demo" } }) }));
vi.mock("@/hooks/useQuoteTemplates", () => ({ useQuoteTemplates: () => ({ templates: [] as unknown[], isLoading: false }) }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => ({ modelli: [] as unknown[], inCaricamento: false }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: (props: { activeDestination?: string; destinationRequest?: number }) => { stato.anteprima(props); return <div>PDF reale</div>; } }));
vi.mock("@/components/preventivi/CondizioniContratto", () => ({ CondizioniContratto: (): null => null }));
vi.mock("@/lib/computo/modelloComputo", async original => ({
  ...await original<typeof import("@/lib/computo/modelloComputo")>(),
  useModelloComputo: () => ({ data: { modello: stato.modello, salvato: true }, isLoading: false, error: null as Error | null }),
  useSalvaModelloComputo: () => ({ mutate: stato.mutate, isPending: false }),
}));
beforeEach(() => { stato.modello = modelloComputoDiSerie(); stato.mutate.mockReset(); stato.anteprima.mockClear(); });

describe("builder modello aziendale", () => {
  it("riattiva la copertina Compatta e porta l'anteprima alla sua pagina", () => {
    stato.modello.copertina = "fascia";
    stato.modello.sezioni.copertina = false;
    render(<ComputoModelloPanel canEdit />);
    fireEvent.click(screen.getByRole("radio", { name: "Compatta" }));
    expect(stato.anteprima).toHaveBeenLastCalledWith(expect.objectContaining({ activeDestination: "computo.copertina", destinationRequest: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(stato.mutate).toHaveBeenCalledWith(expect.objectContaining({ copertina: "fascia", copertinaSeparata: true, sezioni: expect.objectContaining({ copertina: true }) }), expect.any(Object));
  });
  it("offre nove caratteri del sistema senza chiedere un file all'azienda", () => {
    render(<ComputoModelloPanel canEdit />);
    for (const nome of ["Helvetica", "Times", "Courier", "Lato", "PT Sans", "PT Serif", "Carlito", "Caladea", "EB Garamond"]) expect(screen.getByRole("radio", { name: nome })).toBeInTheDocument();
    expect(screen.queryByText(/Carica carattere personalizzato|Sostituisci carattere personalizzato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Lato$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(stato.mutate).toHaveBeenCalledWith(expect.objectContaining({ fontFamiglia: "lato" }), expect.any(Object));
  });
  it("regola titoli e testo, nasconde la testata e conserva i campi personalizzati", () => {
    render(<ComputoModelloPanel canEdit />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Titolo di copertina" }), { target: { value: "42" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Titoli delle sezioni" }), { target: { value: "14" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Testo del documento" }), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("switch", { name: "Intestazione aziendale in alto a sinistra" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagine e contenuti" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByText(/Campi personalizzati/));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi campo" }));
    fireEvent.change(screen.getByLabelText("Nome del campo 1"), { target: { value: "Garanzia" } });
    fireEvent.change(screen.getByLabelText("Codice per i testi 1"), { target: { value: "garanzia" } });
    fireEvent.change(screen.getByLabelText("Valore predefinito 1"), { target: { value: "10 anni" } });
    fireEvent.click(screen.getByRole("button", { name: /^Garanzia$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(stato.mutate).toHaveBeenCalledWith(expect.objectContaining({ dimensioneTitolo: 42, dimensioneSottotitoli: 14, dimensioneTesto: 11, mostraIntestazione: false,
      campiPersonalizzati: [{ chiave: "garanzia", etichetta: "Garanzia", valore: "10 anni", mostraNelDocumento: true }], premessa: "{{custom.garanzia}}" }), expect.any(Object));
  });
  it("legge anche il modello della cache precedente e impedisce codici custom duplicati", () => {
    stato.modello = { copertina: "fascia" } as ReturnType<typeof modelloComputoDiSerie>;
    render(<ComputoModelloPanel canEdit />);
    expect(screen.getByRole("spinbutton", { name: "Titolo di copertina" })).toHaveValue(34);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagine e contenuti" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByText(/Campi personalizzati/));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi campo" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi campo" }));
    fireEvent.change(screen.getByLabelText("Codice per i testi 2"), { target: { value: "campo_1" } });
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
  });
  it("salva l'esclusione dell'intera accettazione insieme a copertina e font", () => {
    render(<ComputoModelloPanel canEdit />);
    fireEvent.click(screen.getByRole("radio", { name: "Editoriale" }));
    fireEvent.click(screen.getByRole("radio", { name: "Times" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagine e contenuti" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("switch", { name: "Pagina «Per accettazione»" }));
    expect(screen.getByText(/è esclusa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(stato.mutate).toHaveBeenCalledWith(expect.objectContaining({ copertina: "editoriale", fontFamiglia: "times", mostraFirma: false,
      sezioni: expect.objectContaining({ firme: false, lavorazioni: true }) }), expect.any(Object));
  });
  it("annulla le modifiche e protegge i comandi quando il ruolo è in sola lettura", () => {
    const vista = render(<ComputoModelloPanel canEdit />);
    fireEvent.click(screen.getByRole("radio", { name: "Essenziale" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifiche" }));
    expect(screen.getByRole("radio", { name: "Architettura" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Salva modello" })).toBeDisabled();
    vista.unmount(); render(<ComputoModelloPanel canEdit={false} />);
    expect(screen.getByRole("radio", { name: "Editoriale" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva modello" })).not.toBeInTheDocument();
    expect(stato.mutate).not.toHaveBeenCalled();
  });
});
