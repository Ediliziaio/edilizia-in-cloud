/**
 * Popup «Classifica i movimenti» del Cash flow (14/11/2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MovimentoDaClassificare } from "@/components/controllo-gestione/ClassificaMovimentiDialog";
import type { VoceCatalogo } from "@/lib/finance/cassaVoci";

const m = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/finance/bankWorkspace", () => ({ bankRpc: m.rpc }));
vi.mock("sonner", () => ({ toast: m.toast }));

const voce = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
  parent_id: null, livello: "voce", descrizione: null, esempio: null, flusso: "uscita", sezione: "operativa",
  voce_cassa_in: null, voce_cassa_out: "usc_materiali", richiede_commessa: false, attiva: true, archiviata_il: null,
  ordine: 0, origine: "catalogo", ...p,
});
const catalogo: VoceCatalogo[] = [
  voce({ id: "area", codice: "A.operativa", nome: "Operativa", livello: "area" }),
  voce({ id: "cat04", codice: "04", nome: "Materiali e merci", livello: "categoria", parent_id: "area" }),
  voce({ id: "v0412", codice: "04.12", nome: "Minuteria e ferramenta", parent_id: "cat04" }),
  voce({ id: "cat09", codice: "09", nome: "Mezzi e logistica", livello: "categoria", parent_id: "area" }),
  voce({ id: "v0901", codice: "09.01", nome: "Carburante", parent_id: "cat09", voce_cassa_out: "usc_mezzi" }),
  voce({ id: "cat01", codice: "01", nome: "Incassi clienti", livello: "categoria", parent_id: "area", flusso: "entrata" }),
  voce({ id: "v0104", codice: "01.04", nome: "Lavori edili e ristrutturazioni", parent_id: "cat01", flusso: "entrata", voce_cassa_in: "inc_clienti", voce_cassa_out: null }),
];
vi.mock("@/lib/finance/cassaVoci", async (orig): Promise<Record<string, unknown>> => ({
  ...(await orig<typeof import("@/lib/finance/cassaVoci")>()),
  useCatalogoCassa: () => ({ data: catalogo, isError: false }),
  useAggiornaDopoCategoria: () => () => undefined,
}));
import { ClassificaMovimentiDialog } from "@/components/controllo-gestione/ClassificaMovimentiDialog";

const mov = (p: Partial<MovimentoDaClassificare> & { id: string; cents: number }): MovimentoDaClassificare => ({
  data: "2026-11-05", descrizione: `Causale ${p.id}`, controparte: "Ferramenta Rossi", categoria_testo: null, revisione: 1, voce: null, ...p,
});
const movimenti = [
  mov({ id: "a", cents: -12000 }),
  mov({ id: "b", cents: -8000, voce: { id: "v0412", nome: "Minuteria e ferramenta", codice: "04.12", categoria: "Materiali e merci", origine: "controparte", confermata: false } }),
  mov({ id: "c", cents: -4200, controparte: "Q8", voce: { id: "v0901", nome: "Carburante", codice: "09.01", categoria: "Mezzi e logistica", origine: "manuale", confermata: true } }),
  mov({ id: "d", cents: 300000, controparte: "Cliente Bianchi" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockImplementation(async (nome: string) => {
    if (nome === "cassa_movimenti_da_classificare") return structuredClone(movimenti);
    if (nome === "cassa_classifica_movimenti") return { aggiornati: 1, saltati: 0 };
    return null;
  });
});
afterEach(cleanup);
const apri = (puoModificare = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ClassificaMovimentiDialog open onOpenChange={() => undefined} company="az" anno={2026} puoModificare={puoModificare} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("classifica i movimenti", () => {
  it("parte dalle uscite da classificare: le proposte sì, le confermate no, le entrate no", async () => {
    apri();
    expect(await screen.findByText("Causale a")).toBeInTheDocument();
    expect(screen.getByText("Causale b")).toBeInTheDocument();
    expect(screen.queryByText("Causale c")).toBeNull();
    expect(screen.queryByText("Causale d")).toBeNull();
    expect(screen.getByRole("tab", { name: /Da classificare · 2/ })).toBeInTheDocument();
  });

  it("assegna la voce scelta ai movimenti selezionati, in un colpo solo", async () => {
    apri();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleziona tutti i movimenti di Ferramenta Rossi" }));
    expect(screen.getByText(/Assegna a 2 movimenti/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Minuteria e ferramenta/ }));
    await waitFor(() =>
      expect(m.rpc).toHaveBeenCalledWith("cassa_classifica_movimenti", {
        p_company: "az", p_tx: ["a", "b"], p_voce: "v0412", p_motivo: null, p_anche_confermati: false,
      }),
    );
  });

  it("per le uscite non offre le voci di sole entrate", async () => {
    apri();
    await screen.findByText("Causale a");
    const lista = screen.getByRole("listbox", { name: "Categorie" });
    expect(within(lista).queryByText("Lavori edili e ristrutturazioni")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Entrate/ }));
    expect(await screen.findByText("Causale d")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Categorie" })).getByText("Lavori edili e ristrutturazioni")).toBeInTheDocument();
  });

  it("accetta le proposte selezionate nella loro voce", async () => {
    apri();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Seleziona Causale b/ }));
    fireEvent.click(screen.getByRole("button", { name: /Accetta le proposte/ }));
    await waitFor(() =>
      expect(m.rpc).toHaveBeenCalledWith("cassa_classifica_movimenti", expect.objectContaining({ p_tx: ["b"], p_voce: "v0412" })),
    );
  });

  it("chi non può riconciliare vede le categorie ma non le assegna", async () => {
    apri(false);
    await screen.findByText("Causale a");
    expect(screen.getByText(/serve il permesso di riconciliare/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Categorie" })).toBeNull();
  });
});
