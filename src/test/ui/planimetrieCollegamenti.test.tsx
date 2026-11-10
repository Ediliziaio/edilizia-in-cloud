import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CollegamentiPiantaDialog } from "@/components/planimetrie/CollegamentiPianta";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
const mock = vi.hoisted(() => ({ salva: vi.fn(), elenco: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-A" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewRenderAi: true, canViewCustomers: true, canViewMarketingContacts: true, canViewPreventivi: true, canViewOrders: true, solaLettura: false }) }));
vi.mock("@/lib/planimetrie/archivio", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/archivio")>(), aggiornaDatiPlanimetria: mock.salva, useElencoPlanimetrie: mock.elenco }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const riga: RigaPlanimetria = { id: "p1", company_id: "azienda-A", titolo: "Villa", stato: "bozza", descrizione: null, contact_id: "contatto-1", customer_id: "cliente-1", quote_id: null, order_id: null, survey_id: null, computo_upload_id: null, versione_corrente: 1, created_by: "u1", created_at: "2026-11-10", updated_at: "prima", deleted_at: null };
const monta = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/azienda/clienti/cliente-1"]}>{ui}</MemoryRouter></QueryClientProvider>);
describe("Collegamenti della planimetria dall'interfaccia", () => {
  it("scollega il cliente senza cancellare il contatto CRM e chiude solo dopo il salvataggio", async () => {
    mock.salva.mockResolvedValue(undefined);
    const chiudi = vi.fn();
    monta(<CollegamentiPiantaDialog riga={riga} onChiudi={chiudi} />);
    expect(screen.getByRole("button", { name: "Salva associazioni" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Scollega Cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva associazioni" }));
    await vi.waitFor(() => expect(chiudi).toHaveBeenCalledOnce());
    expect(mock.salva).toHaveBeenCalledWith("p1", { customerId: null }, { companyId: "azienda-A", updatedAt: "prima" });
  });
});
