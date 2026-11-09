/** La pagina del nuovo contratto col committente: tre passi e un salvataggio solo (09/11/2026). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContrattoCommittentePagina from "@/pages/azienda/ContrattoCommittentePagina";

const stato = vi.hoisted(() => ({ scritture: [] as Array<{ tabella: string; riga: Record<string, unknown> }>, colonne: true }));

vi.mock("@/integrations/supabase/client", () => {
  const tabella = (nome: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "order"]) q[m] = () => q;
    q.select = (c?: string) => { if (c === "oggetto_lavori") q.limit = async () => ({ error: stato.colonne ? null : { message: "colonna" } }); return q; };
    q.limit = async () => ({ data: [] as unknown[], error: null as null });
    q.maybeSingle = async () => ({ data: nome === "profiles" ? { id: "c", business_name: "Colombo Spa" } : null, error: null as null });
    q.single = async () => ({ data: { id: "nuovo-id" }, error: null as null });
    q.then = (ok: (v: unknown) => unknown) => ok({ data: [] as unknown[], error: null as null });
    q.insert = (riga: Record<string, unknown>) => { stato.scritture.push({ tabella: nome, riga }); return q; };
    return q;
  };
  return { supabase: { from: tabella } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true, canViewOrderAmounts: true }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: () => <div>PDF</div> }));
vi.mock("@/components/contratti/ContrattoClientePDF", () => ({ contrattoClienteBlob: async () => new Blob(["x"]) }));
vi.mock("@/hooks/useCondizioniArchivio", () => ({ useCondizioniArchivio: () => ({ modelli: [{ id: "m", nome: "Appalto 2026", ambito: "appalto", attivo: true, predefinito: true, versione: 1, clausole: [{ titolo: "Foro", testo: "Milano", vessatoria: true }] }] }) }));

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/azienda/committenti/c/contratto/nuovo"]}>
      <Routes>
        <Route path="/azienda/committenti/:id/contratto/:contrattoId" element={<ContrattoCommittentePagina />} />
        <Route path="/azienda/committenti/:id" element={<div>scheda committente</div>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe("nuovo contratto col committente", () => {
  beforeEach(() => { stato.scritture = []; stato.colonne = true; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn(); });

  it("oggetto, tariffa e condizioni dal modello: salva il contratto e le tariffe", async () => {
    disegna();
    fireEvent.change(await screen.findByLabelText("Oggetto dei lavori"), { target: { value: "Posa pavimenti" } });
    fireEvent.change(screen.getByLabelText("Luogo dei lavori"), { target: { value: "Via Roma 1" } });
    fireEvent.click(screen.getByRole("tab", { name: /Tariffe e pagamento/ }));
    fireEvent.change(screen.getByLabelText("Descrizione tariffa 1"), { target: { value: "Operaio" } });
    fireEvent.change(screen.getByLabelText("Prezzo tariffa 1"), { target: { value: "32,50" } });
    fireEvent.click(screen.getByRole("tab", { name: /Condizioni/ }));
    expect((screen.getByLabelText("Per questo committente") as HTMLTextAreaElement).value).toContain("Milano");
    fireEvent.click(screen.getByRole("button", { name: /Salva e scarica PDF/ }));
    await screen.findByText("scheda committente");
    const contratto = stato.scritture.find((s) => s.tabella === "appalto_contratti")!;
    expect(contratto.riga).toMatchObject({ oggetto_lavori: "Posa pavimenti", luogo_lavori: "Via Roma 1", committente_id: "c" });
    expect(String(contratto.riga.condizioni)).toContain("Milano");
    expect(stato.scritture.find((s) => s.tabella === "appalto_tariffe")!.riga).toMatchObject({ descrizione: "Operaio", prezzo_unitario: 32.5, contratto_id: "nuovo-id" });
  });

  it("senza oggetto non si salva", async () => {
    disegna();
    await screen.findByLabelText("Oggetto dei lavori");
    expect(screen.getByRole("button", { name: /Salva e scarica PDF/ })).toBeDisabled();
  });

  it("finché le colonne nuove non ci sono si può salvare lo stesso, senza quei campi", async () => {
    stato.colonne = false;
    disegna();
    await waitFor(() => expect(screen.queryByText("Apro il contratto…")).toBeNull());
    await waitFor(() => expect(screen.queryByLabelText("Oggetto dei lavori")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Salva e scarica PDF/ }));
    await screen.findByText("scheda committente");
    expect(stato.scritture[0].riga).not.toHaveProperty("oggetto_lavori");
  });
});
