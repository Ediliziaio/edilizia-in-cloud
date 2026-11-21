import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { PrelievoNonRegistrato } from "@/hooks/campo/useCampoPrelievo";
import {
  BOZZA_PRELIEVO_VUOTA, bozzeCantieriPrelievo, chiaveBozzaPrelievo, leggiBozzaPrelievo, salvaBozzaPrelievo,
} from "@/lib/campo/bozzaPrelievo";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), disponibile: 10, online: true, cantieri: [
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
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => state.online }));

const cantieriAssegnati = [...state.cantieri];
const chiave = chiaveBozzaPrelievo("azienda", "operaio", "C065");
beforeEach(() => {
  state.cantieri = [...cantieriAssegnati];
  state.disponibile = 10;
  state.online = true;
  state.refetch.mockClear();
  state.mutate.mockReset().mockResolvedValue({ stato: "consegnato" });
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function modulo(cantiereIniziale: string, userId = "operaio") {
  return <CampoInventario companyId="azienda" userId={userId} attivo puoPrelevare richiedeConferma={false}
    cantiereIniziale={cantiereIniziale} onRegistrato={vi.fn()} />;
}

function inventario(cantiereIniziale: string, userId = "operaio") {
  return render(modulo(cantiereIniziale, userId));
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
    sessionStorage.clear();
    expect(bozzeCantieriPrelievo("azienda", "operaio")).toMatchObject([{ cantiere: "C065" }]);
    expect(bozzeCantieriPrelievo("altra-azienda", "operaio")).toEqual([]);
    expect(bozzeCantieriPrelievo("azienda", "altro-operaio")).toEqual([]);

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
    sessionStorage.clear();

    state.online = false;
    state.disponibile = 0;
    const riaperto = inventario("C065");
    fireEvent.click(screen.getByRole("button", { name: /Verifica prelievo/ }));
    expect(await screen.findByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verifica invio" })).toBeDisabled();
    expect(state.mutate).toHaveBeenCalledTimes(1);
    state.online = true;
    riaperto.rerender(modulo("C065"));
    fireEvent.click(screen.getByRole("button", { name: "Verifica invio" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2));
    expect(state.mutate.mock.calls[1][0]).toEqual(state.mutate.mock.calls[0][0]);
    await waitFor(() => expect(leggiBozzaPrelievo(chiave)).toEqual(BOZZA_PRELIEVO_VUOTA));
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

  it("recupera l’identificativo di un invio rimasto in sospeso prima dell’aggiornamento", async () => {
    apriDaCantiere("C065");
    const precedente = leggiBozzaPrelievo(chiave);
    cleanup();
    const richiestaId = crypto.randomUUID();
    localStorage.removeItem(chiave);
    sessionStorage.setItem(chiave, JSON.stringify({
      righe: precedente.righe, orderId: "C065", note: precedente.note, richiestaId,
    }));
    expect(leggiBozzaPrelievo(chiave)).toMatchObject({ id: richiestaId, inVerifica: true });
    sessionStorage.clear();
    inventario("C065");
    fireEvent.click(screen.getByRole("button", { name: /Verifica prelievo/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Verifica invio" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ requestId: richiestaId })));
  });

  it("impedisce a una scheda rimasta aperta di inviare una bozza già conclusa altrove", async () => {
    apriDaCantiere("C065");
    const bozza = leggiBozzaPrelievo(chiave);
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    const registra = await screen.findByRole("button", { name: "Registra prelievo" });
    expect(salvaBozzaPrelievo(chiave, bozza, BOZZA_PRELIEVO_VUOTA)).toEqual({ stato: "salvata" });
    fireEvent.click(registra);
    expect(state.mutate).not.toHaveBeenCalled();
    expect(leggiBozzaPrelievo(chiave)).toEqual(BOZZA_PRELIEVO_VUOTA);
  });

  it("attende un salvataggio locale riuscito prima di inviare il prelievo", async () => {
    apriDaCantiere("C065");
    fireEvent.click(screen.getByRole("button", { name: /Rivedi prelievo/ }));
    const registra = await screen.findByRole("button", { name: "Registra prelievo" });
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => { throw new Error("Spazio esaurito"); });
    fireEvent.click(registra);
    expect(state.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText("Non riesco a salvare il prelievo su questo dispositivo. Riprova.")).toBeInTheDocument();
    fireEvent.click(registra);
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
  });
});
