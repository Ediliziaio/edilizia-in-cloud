/**
 * Configurazione → Categorie del cash flow (14/11/2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VoceCatalogo } from "@/lib/finance/cassaVoci";

const m = vi.hoisted(() => ({ mutate: vi.fn(), puo: true, tesoreria: false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewControlloGestione: m.puo, canViewTesoreria: m.tesoreria, canReconcileBankTransactions: m.tesoreria, solaLettura: false }) }));
const voce = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
  parent_id: null, livello: "voce", descrizione: null, esempio: null, flusso: "uscita", sezione: "operativa",
  voce_cassa_in: null, voce_cassa_out: "usc_materiali", richiede_commessa: false, attiva: true, archiviata_il: null,
  ordine: 0, origine: "catalogo", ...p,
});
const catalogo = [
  voce({ id: "area", codice: "A.operativa", nome: "Operativa", livello: "area" }),
  voce({ id: "cat04", codice: "04", nome: "Materiali e merci", livello: "categoria", parent_id: "area" }),
  voce({ id: "v0402", codice: "04.02", nome: "Materiali edili", parent_id: "cat04", descrizione: "Acquisto di materiali edili." }),
  voce({ id: "v0412", codice: "04.12", nome: "Minuteria e ferramenta", parent_id: "cat04", attiva: false }),
];
vi.mock("@/lib/finance/cassaVoci", async (orig): Promise<Record<string, unknown>> => ({
  ...(await orig<typeof import("@/lib/finance/cassaVoci")>()),
  useCatalogoCassa: () => ({ data: catalogo, isPending: false, isError: false }),
  useSalvaVoceCassa: () => ({ mutate: m.mutate, isPending: false }),
}));
import { CategorieCassaConfig } from "@/components/controllo-gestione/CategorieCassaConfig";

beforeEach(() => { vi.clearAllMocks(); m.puo = true; m.tesoreria = false; });
afterEach(cleanup);

describe("categorie del cash flow in Configurazione", () => {
  it("mostra il catalogo per area e categoria, e quante voci sono attive", () => {
    render(<CategorieCassaConfig />);
    expect(screen.getByText("Operativa")).toBeInTheDocument();
    expect(screen.getByText("Materiali e merci")).toBeInTheDocument();
    expect(screen.getByText("1/2 attive")).toBeInTheDocument();
  });

  it("accende una voce spenta", () => {
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: /Materiali e merci/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Accendi Minuteria e ferramenta" }));
    expect(m.mutate).toHaveBeenCalledWith({ id: "v0412", dati: { attiva: true } }, expect.anything());
  });

  it("aggiunge una voce propria dentro una categoria", () => {
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi voce" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome della nuova voce" }), { target: { value: "Cappotto termico" } });
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi$/ }));
    expect(m.mutate).toHaveBeenCalledWith(
      { id: null, dati: { parent_id: "cat04", nome: "Cappotto termico", descrizione: "" } },
      expect.anything(),
    );
  });

  it("archivia invece di cancellare", () => {
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: /Materiali e merci/ }));
    fireEvent.click(screen.getByRole("button", { name: "Materiali edili" }));
    expect(screen.getByText(/04\.02/, { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Archivia/ }));
    expect(m.mutate).toHaveBeenCalledWith({ id: "v0402", dati: { archiviata: true } }, expect.anything());
    expect(screen.queryByRole("button", { name: /Elimina|Cancella/ })).toBeNull();
  });

  it("senza permesso si legge ma non si cambia", () => {
    m.puo = false;
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: /Materiali e merci/ }));
    expect(screen.getByRole("switch", { name: "Spegni Materiali edili" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aggiungi voce" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Materiali edili" }));
    expect(screen.queryByRole("button", { name: /Archivia/ })).toBeNull();
    expect(screen.getByText("Acquisto di materiali edili.")).toBeInTheDocument();
  });

  it("chi gestisce la tesoreria modifica anche senza controllo di gestione", () => {
    m.puo = false;
    m.tesoreria = true;
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: /Materiali e merci/ }));
    expect(screen.getByRole("switch", { name: "Spegni Materiali edili" })).toBeEnabled();
  });

  it("aggiunge una categoria nuova dentro un'area", () => {
    render(<CategorieCassaConfig />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi categoria in Operativa" }));
    expect(screen.getByText("Aggiungi una categoria in quest'area")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Nome della nuova voce" }), { target: { value: "Fotovoltaico" } });
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi$/ }));
    expect(m.mutate).toHaveBeenCalledWith({ id: null, dati: { parent_id: "area", nome: "Fotovoltaico", descrizione: "" } }, expect.anything());
  });
});
