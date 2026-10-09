import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EmessaImportataDettaglio } from "@/components/fatturazione/EmessaImportataDettaglio";
import FattureEmesseImportate from "@/pages/azienda/fatturazione/FattureEmesseImportate";

const state = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  filters: [] as unknown[][],
  xml: vi.fn(), download: vi.fn(), error: null as Error | null,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));
// I collegamenti operativi hanno test propri; qui verifichiamo il documento fiscale in sola lettura.
vi.mock("@/components/fatturazione/CollegamentiEmessaImportata", () => ({ CollegamentiEmessaImportata: (): null => null }));
vi.mock("@/components/fatturazione/RecuperaClientiImportati", () => ({ RecuperaClientiImportati: (): null => null }));
vi.mock("@/lib/fatturazione/originaleEmessaImportata", () => ({
  leggiOriginaleEmessa: (...args: unknown[]) => state.xml(...args),
  scaricaFileOriginale: (...args: unknown[]) => state.download(...args),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabella: string) => {
    const query: Record<string, unknown> = {};
    for (const nome of ["select", "eq", "is", "not", "order", "limit", "range"]) query[nome] = (...args: unknown[]) => {
      state.filters.push([tabella, nome, ...args]); return query;
    };
    query.maybeSingle = async () => ({ data: state.invoice, error: state.error });
    query.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: state.invoice ? [state.invoice] : [], error: state.error }).then(ok);
    return query;
  },
} }));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.invoice = {
    id: "inv-1", company_id: "az-1", invoice_number: "FPR 10/26", document_type: "invoice", status: "issued", issue_date: "2026-10-01",
    external_provider: "xml_import", external_xml_url: null, deleted_at: null,
    client_company_name: "Mario Rossi", client_fiscal_code: "RSSMRA80A01H501U", client_address: "Via Prova 10",
    client_city: "Roma", client_zip: "00100", client_country: "IT", client_vat_number: null,
    subtotal: 100, tax_amount: 22, total: 122.02, paid_amount: 80, due_date: "2026-11-01", payment_method: "MP05", bank_iban: "IT00DEMO",
    invoice_lines: [{ id: "r-1", description: "Posa serramenti\nDettaglio completo", quantity: 2, unit: "pz", unit_price: 50, tax_rate: 22, line_net: 100, sort_order: 0 }],
  };
  state.filters.length = 0; state.xml.mockReset(); state.download.mockReset(); state.error = null;
});
afterEach(() => { cleanup(); client.clear(); });
const mostra = () => render(<QueryClientProvider client={client}><EmessaImportataDettaglio id="inv-1" companyId="az-1" onClose={vi.fn()} /></QueryClientProvider>);

describe("Dettaglio fattura emessa importata", () => {
  it("mostra CF, indirizzo, descrizioni e totali archiviati, in sola lettura", async () => {
    mostra();
    expect(await screen.findByText("RSSMRA80A01H501U")).toBeInTheDocument();
    expect(screen.getByText("Via Prova 10")).toBeInTheDocument();
    expect(screen.getByText("00100 Roma")).toBeInTheDocument();
    expect(screen.getByText(/Posa serramenti/)).toHaveTextContent("Dettaglio completo");
    expect(within(screen.getByRole("region", { name: "Righe della fattura" })).getByText(/Totale 122,02/)).toBeInTheDocument();
    expect(screen.getByText(/Incassato registrato/).nextElementSibling).toHaveTextContent("80,00");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Invia|Salva|Emetti|Elimina/ })).toBeNull();
    expect(state.filters).toContainEqual(["invoices", "eq", "company_id", "az-1"]);
    expect(state.filters).toContainEqual(["invoices", "eq", "id", "inv-1"]);
    expect(state.filters).toContainEqual(["invoices", "is", "deleted_at", null]);
    expect(state.filters).toContainEqual(["invoices", "not", "external_provider", "is", null]);
  });
  it("non inventa l'XML delle fatture vecchie né tenta di scaricare un file assente", async () => {
    mostra(); await screen.findByText("RSSMRA80A01H501U");
    expect(screen.getByText(/non il file XML/)).toHaveTextContent("senza duplicarle");
    expect(screen.queryByRole("button", { name: "Visualizza XML" })).toBeNull();
    expect(state.xml).not.toHaveBeenCalled();
  });
  it("scarica solo su richiesta e visualizza l'XML come testo non eseguibile", async () => {
    state.invoice!.external_xml_url = "fatture-xml/az-1/f.xml";
    const xml = '<FatturaElettronica><script>alert("NON ESEGUIRE")</script></FatturaElettronica>';
    const file = new Blob([xml]);
    state.xml.mockResolvedValue({ file, nome: "f.xml", xml, firmato: false });
    mostra(); const button = await screen.findByRole("button", { name: "Visualizza XML" });
    expect(state.xml).not.toHaveBeenCalled(); fireEvent.click(button);
    expect(await screen.findByLabelText("Contenuto XML originale")).toHaveTextContent(xml);
    expect(document.querySelector("script")).toBeNull();
    expect(state.xml).toHaveBeenCalledExactlyOnceWith("fatture-xml/az-1/f.xml", "az-1");
    fireEvent.click(screen.getByRole("button", { name: "Scarica XML originale" }));
    expect(state.download).toHaveBeenCalledExactlyOnceWith(file, "f.xml");
  });
  it("un file inaccessibile segnala l'errore e permette di riprovare", async () => {
    state.invoice!.external_xml_url = "fatture-xml/az-1/f.xml";
    state.xml.mockRejectedValue(new Error("File non disponibile"));
    mostra(); fireEvent.click(await screen.findByRole("button", { name: "Visualizza XML" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("File non disponibile");
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
  it("nessuna fattura accessibile: non mostra dati residui o controlli XML", async () => {
    state.invoice = null; mostra();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare");
    expect(screen.queryByText("RSSMRA80A01H501U")).toBeNull();
    expect(state.xml).not.toHaveBeenCalled();
  });
  it("dalla lista si cerca anche per CF e si apre il dettaglio senza cambiare pagina", async () => {
    render(<MemoryRouter><QueryClientProvider client={client}><FattureEmesseImportate /></QueryClientProvider></MemoryRouter>);
    await screen.findByRole("button", { name: "Apri fattura FPR 10/26" });
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca fatture importate" }), { target: { value: "RSSMRA80" } });
    expect(screen.getByRole("button", { name: "Apri fattura FPR 10/26" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri fattura FPR 10/26" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("RSSMRA80A01H501U"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Chiudi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

const elenco = () => render(<MemoryRouter><QueryClientProvider client={client}><FattureEmesseImportate /></QueryClientProvider></MemoryRouter>);

describe("Dati utili direttamente nell'elenco emesse importate", () => {
  it("mostra CF, indirizzo, descrizione e scadenza senza aprire la fattura", async () => {
    elenco(); await screen.findByRole("button", { name: "Apri fattura FPR 10/26" });
    expect(screen.getByText("CF: RSSMRA80A01H501U")).toBeInTheDocument();
    expect(screen.getByText("Via Prova 10 · 00100 Roma")).toBeInTheDocument();
    expect(screen.getByText(/Posa serramenti/)).toBeInTheDocument();
    expect(screen.getByText("Scad. 01/11/2026")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull(); expect(state.xml).not.toHaveBeenCalled();
    expect(state.filters).toContainEqual(["invoices", "limit", 1, { referencedTable: "invoice_lines" }]);
    expect(state.filters).toContainEqual(["invoices", "order", "sort_order", { ascending: true, referencedTable: "invoice_lines" }]);
    expect(state.filters).toContainEqual(["invoices", "eq", "company_id", "az-1"]);
    expect(state.filters).toContainEqual(["invoices", "not", "external_provider", "is", null]);
  });
  it("mostra anche la P.IVA quando presente", async () => {
    state.invoice!.client_vat_number = "01234567890"; elenco();
    expect(await screen.findByText("P.IVA: 01234567890")).toBeInTheDocument();
  });
  it("l'XML assente è dichiarato: nessun pulsante di download ingannevole", async () => {
    elenco(); expect(await screen.findByText("Non archiviato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Visualizza XML della fattura/ })).toBeNull();
    expect(state.xml).not.toHaveBeenCalled();
  });
  it("il pulsante XML apre direttamente il contenuto in sola lettura", async () => {
    state.invoice!.external_xml_url = "fatture-xml/az-1/f.xml";
    const xml = "<FatturaElettronica>Originale</FatturaElettronica>";
    state.xml.mockResolvedValue({ xml, file: new Blob([xml]), nome: "f.xml", firmato: false });
    elenco(); const button = await screen.findByRole("button", { name: "Visualizza XML della fattura FPR 10/26" });
    expect(state.xml).not.toHaveBeenCalled(); fireEvent.click(button);
    expect(await screen.findByLabelText("Contenuto XML originale")).toHaveTextContent(xml);
    expect(state.xml).toHaveBeenCalledExactlyOnceWith("fatture-xml/az-1/f.xml", "az-1");
  });
  it("le descrizioni complete restano a un clic dalla loro anteprima", async () => {
    elenco(); fireEvent.click(await screen.findByRole("button", { name: "Vedi tutte le righe della fattura FPR 10/26" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Dettaglio completo"));
  });
  it("gestisce CF e righe assenti senza nascondere la fattura", async () => {
    state.invoice!.client_fiscal_code = null; state.invoice!.invoice_lines = []; state.invoice!.due_date = null;
    elenco(); expect(await screen.findByText("CF / P.IVA non archiviati")).toBeInTheDocument();
    expect(screen.getByText("Descrizione non archiviata")).toBeInTheDocument();
    expect(screen.getByText("Scadenza non archiviata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dettagli della fattura FPR 10/26" })).toBeInTheDocument();
  });
  it.each(["via prova", "roma", "00100"])("ricerca anche l'indirizzo: %s", async ricerca => {
    elenco(); await screen.findByRole("button", { name: "Apri fattura FPR 10/26" });
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca fatture importate" }), { target: { value: ricerca } });
    expect(screen.getByRole("button", { name: "Apri fattura FPR 10/26" })).toBeInTheDocument();
  });
});
