import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { PrelievoNonRegistrato } from "@/hooks/campo/useCampoPrelievo";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), disponibile: 10, cantieri: [
  { id: "C064", order_code: "C-064", description: "Via Roma" },
  { id: "C065", order_code: "C-065", description: "Scuola via Milano" },
] }));

vi.mock("@/hooks/campo/useCampoPrelievo", () => ({
  PrelievoNonRegistrato: class extends Error {},
  useCampoInventario: () => ({ data: { pages: [[{
    id: "tubo", warehouse_id: "deposito", name: "Tubo corrugato", unita_misura: "m", disponibile: state.disponibile, magazzino: "Deposito nord",
  }]] }, refetch: state.refetch }),
  useCampoCantieriPrelievo: () => ({ data: state.cantieri, refetch: state.refetch }),
  usePrelievoRegistra: () => ({ reset: vi.fn(), mutateAsync: state.mutate }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));

const cantieriAssegnati = [...state.cantieri];
beforeEach(() => {
  state.cantieri = [...cantieriAssegnati];
  state.disponibile = 10;
  state.refetch.mockClear();
  state.mutate.mockReset().mockResolvedValue({ stato: "consegnato" });
  sessionStorage.clear();
});
afterEach(cleanup);

function inventario(cantiereIniziale: string, userId = "operaio") {
  return render(<CampoInventario companyId="azienda" userId={userId} attivo puoPrelevare richiedeConferma={false}
    cantiereIniziale={cantiereIniziale} onRegistrato={vi.fn()} />);
}

function apriDaCantiere(cantiereIniziale: string) {
  inventario(cantiereIniziale);
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

  it("cambia la quantità con i pulsanti e recupera soltanto la bozza dello stesso operaio e cantiere", async () => {
    const campo = apriDaCantiere("C065");
    fireEvent.change(campo, { target: { value: "2,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Aumenta quantità di Tubo corrugato" }));
    expect(campo).toHaveValue("3,25");
    fireEvent.click(screen.getByRole("button", { name: "Diminuisci quantità di Tubo corrugato" }));
    expect(campo).toHaveValue("2,25");
    const aumenta = screen.getByRole("button", { name: "Aumenta quantità di Tubo corrugato" });
    fireEvent.change(campo, { target: { value: "9,25" } });
    fireEvent.click(aumenta);
    expect(campo).toHaveValue("10");
    expect(aumenta).toBeDisabled();
    fireEvent.change(campo, { target: { value: "2,25" } });
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Note facoltative"), { target: { value: "Per il montaggio" } });
    cleanup();

    const altroCantiere = inventario("C064");
    expect(screen.queryByRole("button", { name: /Riprendi prelievo/ })).not.toBeInTheDocument();
    altroCantiere.unmount();
    const altroOperaio = inventario("C065", "altro-operaio");
    expect(screen.queryByRole("button", { name: /Riprendi prelievo/ })).not.toBeInTheDocument();
    altroOperaio.unmount();

    inventario("C065");
    fireEvent.click(screen.getByRole("button", { name: /Riprendi prelievo/ }));
    const ripreso = await screen.findByRole("dialog");
    expect(within(ripreso).getByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toHaveValue("2,25");
    expect(within(ripreso).getByLabelText("Note facoltative")).toHaveValue("Per il montaggio");
  });

  it("verifica con lo stesso identificativo dopo il riavvio, anche se la giacenza è già stata scalata", async () => {
    state.mutate.mockRejectedValueOnce(new Error("Connessione interrotta"));
    const campo = apriDaCantiere("C065");
    fireEvent.change(campo, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Registra prelievo" }));
    await screen.findByRole("button", { name: "Verifica invio" });
    cleanup();

    state.disponibile = 0;
    inventario("C065");
    fireEvent.click(screen.getByRole("button", { name: /Verifica prelievo/ }));
    expect(await screen.findByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Verifica invio" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2));
    expect(state.mutate.mock.calls[1][0]).toEqual(state.mutate.mock.calls[0][0]);
    await waitFor(() => expect(sessionStorage.length).toBe(0));
  });

  it("permette di correggere la bozza se il magazzino respinge la registrazione", async () => {
    state.mutate.mockRejectedValueOnce(new PrelievoNonRegistrato("Giacenza insufficiente"));
    apriDaCantiere("C065");
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(state.refetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Registra prelievo" })).toBeEnabled();
  });
});
