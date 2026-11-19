import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReserveStockDialog } from "@/components/warehouse/ReserveStockDialog";
import type { StockItem } from "@/types/warehouse";
const state = vi.hoisted(() => ({
  quantity: 20, reserved: 0, tracking: "fungible", unit: "mq", own: 0, issued: 0, returned: 0,
  missing: false, write: true, error: false, atomic: true, fetching: false, save: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, canEditWarehouse: state.write, canEditOrders: state.write }) }));
vi.mock("@/hooks/warehouse/useWarehouseOperations", () => ({
  useWarehouseProtocol: () => ({ data: { atomic_reservations: state.atomic }, isLoading: false, isError: false, refetch: vi.fn() }),
  useWarehouseOperation: () => ({ isPending: false, mutateAsync: state.save }),
}));
vi.mock("@/hooks/warehouse/useReturnCandidates", () => ({ useReturnCandidates: () => ({ data: [{ orderItemId: "line", usciti: state.issued, rientrati: state.returned }], isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({
  data: queryKey[1] === "reserve-stock" ? { id: "s", name: "Pannello demo", quantity: state.quantity, quantity_reserved: state.reserved, tracking_mode: state.tracking, unita_misura: state.unit }
    : state.missing ? [] : [{ id: "line", name: "Pannello demo", quantity: 6, fulfillment_status: state.own ? "received" : "not_started", warehouse_reserved_quantity: state.own }],
  isLoading: false, isError: state.error, isFetching: queryKey[1] === "reserve-stock" && state.fetching, refetch: vi.fn(),
}) }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: ({ onChange }: { onChange: (id: string, order: unknown) => void }) => <button onClick={() => onChange("o", { order_code: "LOC-002" })}>Scegli LOC-002</button> }));
const item = { id: "s", name: "Pannello demo" } as StockItem;
function setup() {
  render(<MemoryRouter><ReserveStockDialog items={[item]} initialItem={item} onClose={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Scegli LOC-002" }));
}
function input(q: string) { fireEvent.change(screen.getByLabelText(/Totale da tenere prenotato/), { target: { value: q } }); }
beforeEach(() => { Object.assign(state, { quantity: 20, reserved: 0, tracking: "fungible", unit: "mq", own: 0, issued: 0, returned: 0, missing: false, write: true, error: false, atomic: true, fetching: false }); state.save.mockReset().mockResolvedValue({ order_item_id: "line", reserved: 6 }); });
describe("Prenotazione per commessa nel gestionale", () => {
  it("mostra prima e dopo, scrive solo alla conferma e usa il totale assoluto", async () => {
    setup(); input("6"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" }));
    expect(state.save).not.toHaveBeenCalled();
    expect(screen.getByRole("cell", { name: "14" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith({ rpc: "warehouse_reserve_v2", payload: { p_order_item_id: "line", p_quantity: 6 } }));
    expect(await screen.findByText("Prenotazione salvata")).toBeTruthy();
  });
  it.each(["-1", "abc", "2,75x", "7"])("blocca quantità invalide o oltre il fabbisogno: %s", q => {
    setup(); input(q); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled(); expect(state.save).not.toHaveBeenCalled();
  });
  it("consente frazioni per materiale misurabile", async () => {
    setup(); input("2,75"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" })); fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ payload: { p_order_item_id: "line", p_quantity: 2.75 } })));
  });
  it("non usa gli impegni di un’altra commessa", () => {
    state.reserved = 18; setup(); input("3"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled();
  });
  it("permette di modificare il proprio impegno senza richiederlo due volte", () => {
    state.reserved = 18; state.own = 4; setup(); input("6"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeEnabled();
  });
  it("sottrae dal fabbisogno quanto è ancora fuori dal deposito", () => {
    state.issued = 4; state.returned = 1; setup(); input("4"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled(); input("3"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeEnabled();
  });
  it("non prenota frazioni di una matricola", () => {
    state.tracking = "serialized"; state.unit = "pz"; setup(); input("1,5"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled();
  });
  it("libera un impegno con zero senza cambiare la giacenza", async () => {
    state.reserved = 4; state.own = 4; setup(); input("0"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" })); fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ payload: { p_order_item_id: "line", p_quantity: 0 } })));
  });
  it("non inventa righe di commessa se l’articolo non è associato", () => {
    state.missing = true; setup(); expect(screen.getByRole("link", { name: /Apri la commessa/ })).toHaveAttribute("href", "/azienda/ordini/o"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled();
  });
  it.each(["write", "atomic"] as const)("blocca il salvataggio senza %s", field => {
    state[field] = false; setup(); input("1"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled(); expect(state.save).not.toHaveBeenCalled();
  });
  it("un errore di lettura non diventa una prenotazione valida", () => {
    state.error = true; setup(); input("1"); expect(screen.getByRole("button", { name: "Controlla prenotazione" })).toBeDisabled();
  });
  it("mantiene aperto l’errore del servizio senza fingere successo", async () => {
    state.save.mockRejectedValue(new Error("Prenotazione non disponibile")); setup(); input("6"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" })); fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prenotazione non disponibile"); expect(screen.queryByText("Prenotazione salvata")).toBeNull();
  });
});

it("dopo il salvataggio non presenta i vecchi saldi come attuali durante l’aggiornamento", async () => {
  state.save.mockImplementation(async () => { state.fetching = true; return { order_item_id: "line", reserved: 6 }; });
  setup(); input("6"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" })); fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
  expect(await screen.findByText("Prenotazione salvata")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Verifica quantità e materiali");
});

it("mostra il motivo restituito dal database anche quando l’errore è un oggetto RPC", async () => {
  state.save.mockRejectedValue({ code: "PT409", message: "Disponibilità cambiata: restano 2 mq." });
  setup(); input("6"); fireEvent.click(screen.getByRole("button", { name: "Controlla prenotazione" })); fireEvent.click(screen.getByRole("button", { name: "Conferma prenotazione" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Disponibilità cambiata: restano 2 mq.");
});
