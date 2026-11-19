import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ mutate: vi.fn(), canEditWarehouse: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, canEditWarehouse: state.canEditWarehouse, isLoading: false }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] as never[] }) }));
vi.mock("@/hooks/useConsumiMateriali", () => ({ useRientroMateriale: () => ({ mutate: state.mutate, isPending: false }) }));
import RientroMagazzinoDialog from "@/components/orders/materiali/RientroMagazzinoDialog";
const riga = { id: "r", stockItemId: "s", orderItemId: "r", nome: "Cavo", unita: "m", avanzano: 2.75, posati: 1, quantita: 10, rientrati: 0, daGiacenza: true, protocolVersion: 2 as const };
beforeEach(() => { state.mutate.mockReset(); state.canEditWarehouse = true; });
describe("Resi del servizio aggiornato", () => {
  it("mantiene la frazione e invia solo dopo la conferma", () => {
    render(<RientroMagazzinoDialog orderId="o" riga={riga} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Quanti rientrano")).toHaveValue("2.75");
    fireEvent.change(screen.getByLabelText("Quanti rientrano"), { target: { value: "1,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Controlla reso" }));
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fai rientrare 1,25" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantita: 1.25, stockItemId: "s", protocolVersion: 2 }), expect.anything());
  });
  it("mostra i seriali realmente rendibili e conferma soltanto quelli selezionati", () => {
    render(<RientroMagazzinoDialog orderId="o" riga={{ ...riga, trackingMode: "serialized", unita: "pz", avanzano: 2, serials: [{ id: "a", serial_number: "SN-A" }, { id: "b", serial_number: "SN-B" }] }} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Quanti rientrano")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Controlla reso" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /SN-B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Controlla reso" }));
    fireEvent.click(screen.getByRole("button", { name: "Fai rientrare 1" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantita: 1, serialNumbers: ["SN-B"] }), expect.anything());
  });
  it("richiede anche il permesso di magazzino", () => {
    state.canEditWarehouse = false;
    render(<RientroMagazzinoDialog orderId="o" riga={riga} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Controlla reso" })).toBeDisabled();
  });
  it("rifiuta frazioni sui pezzi", () => {
    render(<RientroMagazzinoDialog orderId="o" riga={{ ...riga, unita: "pz" }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Quanti rientrano"), { target: { value: "1,5" } });
    expect(screen.getByRole("button", { name: "Controlla reso" })).toBeDisabled();
  });
});
