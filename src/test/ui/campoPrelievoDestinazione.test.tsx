import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoInventario } from "@/components/campo/CampoInventario";

const state = vi.hoisted(() => ({ mutate: vi.fn(), cantieri: [
  { id: "C064", order_code: "C-064", description: "Via Roma" },
  { id: "C065", order_code: "C-065", description: "Scuola via Milano" },
] }));

vi.mock("@/hooks/campo/useCampoPrelievo", () => ({
  useCampoInventario: () => ({ data: { pages: [[{
    id: "tubo", warehouse_id: "deposito", name: "Tubo corrugato", unita_misura: "m", disponibile: 10, magazzino: "Deposito nord",
  }]] } }),
  useCampoCantieriPrelievo: () => ({ data: state.cantieri }),
  usePrelievoRegistra: () => ({ reset: vi.fn(), mutateAsync: state.mutate }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));

const cantieriAssegnati = [...state.cantieri];
beforeEach(() => {
  state.cantieri = [...cantieriAssegnati];
  state.mutate.mockReset().mockResolvedValue({ stato: "consegnato" });
});
afterEach(cleanup);

function apriDaCantiere(cantiereIniziale: string) {
  render(<CampoInventario companyId="azienda" attivo puoPrelevare richiedeConferma={false}
    cantiereIniziale={cantiereIniziale} onRegistrato={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi Tubo corrugato al prelievo" }));
  return screen.getByRole("textbox", { name: "Quantità di Tubo corrugato" });
}

describe("Destinazione del prelievo dall’app operaio", () => {
  it("mantiene il cantiere di partenza e spiega il limite di giacenza accanto alla quantità", async () => {
    const campo = apriDaCantiere("C065");
    expect(screen.getByText("C-065 · Scuola via Milano")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "11" } });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Disponibili 10 m.")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "2,25" } });
    expect(campo).toHaveAttribute("aria-invalid", "false");

    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Materiale per il cantiere" });
    expect(within(dialogo).getByRole("combobox", { name: "Cantiere di destinazione" })).toHaveTextContent("C-065 · Scuola via Milano");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.mutate.mock.calls[0][0]).toMatchObject({
      orderId: "C065", warehouseId: "deposito", righe: [{ stock_item_id: "tubo", quantita: 2.25 }],
    });
  });

  it("richiede una scelta esplicita se il cantiere di partenza non è più assegnato", async () => {
    state.cantieri = [cantieriAssegnati[0]];
    apriDaCantiere("estraneo");
    expect(screen.getByText("Scegli il cantiere nel riepilogo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("combobox", { name: "Cantiere di destinazione" })).toHaveTextContent("Scegli un cantiere");
    expect(within(dialogo).getByRole("button", { name: "Registra prelievo" })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
