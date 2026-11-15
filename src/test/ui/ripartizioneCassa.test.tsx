/**
 * Ripartire un movimento su più voci DI CASSA, e la ripartizione proposta dalla fattura (15/11/2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { VoceCatalogo, VoceMovimento } from "@/lib/finance/cassaVoci";

const m = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/finance/bankWorkspace", () => ({ bankRpc: m.rpc }));
vi.mock("sonner", () => ({ toast: m.toast }));

const voce = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
  parent_id: null, livello: "voce", descrizione: null, esempio: null, flusso: "uscita", sezione: "operativa",
  voce_cassa_in: null, voce_cassa_out: "usc_materiali", richiede_commessa: false, attiva: true, archiviata_il: null,
  ordine: 0, origine: "catalogo", ...p,
});
const catalogo: VoceCatalogo[] = [
  voce({ id: "cat04", codice: "04", nome: "Materiali e merci", livello: "categoria" }),
  voce({ id: "v0402", codice: "04.02", nome: "Materiali edili", parent_id: "cat04" }),
  voce({ id: "cat09", codice: "09", nome: "Mezzi e logistica", livello: "categoria" }),
  voce({ id: "v0912", codice: "09.12", nome: "Trasporti e consegne", parent_id: "cat09", voce_cassa_out: "usc_mezzi" }),
];
vi.mock("@/lib/finance/cassaVoci", async (orig): Promise<Record<string, unknown>> => ({
  ...(await orig<typeof import("@/lib/finance/cassaVoci")>()),
  useCatalogoCassa: () => ({ data: catalogo, isError: false }),
  useAggiornaDopoCategoria: () => (): void => undefined,
}));
import { CategoriaMovimento } from "@/components/tesoreria/CategoriaMovimento";
import { centesimiDaTesto } from "@/lib/finance/cassaVoci";

beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue(5);
});
afterEach(cleanup);

const cella = (v: VoceMovimento | undefined) =>
  render(<CategoriaMovimento company="az" tx="t1" importo={-1000} revisione={4} voce={v} puoModificare />);
const materiali: VoceMovimento = { id: "v0402", codice: "04.02", nome: "Materiali edili", categoria: "Materiali e merci", origine: "manuale", confermata: true, il: null };

describe("ripartire dalla colonna Categoria", () => {
  it("700 di materiali e 300 di trasporto: salva le quote in centesimi", async () => {
    cella(materiali);
    fireEvent.click(screen.getByRole("button", { name: /Categoria: Materiali edili/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ripartisci su più voci/ }));
    // Parte dalla voce attuale con tutto l'importo.
    expect(screen.getByRole("textbox", { name: "Importo della riga 1" })).toHaveValue("1000,00");
    fireEvent.change(screen.getByRole("textbox", { name: "Importo della riga 1" }), { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: /Voce della riga 2/ }));
    fireEvent.click(screen.getByRole("option", { name: /Trasporti e consegne/ }));
    const salva = screen.getByRole("button", { name: /Salva la ripartizione/ });
    expect(salva).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Da ripartire: 300 €");
    fireEvent.change(screen.getByRole("textbox", { name: "Importo della riga 2" }), { target: { value: "300,00" } });
    expect(screen.getByRole("status")).toHaveTextContent("Quadra con il movimento");
    fireEvent.click(salva);
    await waitFor(() =>
      expect(m.rpc).toHaveBeenCalledWith("bank_movimento_ripartizione", {
        p_company: "az", p_tx: "t1", p_revision: 4, p_motivo: null,
        p_quote: [{ voce: "v0402", cents: 70000 }, { voce: "v0912", cents: 30000 }],
      }),
    );
  });

  it("non salva se le quote superano l'importo", () => {
    cella(materiali);
    fireEvent.click(screen.getByRole("button", { name: /Categoria: Materiali edili/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ripartisci su più voci/ }));
    fireEvent.click(screen.getByRole("button", { name: /Voce della riga 2/ }));
    fireEvent.click(screen.getByRole("option", { name: /Trasporti e consegne/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Importo della riga 2" }), { target: { value: "1" } });
    expect(screen.getByRole("status")).toHaveTextContent("Oltre l'importo di 1 €");
    expect(screen.getByRole("button", { name: /Salva la ripartizione/ })).toBeDisabled();
  });

  it("un movimento ripartito si riconosce nella cella", () => {
    cella({ ...materiali, quote: [
      { id: "v0402", nome: "Materiali edili", codice: "04.02", cents: 70000 },
      { id: "v0912", nome: "Trasporti e consegne", codice: "09.12", cents: 30000 },
    ] });
    expect(screen.getByText(/altre voci: ripartito/)).toBeInTheDocument();
    expect(screen.getByText("Materiali edili")).toHaveAttribute("title", "Materiali edili: 700 € · Trasporti e consegne: 300 €");
  });

  it("la fattura collegata che copre due voci propone la ripartizione già pronta", async () => {
    cella({
      id: "v0402", codice: "04.02", nome: "Materiali edili", categoria: "Materiali e merci", origine: "documento", confermata: false, il: null,
      proposta_quote: [
        { id: "v0402", nome: "Materiali edili", codice: "04.02", livello: "voce", cents: 70000 },
        { id: "cat09", nome: "Mezzi e logistica", codice: "09", livello: "categoria", cents: 30000 },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /Categoria: Materiali edili/ }));
    expect(screen.getByText(/Dalla fattura collegata/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ripartisci così" }));
    // La categoria intera va precisata prima di salvare.
    const riga2 = screen.getByRole("button", { name: /Voce della riga 2: da scegliere/ });
    expect(riga2).toHaveTextContent("In «Mezzi e logistica»: scegli la voce");
    expect(screen.getByRole("button", { name: /Salva la ripartizione/ })).toBeDisabled();
    fireEvent.click(riga2);
    fireEvent.click(within(screen.getByRole("listbox", { name: "Categorie" })).getByRole("option", { name: /Trasporti e consegne/ }));
    fireEvent.click(screen.getByRole("button", { name: /Salva la ripartizione/ }));
    await waitFor(() =>
      expect(m.rpc).toHaveBeenCalledWith("bank_movimento_ripartizione", expect.objectContaining({
        p_quote: [{ voce: "v0402", cents: 70000 }, { voce: "v0912", cents: 30000 }],
      })),
    );
  });
});

describe("importi scritti a mano", () => {
  it("legge il formato italiano e quello col punto", () => {
    expect(centesimiDaTesto("1.000,50")).toBe(100050);
    expect(centesimiDaTesto("700")).toBe(70000);
    expect(centesimiDaTesto("300.5")).toBe(30050);
    expect(centesimiDaTesto("12 €")).toBe(1200);
    expect(centesimiDaTesto("abc")).toBeNull();
    expect(centesimiDaTesto("1,234")).toBeNull();
  });
});
