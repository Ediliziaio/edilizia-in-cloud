import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CaricoRapidoSheet } from "@/components/warehouse/CaricoRapidoSheet";

const state = vi.hoisted(() => ({ save: vi.fn(), price: 20 as number | undefined, costs: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "u", email: "demo@example.invalid" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditWarehouse: true, canViewCosts: state.costs, isLoading: false }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "carico-rapido-warehouses" ? [{ id: "w1", name: "Principale", is_default: true }, { id: "w2", name: "Secondario", is_default: false }] : [], isLoading: false }),
}));
vi.mock("@/hooks/warehouse/useBatchCarico", () => ({ useBatchCarico: () => ({ isPending: false, mutateAsync: state.save }) }));
vi.mock("@/components/warehouse/StockItemDialog", () => ({ StockItemDialog: (): null => null }));
vi.mock("@/components/warehouse/ManualArticleAdder", () => ({ ManualArticleAdder: ({ onEntriesChange }: { onEntriesChange: (rows: unknown[]) => void }) => <button onClick={() => onEntriesChange([{ clientUuid: "uuid", stockItemId: "s", itemName: "Guaina", quantity: 0.75, purchasePrice: state.price, unitOfMeasure: "m²", trackingMode: "fungible", serialNumbers: [] as never[], rawCode: "", scannedAt: 1 }])}>Inserisci guaina di prova</button> }));

beforeEach(() => { state.save.mockReset(); state.price = 20; state.costs = true; });
const prepare = () => {
  render(<MemoryRouter><CaricoRapidoSheet open initialWarehouseId="w2" onOpenChange={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Inserisci guaina di prova" }));
  fireEvent.click(screen.getByRole("button", { name: "Controlla carico" }));
};
describe("Carico manuale con conferma", () => {
  it("raggiunge il riepilogo senza scanner e scrive solo alla conferma", async () => {
    state.save.mockResolvedValue({ created_movements: 1, created_units: 0, errors: [] });
    prepare();
    expect(screen.getByText("Secondario")).toBeTruthy();
    expect(screen.getByText("0,75 m²")).toBeTruthy();
    expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conferma carico" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "w2", entries: [expect.objectContaining({ quantity: 0.75 })] })));
  });
  it("conserva righe e riepilogo se la conferma fallisce", async () => {
    state.save.mockRejectedValue(new Error("Connessione interrotta"));
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Conferma carico" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
    fireEvent.click(screen.getByRole("button", { name: "Modifica dati" }));
    expect(screen.getByRole("button", { name: "Controlla carico" })).toBeEnabled();
  });
  it("mostra l’esito parziale e impedisce di ripetere l’intero carico", async () => {
    state.save.mockResolvedValue({ created_movements: 0, created_units: 0, errors: [{ stock_item_id: "s", error: "Seriale duplicato" }] });
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Conferma carico" }));
    expect(await screen.findByText(/Seriale duplicato/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conferma carico" })).toBeNull();
  });
});

it("registra il costo solo alla conferma e mostra imponibile, data e stato", async () => {
  state.save.mockResolvedValue({ created_movements: 1, created_units: 0, errors: [], company_cost_id: "cost", company_cost_amount: 15 });
  render(<MemoryRouter><CaricoRapidoSheet open onOpenChange={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", {name:"Inserisci guaina di prova"}));
  fireEvent.click(screen.getByLabelText("Registra costo acquisto nei Costi Aziendali"));
  fireEvent.change(screen.getByLabelText("Data pagamento"), {target:{value:"2026-11-18"}});
  fireEvent.click(screen.getByRole("button", {name:"Controlla carico"}));
  expect(screen.getByText("Costo aziendale da registrare")).toBeTruthy();
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"Conferma carico"}));
  await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({companyCost:{date:"2026-11-18",category:"Magazzino",vat_rate:22,is_paid:true}})));
});
it("senza prezzi non permette un falso costo a zero", () => {
  state.price = undefined;
  render(<MemoryRouter><CaricoRapidoSheet open onOpenChange={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", {name:"Inserisci guaina di prova"}));
  fireEvent.click(screen.getByLabelText("Registra costo acquisto nei Costi Aziendali"));
  fireEvent.click(screen.getByRole("button", {name:"Controlla carico"}));
  expect(screen.getByRole("button", {name:"Conferma carico"})).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
});
it("nasconde l’opzione al ruolo senza accesso ai costi", () => {
  state.costs = false;
  render(<MemoryRouter><CaricoRapidoSheet open onOpenChange={vi.fn()} /></MemoryRouter>);
  expect(screen.queryByLabelText("Registra costo acquisto nei Costi Aziendali")).toBeNull();
});
