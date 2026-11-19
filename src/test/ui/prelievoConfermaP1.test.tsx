import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UscitaMerceSheet } from "@/components/warehouse/UscitaMerceSheet";

const state = vi.hoisted(() => ({ register: vi.fn(), refetch: vi.fn(), available: 10, canReplay: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditWarehouse: true, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/warehouse/useWarehouseUscita", () => ({ useRegisterUscita: () => ({ isPending: false, mutateAsync: state.register, canReplay: state.canReplay }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "uscita-warehouses" ? [{ id: "w", name: "Principale", is_default: true }] : [], isLoading: false }) }));
vi.mock("@/hooks/warehouse/useMovementAvailability", async (original) => ({
  ...await original<typeof import("@/hooks/warehouse/useMovementAvailability")>(),
  useMovementAvailability: () => ({ data: new Map([["s", { name: "Cemento", available: state.available, unit: "sacco" }]]), isLoading: false, isFetching: false, isError: false, refetch: state.refetch }),
}));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: ({ onChange }: { onChange: (id: string, row: unknown) => void }) => <button onClick={() => onChange("o", { id: "o", order_code: "DEMO-01", default_warehouse_id: "w" })}>Scegli commessa demo</button> }));
vi.mock("@/components/warehouse/AnagraficaSelectCombobox", () => ({ AnagraficaSelectCombobox: (): null => null, anagraficaDisplayName: () => "Cliente" }));
vi.mock("@/components/warehouse/ManualArticleAdder", () => ({ ManualArticleAdder: ({ onEntriesChange }: { onEntriesChange: (rows: unknown[]) => void }) => <button onClick={() => onEntriesChange([{ clientUuid: "u", stockItemId: "s", itemName: "Cemento", quantity: 5, unitOfMeasure: "sacco", trackingMode: "fungible", serialNumbers: [] as never[], rawCode: "", scannedAt: 1 }])}>Aggiungi cemento</button> }));
vi.mock("@/components/warehouse/CreaDdtDaUscitaDialog", () => ({ CreaDdtDaUscitaDialog: () => <p>Proposta DDT separata</p> }));
vi.mock("@/components/shared/CampoIndirizzo", () => ({ CampoIndirizzo: (): null => null }));

beforeEach(() => {
  state.available = 10; state.canReplay = false;
  state.register.mockReset().mockResolvedValue({ uscita_id: "u", numero: "U-1", created_movements: 1, updated_units: 0, errors: [] });
  state.refetch.mockReset().mockResolvedValue({ data: new Map([["s", { name: "Cemento", available: 10, unit: "sacco" }]]), isError: false });
});
const prepare = () => {
  render(<UscitaMerceSheet open initialWarehouseId="w" onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Scegli commessa demo" }));
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi cemento" }));
  fireEvent.click(screen.getByRole("button", { name: "Controlla prelievo (1)" }));
};
describe("Conferma del prelievo", () => {
  it("scrive solo dopo il riepilogo e propone il DDT come passo separato", async () => {
    prepare();
    expect(state.register).not.toHaveBeenCalled();
    expect(screen.getByText("DEMO-01")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conferma prelievo" }));
    await waitFor(() => expect(state.register).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "w", scans: [expect.objectContaining({ stock_item_id: "s", quantity: 5 })] })));
    expect(await screen.findByText("Proposta DDT separata")).toBeTruthy();
  });
  it("blocca una ripetizione dopo un esito di rete incerto", async () => {
    state.register.mockRejectedValue(new Error("Failed to fetch"));
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Conferma prelievo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esito da verificare");
    expect(screen.getByRole("button", { name: "Conferma prelievo" })).toBeDisabled();
    expect(state.register).toHaveBeenCalledOnce();
  });
  it("ricontrolla il disponibile e conserva le righe se cambia prima della conferma", async () => {
    state.refetch.mockResolvedValue({ data: new Map([["s", { name: "Cemento", available: 2, unit: "sacco" }]]), isError: false });
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Conferma prelievo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("richiesti 5, utilizzabili 2");
    expect(state.register).not.toHaveBeenCalled();
    expect(screen.getByText("5 sacco")).toBeTruthy();
  });
  it("verifica l’esito con gli stessi dati anche se il prelievo ha già ridotto la giacenza", async () => {
    state.canReplay = true;
    state.register.mockRejectedValueOnce(new Error("Failed to fetch"));
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Conferma prelievo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esito da verificare");
    expect(screen.getByRole("button", { name: "Modifica dati" })).toBeDisabled();
    state.available = 0;
    state.refetch.mockResolvedValue({ data: new Map([["s", { name: "Cemento", available: 0, unit: "sacco" }]]), isError: false });
    fireEvent.click(screen.getByRole("button", { name: "Verifica esito della richiesta" }));
    expect(await screen.findByText("Proposta DDT separata")).toBeTruthy();
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(state.register.mock.calls[0][0]).toEqual(state.register.mock.calls[1][0]);
  });

});
