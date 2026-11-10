import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AssociazioniPiantaPanel, CollegamentiProgetto } from "@/components/planimetrie/CollegamentiPianta";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
import type { MappaCollegamenti } from "@/lib/planimetrie/collegamenti";

const mock = vi.hoisted(() => ({ salva: vi.fn(), cerca: vi.fn(), solaLettura: false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewRenderAi: true, canViewCustomers: true, canViewMarketingContacts: true, canViewPreventivi: true, canViewOrders: true, solaLettura: mock.solaLettura }) }));
vi.mock("@/lib/planimetrie/archivio", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/archivio")>(), aggiornaDatiPlanimetria: mock.salva }));
vi.mock("@/lib/planimetrie/collegamenti", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/collegamenti")>(), cercaCollegamentiPianta: mock.cerca }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const riga: RigaPlanimetria = { id: "p1", company_id: "azienda-A", titolo: "Villa", stato: "bozza", descrizione: null, contact_id: "contatto-1", customer_id: "cliente-1", quote_id: null, order_id: null, survey_id: null, computo_upload_id: null, versione_corrente: 1, created_by: "u1", created_at: "2026-11-10", updated_at: "prima", deleted_at: null };
function monta(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, { wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider> });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.solaLettura = false;
  mock.salva.mockResolvedValue(undefined);
  mock.cerca.mockResolvedValue([]);
});

describe("Associazioni nel contesto della planimetria", () => {
  it("scollega il cliente senza cancellare il contatto CRM e chiude solo dopo il salvataggio", async () => {
    const chiudi = vi.fn();
    monta(<AssociazioniPiantaPanel riga={riga} onChiudi={chiudi} />);
    expect(screen.getByRole("button", { name: "Salva associazioni" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scollega Cliente" }));
    expect(screen.getByText("L’associazione verrà rimossa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva associazioni" }));
    await vi.waitFor(() => expect(chiudi).toHaveBeenCalledOnce());
    expect(mock.salva).toHaveBeenCalledWith("p1", { customerId: null }, { companyId: "azienda-A", updatedAt: "prima" });
  });

  it("conserva le scelte passando fra categorie e non perde il controllo di concorrenza", async () => {
    mock.cerca.mockResolvedValueOnce([{ id: "cliente-2", nome: "Impresa Verdi" }]).mockResolvedValueOnce([{ id: "q2", nome: "OFF-2 · Villa", titolo: "OFF-2", sottotitolo: "Villa" }]);
    const chiudi = vi.fn();
    const view = monta(<AssociazioniPiantaPanel riga={riga} onChiudi={chiudi} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambia" }));
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona Impresa Verdi" }));
    view.rerender(<AssociazioniPiantaPanel riga={{ ...riga, updated_at: "dopo" }} onChiudi={chiudi} />);
    fireEvent.click(screen.getByRole("button", { name: /^Preventivo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Associa preventivo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona OFF-2 · Villa" }));
    expect(screen.getByLabelText("Modifiche da salvare")).toHaveTextContent("2 modifiche da salvare");
    fireEvent.click(screen.getByRole("button", { name: "Salva associazioni" }));
    await vi.waitFor(() => expect(chiudi).toHaveBeenCalledOnce());
    expect(mock.salva).toHaveBeenCalledWith("p1", { customerId: "cliente-2", quoteId: "q2" }, { companyId: "azienda-A", updatedAt: "prima" });
  });

  it("annullando lascia intatte le associazioni salvate", () => {
    const chiudi = vi.fn();
    monta(<AssociazioniPiantaPanel riga={riga} onChiudi={chiudi} />);
    fireEvent.click(screen.getByRole("button", { name: "Scollega Cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(mock.salva).not.toHaveBeenCalled();
    expect(chiudi).toHaveBeenCalledOnce();
  });

  it("mostra i nomi caricati dopo l'apertura senza trasformarli in modifiche", () => {
    const view = monta(<AssociazioniPiantaPanel riga={riga} onChiudi={vi.fn()} />);
    const mappa: MappaCollegamenti = { cliente: { "cliente-1": { id: "cliente-1", nome: "Mario Rossi" } }, contatto: {}, preventivo: {}, commessa: {}, computo: {} };
    view.rerender(<AssociazioniPiantaPanel riga={riga} mappa={mappa} onChiudi={vi.fn()} />);
    expect(within(screen.getByRole("region", { name: "Associazione Cliente" })).getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva associazioni" })).toBeDisabled();
  });

  it("in sola lettura non avvia ricerche né permette di cambiare associazioni", () => {
    mock.solaLettura = true;
    monta(<AssociazioniPiantaPanel riga={riga} onChiudi={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cambia" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Preventivo/ }));
    expect(mock.cerca).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva associazioni" })).toBeDisabled();
  });

  it("apre la categoria richiesta senza scaricare elenchi prima di una ricerca esplicita", async () => {
    monta(<AssociazioniPiantaPanel riga={riga} tipoIniziale="computo" onChiudi={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Associazione Computo metrico" })).toBeInTheDocument();
    expect(mock.cerca).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Associa computo" }));
    await screen.findByRole("textbox", { name: "Cerca Computo metrico" });
    await vi.waitFor(() => expect(mock.cerca).toHaveBeenCalledWith("azienda-A", "computo", ""));
  });

  it("dalla scheda apre la modifica della sola associazione scelta", () => {
    const associa = vi.fn();
    const mappa: MappaCollegamenti = { cliente: { "cliente-1": { id: "cliente-1", nome: "Mario Rossi", percorso: "/azienda/clienti/cliente-1" } }, contatto: {}, preventivo: {}, commessa: {}, computo: {} };
    monta(<CollegamentiProgetto riga={riga} mappa={mappa} onAssocia={associa} />);
    expect(screen.getByRole("link", { name: /Mario Rossi/ })).toHaveAttribute("href", "/azienda/clienti/cliente-1");
    fireEvent.click(screen.getByRole("button", { name: "Modifica associazione Cliente" }));
    expect(associa).toHaveBeenCalledWith("cliente");
    expect(mock.salva).not.toHaveBeenCalled();
  });
});
