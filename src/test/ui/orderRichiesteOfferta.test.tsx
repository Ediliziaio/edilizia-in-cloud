import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  rfqs: [] as unknown[], contatori: {} as Record<string, unknown>, permessi: {} as Record<string, unknown>, fasi: [] as unknown[],
  richiedi: vi.fn(), crea: vi.fn(), naviga: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => stato.naviga }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "s1", name: "Aluplast" }, { id: "s2", name: "Vecchio", is_active: false }] }) }));
vi.mock("@/hooks/useSupplierRfqs", () => ({ useSupplierRfqs: () => ({ rfqs: stato.rfqs, contatori: stato.contatori, isLoading: false, isError: false, create: { mutateAsync: stato.crea } }) }));
vi.mock("@/hooks/useMaterialiPerFase", () => ({
  useMaterialiPerFase: () => ({ fasi: stato.fasi, isLoading: false }),
  useAzioniMateriali: () => ({ richiediOfferta: { mutateAsync: stato.richiedi } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: stato.insert, update: () => ({ eq: stato.update }) }) } }));
import { OrderRichiesteOfferta } from "@/components/orders/OrderRichiesteOfferta";

const mostra = () => render(<MemoryRouter><OrderRichiesteOfferta orderId="o1" orderCode="O-1" /></MemoryRouter>);
const materiale = (id: string, extra = {}) => ({ id, name: `Art ${id}`, quantity: 3, unita_misura: "m", ordinabile: true, supplier_rfq_item_id: null as string | null, ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  stato.rfqs = []; stato.contatori = {}; stato.fasi = [];
  stato.permessi = { canEditOrders: true, canViewCosts: true };
  stato.richiedi.mockResolvedValue("r-nuova"); stato.crea.mockResolvedValue({ id: "r-vuota" });
  stato.insert.mockResolvedValue({ error: null }); stato.update.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Richieste d'offerta della commessa", () => {
  it("mostra solo quelle della commessa, con fornitori, offerte e migliore prezzo", () => {
    stato.rfqs = [
      { id: "a", order_id: "o1", titolo: "Infissi", rfq_number: "RDO-1", status: "inviata" },
      { id: "b", order_id: "altra", titolo: "Non mia", rfq_number: "RDO-2", status: "bozza" },
    ];
    stato.contatori = { a: { invitati: 3, risposte: 1, inAttesa: 2, migliore: 1200 } };
    mostra();
    expect(screen.getByRole("link", { name: "Infissi" })).toHaveAttribute("href", "/azienda/richieste-offerta/a");
    expect(screen.queryByText("Non mia")).toBeNull();
    expect(screen.getByText(/3 fornitori · 1 offerta/)).toBeInTheDocument();
    expect(screen.getByText("2 in attesa")).toBeInTheDocument();
    expect(screen.getByTitle("Migliore offerta")).toBeInTheDocument();
  });
  it("il prezzo non si vede senza il permesso dei costi", () => {
    stato.permessi = { canEditOrders: true, canViewCosts: false };
    stato.rfqs = [{ id: "a", order_id: "o1", titolo: "Infissi", rfq_number: "RDO-1", status: "inviata" }];
    stato.contatori = { a: { invitati: 1, risposte: 1, inAttesa: 0, migliore: 1200 } };
    mostra();
    expect(screen.queryByTitle("Migliore offerta")).toBeNull();
  });
  it("aggiudicata porta all'ordine nato dalla richiesta", () => {
    stato.rfqs = [{ id: "a", order_id: "o1", titolo: "Infissi", rfq_number: "RDO-1", status: "aggiudicata", purchase_order_id: "po9" }];
    mostra();
    expect(screen.getByRole("link", { name: "Vedi l’ordine" })).toHaveAttribute("href", "/azienda/ordini-acquisto/po9");
  });
  it("chi può solo leggere non crea", () => {
    stato.permessi = { canEditOrders: true, solaLettura: true };
    mostra();
    expect(screen.queryByRole("button", { name: "Nuova richiesta" })).toBeNull();
  });
  it("propone solo gli articoli che si possono chiedere", () => {
    stato.fasi = [
      { validazione: { stato: "validata" }, materiali: [materiale("ok"), materiale("gia", { supplier_rfq_item_id: "x" }), materiale("coperto", { ordinabile: false })] },
      { validazione: { stato: "bozza" }, materiali: [materiale("nonvalidata")] },
    ];
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova richiesta" }));
    expect(screen.getByText("Art ok")).toBeInTheDocument();
    for (const n of ["Art gia", "Art coperto", "Art nonvalidata"]) expect(screen.queryByText(n)).toBeNull();
    expect(screen.getByText("Aluplast")).toBeInTheDocument();
    expect(screen.queryByText("Vecchio")).toBeNull();
  });
  it("con gli articoli scelti li collega alla richiesta e apre il dettaglio", async () => {
    stato.fasi = [{ validazione: null, materiali: [materiale("ok")] }];
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova richiesta" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Crea richiesta" }));
    await waitFor(() => expect(stato.richiedi).toHaveBeenCalledWith(expect.objectContaining({ ids: ["ok"], fornitori: ["s1"], titolo: "Richiesta d'offerta — O-1" })));
    expect(stato.crea).not.toHaveBeenCalled();
    await waitFor(() => expect(stato.naviga).toHaveBeenCalledWith("/azienda/richieste-offerta/r-nuova"));
  });
  it("senza articoli nasce vuota ma collegata alla commessa, con i fornitori scelti", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova richiesta" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Crea richiesta" }));
    await waitFor(() => expect(stato.crea).toHaveBeenCalledWith(expect.objectContaining({ order_id: "o1" })));
    await waitFor(() => expect(stato.insert).toHaveBeenCalledWith([{ rfq_id: "r-vuota", company_id: "az", supplier_id: "s1" }]));
    await waitFor(() => expect(stato.naviga).toHaveBeenCalledWith("/azienda/richieste-offerta/r-vuota"));
  });
  it("se la creazione fallisce la finestra resta aperta", async () => {
    stato.crea.mockRejectedValue(new Error("no"));
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Nuova richiesta" }));
    fireEvent.click(screen.getByRole("button", { name: "Crea richiesta" }));
    await waitFor(() => expect(stato.crea).toHaveBeenCalled());
    expect(stato.naviga).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
