import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ data: [] as unknown[], unmapped: [] as Array<{ id: string; oda_number: string; supplier_id: string }>, pending: false, error: false, refetch: vi.fn(), create: vi.fn(), permissions: { canEditOrders: true, canViewCosts: true } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "user" } }) }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "s", name: "Fornitore A", is_active: true }] }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ useUnmappedPurchaseOrders: () => ({ data: state.unmapped, isPending: state.pending, isError: state.error, isFetching: false, refetch: vi.fn() }), useMaterialProcurement: () => ({ data: state.data, isPending: state.pending, isError: state.error, isFetching: false, refetch: state.refetch }) }));
vi.mock("@/lib/orders/createMaterialPurchaseOrder", () => ({ createMaterialPurchaseOrder: (...args: unknown[]) => state.create(...args), IncompletePurchaseOrderError: class extends Error {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
import { OrdinaPerFornitorePanel } from "@/components/orders/OrdinaPerFornitorePanel";
import { OrderMaterialsSummary } from "@/components/orders/OrderMaterialsSummary";
import { CreatePurchaseOrderButton } from "@/components/orders/CreatePurchaseOrderButton";
const item = { id: "a", name: "Pavimento", quantity: 10, purchase_price: 20, supplier_id: "s", status: "da_ordinare" };
const row = (status: string, quantity: number, received = 0) => ({ id: status, order_item_id: "a", quantity, quantity_received: received, purchase_orders: { id: status, oda_number: status, status } });
function draw(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>); }
beforeEach(() => { state.data = []; state.unmapped = []; state.pending = false; state.error = false; state.refetch.mockReset(); state.create.mockReset().mockResolvedValue({ poId: "po", n: 1 }); state.permissions = { canEditOrders: true, canViewCosts: true }; });

describe("Materiali e acquisti: percorso guidato", () => {
  it("spiega il percorso quando la commessa non ha articoli", () => {
    draw(<OrderMaterialsSummary orderId="order" items={[]} />); expect(screen.getByRole("region", { name: "Flusso materiali" })).toHaveTextContent("collega le uscite");
  });
  it("durante il controllo non mostra quantità presunte né pulsanti di acquisto", () => {
    state.pending = true; draw(<><OrderMaterialsSummary orderId="order" items={[item]} /><OrdinaPerFornitorePanel orderId="order" items={[item]} /></>);
    expect(screen.getByRole("status")).toHaveTextContent("Verifica ordini"); expect(screen.queryByText("Da acquistare")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Prepara acquisto…" })).not.toBeInTheDocument();
  });
  it("errore copertura sospende gli acquisti e offre riprova", () => {
    state.error = true; draw(<OrdinaPerFornitorePanel orderId="order" items={[item]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("evitare duplicati"); fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("riepiloga separatamente bozza e attesa ricezione", () => {
    state.data = [row("bozza", 2), row("inviato", 3, 1)]; draw(<OrderMaterialsSummary orderId="order" items={[item]} />);
    expect(screen.getByText("In bozza OdA").parentElement).toHaveTextContent("1"); expect(screen.getByText("In attesa di ricezione").parentElement).toHaveTextContent("1"); expect(screen.getByText(/ricezione non è il consumo/)).toBeInTheDocument();
  });
  it("anteprima e creazione usano solo il residuo", async () => {
    state.data = [row("confermato", 4)]; draw(<OrdinaPerFornitorePanel orderId="order" items={[item]} />);
    fireEvent.click(screen.getByRole("button", { name: "Prepara acquisto…" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Pavimento ×6"); expect(screen.getByRole("dialog")).toHaveTextContent("Nessun invio automatico");
    fireEvent.click(screen.getByRole("button", { name: "Crea bozza OdA" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ quantity: 6 })] })));
  });
  it("può deselezionare gli articoli e non crea una bozza vuota", () => {
    draw(<OrdinaPerFornitorePanel orderId="order" items={[item]} />); fireEvent.click(screen.getByRole("button", { name: "Prepara acquisto…" })); fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Crea bozza OdA" })).toBeDisabled(); expect(state.create).not.toHaveBeenCalled();
  });
  it("non propone di nuovo articoli già coperti da una bozza", () => {
    state.data = [row("bozza", 10)]; draw(<OrdinaPerFornitorePanel orderId="order" items={[item]} />); expect(screen.queryByRole("button", { name: "Prepara acquisto…" })).not.toBeInTheDocument();
  });
  it("spiega come completare le righe senza fornitore", () => {
    draw(<OrdinaPerFornitorePanel orderId="order" items={[{ ...item, supplier_id: undefined }]} />); expect(screen.getByText(/articolo senza fornitore/)).toBeInTheDocument();
  });
  it("segnala distinte da controllare senza riordinare tutte le posizioni", () => {
    state.data = [row("bozza", 2)]; draw(<OrdinaPerFornitorePanel orderId="order" items={[{ ...item, posizioni: [{ descrizione: "Porta", quantita: 10 }] }]} />);
    expect(screen.getByText(/Distinta parzialmente coperta/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Prepara acquisto…" })).not.toBeInTheDocument();
  });
  it("rispetta sola lettura e non mostra importi senza il permesso costi", () => {
    state.permissions = { canEditOrders: false, canViewCosts: false }; const view = draw(<OrdinaPerFornitorePanel orderId="order" items={[item]} />);
    expect(screen.getByRole("button", { name: "Prepara acquisto…" })).toBeDisabled(); expect(view.container.textContent).not.toContain("€");
  });
  it("anche il secondo ingresso è bloccato senza dati verificati", () => {
    state.error = true; draw(<CreatePurchaseOrderButton orderId="order" items={[item]} />); expect(screen.getByRole("button", { name: "Crea bozza OdA" })).toBeDisabled();
  });
  it("un OdA non riconciliato blocca solo il suo fornitore e offre il collegamento", () => {
    state.unmapped = [{ id: "legacy", oda_number: "ODA-LEGACY", supplier_id: "s" }];
    draw(<><OrderMaterialsSummary orderId="order" items={[item]} /><OrdinaPerFornitorePanel orderId="order" items={[item]} /><CreatePurchaseOrderButton orderId="order" items={[item]} /></>);
    expect(screen.getByRole("button", { name: "Apri ODA-LEGACY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepara acquisto…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crea bozza OdA" })).toBeDisabled();
    expect(screen.getByText("Da acquistare").parentElement).toHaveTextContent("0");
  });
  it("il secondo ingresso mostra le stesse quantità residue", () => {
    state.data = [row("bozza", 3)]; draw(<CreatePurchaseOrderButton orderId="order" items={[item]} />); fireEvent.click(screen.getByRole("button", { name: "Crea bozza OdA" })); expect(screen.getByRole("dialog")).toHaveTextContent("× 7");
  });
});
