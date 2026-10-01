import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderEconomicsSummary } from "@/components/orders/OrderEconomicsSummary";
import { ProcurementTimelineGuide } from "@/components/orders/ProcurementTimelineGuide";

const mocks = vi.hoisted(() => ({ issued: vi.fn(), variations: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), companyId: "c1" as string | undefined }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: mocks.companyId ? { id: mocks.companyId } : null }) }));
vi.mock("@/lib/orders/loadEconomicCommitments", () => ({ loadIssuedCommitments: mocks.issued, loadApprovedRevenueVariations: mocks.variations }));
vi.mock("@/lib/orders/civilDate", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/orders/civilDate")>(), todayInRome: () => "2026-10-01" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: mocks.eq, maybeSingle: mocks.maybeSingle }) }) } }));
vi.mock("@/hooks/useOrderEconomicsBase", () => ({ useOrderEconomicsBase: () => ({
  econ: { itemsNet: 100, laborNet: 20, commissions: 0, errorsTot: 0, costsTot: 120, margin: 880, marginPct: 88, attesoMaterialiPct: 90 },
  employees: [{ total_cost: 20 }], teams: [], salespeople: [], errors: [], isPending: false, isError: false,
}) }));
vi.mock("@/components/ui/donut-chart", () => ({ DonutChart: () => null }));
const renderQuery = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};
beforeEach(() => {
  mocks.companyId = "c1";
  mocks.issued.mockReset().mockResolvedValue([{ subtotal: 90 }]);
  mocks.variations.mockReset().mockResolvedValue([{ impatto_economico: 500 }]);
  mocks.maybeSingle.mockReset().mockResolvedValue({ data: { name: "Fornitore", lead_time_days: 35 }, error: null });
  const chain = { eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.eq.mockReset().mockReturnValue(chain);
});
afterEach(cleanup);
const account = () => <OrderEconomicsSummary orderId="o1" totalAmount={1000} vatRate={22} items={[{ purchase_price: 122, quantity: 1, vat_rate: 22 }]} collectedAmount={0} avanzamentoPct={20} />;
describe("confronto economico nella commessa", () => {
  it("500 di variante ricavo non gonfia lo scostamento acquisti e non estrapola costi dal 20%", async () => {
    renderQuery(account());
    await screen.findByText("Articoli: piano attuale vs acquisti impegnati");
    expect(screen.getByText(/-10,00/)).toBeInTheDocument();
    expect(screen.getByText("Variazioni ricavo approvate · escluse dai materiali")).toBeInTheDocument();
    expect(screen.queryByText("Di questo passo, a fine lavori")).not.toBeInTheDocument();
    expect(screen.queryByText("Margine consuntivo (reale)")).not.toBeInTheDocument();
    expect(mocks.issued).toHaveBeenCalledWith("c1", "o1");
  });
  it("errore OdA non presenta consuntivo zero o margine come valido", async () => {
    mocks.issued.mockRejectedValue(new Error("offline"));
    renderQuery(account());
    await screen.findByText(/Conto economico non disponibile/);
    expect(screen.queryByText("Articoli: piano attuale vs acquisti impegnati")).not.toBeInTheDocument();
  });
  it("errore varianti non presenta ricavo incompleto", async () => {
    mocks.variations.mockRejectedValue(new Error("offline")); renderQuery(account());
    await screen.findByText(/Conto economico non disponibile/);
  });
});
describe("guida approvvigionamento nello stesso flusso articoli", () => {
  const guide = () => <ProcurementTimelineGuide items={[{ id: "i1", name: "Serramento", quantity: 1, supplier_id: "s1" }]} requiredOnSite="2026-11-15" />;
  it("mostra lacune e, compilato lo scenario, scadenza ordine e consegna prudente", async () => {
    renderQuery(guide());
    await screen.findByLabelText("Data contratto / autorizzazione acquisto");
    expect(screen.getByText("Scenario incompleto")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data contratto / autorizzazione acquisto"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Prerequisiti pronti: misure, ordine e acconto"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Margine di sicurezza (giorni solari)"), { target: { value: "5" } });
    expect(screen.getByText("Scenario condizionato ai prerequisiti")).toBeInTheDocument();
    expect(screen.getAllByText("06/10/2026")).toHaveLength(2);
    expect(screen.getAllByText("09/11/2026")).toHaveLength(2);
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "c1");
    expect(mocks.eq).toHaveBeenCalledWith("id", "s1");
  });
  it("lead time zero di anagrafica resta mancante finché esplicitato", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { name: "Fornitore", lead_time_days: 0 }, error: null }); renderQuery(guide());
    await screen.findByLabelText("Fornitura: massimo giorni");
    expect(screen.getByLabelText("Fornitura: massimo giorni")).toHaveValue(null);
    expect(screen.getByText(/Tempi fornitore e calendario da confermare/)).toBeInTheDocument();
  });
  it("errore fonte non offre scadenze apparentemente verificate", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("offline") }); renderQuery(guide());
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Risultato simulazione fornitura")).not.toBeInTheDocument();
  });
  it("stock collegato richiede disponibilità e non suggerisce un nuovo ordine", async () => {
    renderQuery(<ProcurementTimelineGuide items={[{ id: "i1", name: "Piastrelle", quantity: 1, stock_item_id: "stock" }]} />);
    expect(screen.getByText(/verifica quantità riservata/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.maybeSingle).not.toHaveBeenCalled());
  });
  it("senza azienda non interroga il fornitore", async () => {
    mocks.companyId = undefined; renderQuery(guide());
    await waitFor(() => expect(mocks.maybeSingle).not.toHaveBeenCalled());
  });
});
