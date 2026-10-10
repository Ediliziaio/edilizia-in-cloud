/**
 * Impostazioni → Listino → Importa (10/10/2026).
 *
 * La schermata parte su «Prodotti / Articoli», che scrive nel vecchio catalogo articoli (ordini e computo dei
 * preventivi edili) e non nei prodotti del Listino; «Famiglie Prodotto» forzava «a pezzo» e «senza tipologia» senza
 * dirlo, e il suo modello non ha le colonne del prezzo. Il tipo di partenza resta lo stesso (decisione D1 di Florin
 * ancora aperta): oggi ogni voce ha il suo nome vero, dice dove vanno i dati e cosa decide da sola.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsCatalogImport from "@/pages/azienda/settings/SettingsCatalogImport";
import type { ParsedRow } from "@/lib/catalogo/listinoParser";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  parse: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  customFields: [] as { id: string }[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" }, effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: state.invoke },
    storage: { from: () => ({ upload: async () => ({ error: null as unknown }), remove: async () => ({ error: null as unknown }) }) },
  },
}));
vi.mock("@/hooks/useCompanyCustomFields", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useCompanyCustomFields")>()),
  useCompanyCustomFields: () => ({ data: state.customFields }),
}));
vi.mock("@/lib/catalogo/listinoParser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogo/listinoParser")>()),
  parseListinoFile: state.parse,
}));
vi.mock("@/lib/catalogo/listinoTemplate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogo/listinoTemplate")>()),
  downloadListinoTemplateXlsx: vi.fn(),
  downloadListinoTemplateCsv: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error, warning: state.warning, info: vi.fn() } }));

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});

const righe = (n: number): ParsedRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rowIndex: i + 1,
    raw: {} as Record<string, string>,
    normalized: { name: `Voce ${i + 1}`, list_price: 10 + i } as Record<string, unknown>,
    customFieldValues: {} as Record<string, unknown>,
    errors: [] as string[],
    warnings: [] as string[],
  }));

function open(percorso = "/azienda/impostazioni/listino/import") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}><SettingsCatalogImport /></MemoryRouter>
    </QueryClientProvider>,
  );
}
async function scegli(nome: string, selettore = "Cosa stai importando?") {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: selettore }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: nome }));
}
async function finoAllaConferma(file = new File(["x"], "listino.xlsx")) {
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  fireEvent.change(screen.getByLabelText(/File Excel/), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Avanti" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
}
const testo = () => document.body.textContent ?? "";

beforeEach(() => {
  state.invoke.mockReset().mockResolvedValue({ data: { inserted: 2, updated: 0, skipped: 0, errors: [] }, error: null as unknown });
  state.parse.mockReset().mockResolvedValue(righe(2));
  state.success.mockClear();
  state.error.mockClear();
  state.warning.mockClear();
  state.customFields = [];
});
afterEach(() => cleanup());

describe("Importa: la pagina", () => {
  it("niente doppio titolo, niente riquadro del consumo AI, un solo rimando che porta al listino", () => {
    open();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "Importa da Excel, CSV o PDF" })).toBeInTheDocument();
    expect(testo()).not.toContain("Consumo AI");
    expect(testo()).not.toContain("Suggerimenti");
    expect(screen.getByRole("link", { name: /Torna al listino/ })).toHaveAttribute("href", "/azienda/impostazioni/listino");
  });

  it("nessuna parola inglese o da programmatore nei passi", async () => {
    open();
    await finoAllaConferma();
    for (const vecchio of ["Template", "template", "Warning", "Parsing", "record di tipo", "Step ", "custom field", "Import Listini"]) {
      expect(testo(), vecchio).not.toContain(vecchio);
    }
  });

  it("dalla scheda del PDF si arriva con ?tab=ai", () => {
    open("/azienda/impostazioni/listino/import?tab=ai");
    expect(screen.getByRole("heading", { level: 3, name: "Importa da un PDF" })).toBeInTheDocument();
  });
});

describe("Importa: ogni voce dice dove vanno i dati", () => {
  it("parte, come prima, sul catalogo articoli (decisione D1 ancora aperta) e dice che NON è il Listino", () => {
    open();
    expect(screen.getByRole("combobox", { name: "Cosa stai importando?" })).toHaveTextContent("Catalogo articoli (ordini e preventivi edili)");
    expect(testo()).toContain("Non compare nel Listino.");
  });

  it("«Prodotti del Listino» dice che entrano «a pezzo», senza tipologia e a 0 €", async () => {
    open();
    await scegli("Prodotti del Listino");
    const dove = document.getElementById("listino-tipo-dove")!;
    expect(dove.textContent).toContain("Va nel Listino, tra i prodotti");
    expect(dove.textContent).toContain("«a pezzo», senza tipologia e senza linea");
    expect(dove.textContent).toContain("nascono a 0 €");
  });

  it("«Manodopera e servizi» dice dove va", async () => {
    open();
    await scegli("Manodopera e servizi");
    expect(document.getElementById("listino-tipo-dove")!.textContent).toContain("Va in Listino → Manodopera e servizi");
  });

  it("le colonne che l'importazione non legge si dicono, con il nome che si vede nel modello", async () => {
    open();
    await scegli("Prodotti del Listino");
    const dettagli = within(document.getElementById("listino-tipo-dove")!).getByText(/Altri dettagli/).closest("details")!;
    expect(dettagli.textContent).toContain("non legge: Codice, Famiglia Padre, Margine Default %, Ricarico Default %");
  });

  it("i campi personalizzati si contano in italiano", async () => {
    state.customFields = [{ id: "a" }];
    open();
    expect(testo()).toContain("1 campo personalizzato");
    cleanup();
    state.customFields = [{ id: "a" }, { id: "b" }];
    open();
    expect(testo()).toContain("2 campi personalizzati");
  });

  it("dal PDF si importano solo il catalogo articoli e la manodopera, e lo dice", async () => {
    open("/azienda/impostazioni/listino/import?tab=ai");
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Cosa stai importando?" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    const opzioni = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opzioni).toEqual(["Catalogo articoli (ordini e preventivi edili)", "Manodopera e servizi"]);
    expect(testo()).toContain("Da PDF non si importano i prodotti del Listino");
  });
});

describe("Importa: la conferma", () => {
  it("per il catalogo articoli dice cosa succede: nessuna pagina per cancellarli, quindi non si annulla da qui", async () => {
    open();
    await finoAllaConferma();
    expect(screen.getByText("Stai per importare 2 articoli nel catalogo articoli (ordini e preventivi edili).")).toBeInTheDocument();
    expect(testo()).toContain("da qui l'importazione non si annulla");
    expect(screen.getByRole("button", { name: "Importa 2 articoli" })).toBeEnabled();
  });

  it("per i prodotti del Listino dice come si annulla", async () => {
    open();
    await scegli("Prodotti del Listino");
    await finoAllaConferma();
    expect(screen.getByText("Stai per importare 2 prodotti nel Listino.")).toBeInTheDocument();
    expect(testo()).toContain("restano 15 giorni nel cestino");
  });

  it("l'importazione parte con il tipo scelto e dice cosa è stato importato, col nome vero", async () => {
    open();
    await scegli("Prodotti del Listino");
    await finoAllaConferma();
    fireEvent.click(screen.getByRole("button", { name: "Importa 2 prodotti" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Importati 2 prodotti"));
    expect(state.invoke).toHaveBeenCalledOnce();
    expect(state.invoke.mock.calls[0][0]).toBe("catalog-import-batch");
    expect(state.invoke.mock.calls[0][1].body.object_type).toBe("family");
  });

  it("senza toccare il menu l'importazione parte ancora come «product» (nessun cambio di destinazione)", async () => {
    open();
    await finoAllaConferma();
    fireEvent.click(screen.getByRole("button", { name: "Importa 2 articoli" }));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledOnce());
    expect(state.invoke.mock.calls[0][1].body.object_type).toBe("product");
  });

  it("un errore di rete si legge in italiano", async () => {
    state.invoke.mockResolvedValue({ data: null as unknown, error: new Error("Failed to fetch") });
    open();
    await finoAllaConferma();
    fireEvent.click(screen.getByRole("button", { name: "Importa 2 articoli" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Importazione non riuscita", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("un file che non si legge dice «Non riesco a leggere il file», non il testo del parser", async () => {
    state.parse.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'sheet')"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.change(screen.getByLabelText(/File Excel/), { target: { files: [new File(["x"], "rotto.xlsx")] } });
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Non riesco a leggere il file", { description: "Riprova tra poco." });
  });

  it("nell'anteprima i campi hanno il nome della colonna, non la chiave interna", async () => {
    open();
    await finoAllaConferma();
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(testo()).toContain("Descrizione: Voce 1");
    expect(testo()).toContain("Prezzo Listino: 10");
    expect(testo()).not.toContain("list_price");
  });
});

describe("Importa da PDF con l'AI", () => {
  const estratte = {
    rows: [
      { code: "A1", name: "Porta interna", base_price: 100, list_price: 120, cost: 60, vat_rate: 22 },
      { code: "A2", name: "Finestra", base_price: 200, list_price: 240, cost: 120, vat_rate: 22 },
    ],
    confidence: 0.8,
    detected_supplier: "Rossi Serramenti",
    tokens: { input: 1234, output: 456 },
    cost_cents: 12,
  };
  async function leggiPdf() {
    open("/azienda/impostazioni/listino/import?tab=ai");
    fireEvent.change(screen.getByLabelText(/PDF del listino/), { target: { files: [new File(["x"], "listino.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Leggi il PDF con l'AI" }));
  }

  it("dopo la lettura dice quante righe, l'affidabilità e il costo, senza token", async () => {
    state.invoke.mockResolvedValueOnce({ data: estratte, error: null as unknown });
    await leggiPdf();
    expect(await screen.findByText(/Lettura completata — 2 righe · affidabilità 80%/)).toBeInTheDocument();
    expect(testo()).toContain("Fornitore rilevato: Rossi Serramenti");
    expect(testo()).toContain("Costo stimato della lettura: €0.1200");
    for (const vecchio of ["Token", "confidence", "Confidence", "Estrazione"]) expect(testo(), vecchio).not.toContain(vecchio);
    expect(state.success).toHaveBeenCalledWith("2 righe lette dal PDF (affidabilità 80%)");
  });

  it("ogni campo della tabella ha un nome per il lettore di schermo, con il numero della riga", async () => {
    state.invoke.mockResolvedValueOnce({ data: estratte, error: null as unknown });
    await leggiPdf();
    await screen.findByText(/Lettura completata/);
    for (const nome of ["Codice, riga 2", "Descrizione, riga 1", "Prezzo di listino, riga 2", "Costo, riga 1", "IVA %, riga 2", "Rimuovi la riga 1"]) {
      expect(screen.getByLabelText(nome), nome).toBeInTheDocument();
    }
  });

  it("l'importazione dal PDF dice cosa fa e parte come «product» se non si tocca il menu", async () => {
    state.invoke
      .mockResolvedValueOnce({ data: estratte, error: null as unknown })
      .mockResolvedValueOnce({ data: { inserted: 2, updated: 0, skipped: 0, errors: [] }, error: null as unknown });
    await leggiPdf();
    await screen.findByText(/Lettura completata/);
    expect(testo()).toContain("Stai per importare 2 articoli nel catalogo articoli (ordini e preventivi edili).");
    fireEvent.click(screen.getByRole("button", { name: "Importa 2 articoli" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Importati 2 articoli dal PDF"));
    expect(state.invoke.mock.calls[1][0]).toBe("catalog-import-batch");
    expect(state.invoke.mock.calls[1][1].body.object_type).toBe("product");
  });

  it("un errore di lettura si legge in italiano", async () => {
    state.invoke.mockResolvedValueOnce({ data: null as unknown, error: new Error("Failed to fetch") });
    await leggiPdf();
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a leggere il PDF", { description: "Connessione persa. Controlla la rete e riprova." });
  });

  it("un file che non è un PDF si rifiuta con una frase chiara", async () => {
    open("/azienda/impostazioni/listino/import?tab=ai");
    fireEvent.change(screen.getByLabelText(/PDF del listino/), { target: { files: [new File(["x"], "listino.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Leggi il PDF con l'AI" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Il file deve essere un PDF"));
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
