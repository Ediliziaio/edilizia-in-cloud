import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { inviaPrelievoInCoda, type PrelievoInCoda } from "@/lib/campo/prelievoInCoda";
import { syncOperationId, syncQueue } from "@/lib/campo/sync-queue";
import {
  BOZZA_PRELIEVO_VUOTA, bozzeCantieriPrelievo, chiaveBozzaPrelievo, leggiBozzaPrelievo, salvaBozzaPrelievo,
} from "@/lib/campo/bozzaPrelievo";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), disponibile: 10, online: true, datiInCache: true, depositoTubo: "deposito", cantieri: [
  { id: "C064", order_code: "C-064", description: "Via Roma" },
  { id: "C065", order_code: "C-065", description: "Scuola via Milano" },
] }));

vi.mock("@/hooks/campo/useCampoPrelievo", () => ({
  useCampoInventario: (_azienda: string, _cerca: string, soloDisponibili: boolean) => ({
    data: state.datiInCache ? { pages: [[
      { id: "tubo", warehouse_id: state.depositoTubo, name: "Tubo corrugato", internal_code: "TUB-12", unita_misura: "m", disponibile: state.disponibile, magazzino: "Deposito nord", ubicazione: "Corsia A · Scaffale 4" },
      { id: "viti", warehouse_id: "deposito", name: "Viti zincate", unita_misura: "pz", disponibile: 12, magazzino: "Deposito nord", ubicazione: "Corsia B · Ripiano 1" },
      { id: "nastro", warehouse_id: "deposito", name: "Nastro isolante", unita_misura: "pz", disponibile: 0, magazzino: "Deposito nord", ubicazione: null },
    ].filter((articolo) => !soloDisponibili || articolo.disponibile > 0)] } : undefined,
    refetch: state.refetch,
  }),
  useCampoCantieriPrelievo: () => ({ data: state.datiInCache ? state.cantieri : undefined, refetch: state.refetch }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => state.online }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (_nome: string, args: {
    p_azienda: string; p_cantiere: string; p_magazzino: string; p_righe: unknown[]; p_note: string; p_richiesta_id: string;
  }) => {
    try {
      const esito = await state.mutate({
        orderId: args.p_cantiere, warehouseId: args.p_magazzino, righe: args.p_righe, note: args.p_note, requestId: args.p_richiesta_id,
      });
      return { data: { id: args.p_richiesta_id, ...esito }, error: null as null };
    } catch (errore) {
      return { data: null as null, error: errore };
    }
  },
} }));

let scollega = () => {};

const cantieriAssegnati = [...state.cantieri];
const chiave = chiaveBozzaPrelievo("azienda", "operaio", "C065");
beforeEach(async () => {
  for (const voce of await syncQueue.getAll()) await syncQueue.remove(voce.id);
  syncQueue.registerProcessor(async voce => inviaPrelievoInCoda(voce.payload as PrelievoInCoda, await syncOperationId(voce)));
  scollega = syncQueue.on("enqueued", () => { if (state.online) void syncQueue.processQueue(); });
  Element.prototype.scrollIntoView ??= vi.fn();
  state.cantieri = [...cantieriAssegnati];
  state.disponibile = 10;
  state.datiInCache = true;
  state.depositoTubo = "deposito";
  state.online = true;
  state.refetch.mockClear();
  state.mutate.mockReset().mockResolvedValue({ stato: "consegnato" });
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => { scollega(); cleanup(); vi.restoreAllMocks(); });

function modulo(cantiereIniziale: string | undefined, userId = "operaio") {
  return <CampoInventario companyId="azienda" userId={userId} attivo puoPrelevare richiedeConferma={false}
    cantiereIniziale={cantiereIniziale} onRegistrato={vi.fn()} />;
}

function inventario(cantiereIniziale?: string, userId = "operaio") {
  return render(modulo(cantiereIniziale, userId));
}

function apriDaCantiere(cantiereIniziale: string) {
  inventario(cantiereIniziale);
  return aggiungiTubo();
}

function aggiungiTubo() {
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi Tubo corrugato al prelievo" }));
  return screen.getByRole("textbox", { name: "Quantità di Tubo corrugato" });
}

function scegliCantiere(id: string) {
  changeFormControl(screen.getByRole("combobox", { name: "Cantiere attivo" }), { target: { value: id } });
}

describe("Destinazione del prelievo dall’app operaio", () => {
  it("mantiene il cantiere di partenza e spiega il limite di giacenza accanto alla quantità", async () => {
    const campo = apriDaCantiere("C065");
    expect(screen.getByRole("combobox", { name: "Cantiere attivo" })).toHaveTextContent("C-065 · Scuola via Milano");
    fireEvent.change(campo, { target: { value: "11" } });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Disponibili 10 m.")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "2,25" } });
    expect(campo).toHaveAttribute("aria-invalid", "false");

    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Riepilogo prelievo" });
    expect(within(dialogo).getByRole("region", { name: "C-065 · Scuola via Milano" })).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.mutate.mock.calls[0][0]).toMatchObject({
      orderId: "C065", warehouseId: "deposito", righe: [{ stock_item_id: "tubo", quantita: 2.25 }],
    });
  });

  it("richiede una scelta esplicita se il cantiere di partenza non è più assegnato", async () => {
    state.cantieri = [cantieriAssegnati[0]];
    inventario("estraneo");
    expect(screen.getByRole("combobox", { name: "Cantiere attivo" })).toHaveTextContent("Scegli cantiere");
    expect(screen.queryByRole("button", { name: "Aggiungi Tubo corrugato al prelievo" })).not.toBeInTheDocument();
    scegliCantiere("C064");
    aggiungiTubo();
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ orderId: "C064" })));
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
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByRole("textbox", { name: "Note facoltative" })).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi nota" }));
    fireEvent.change(within(dialogo).getByLabelText("Note facoltative"), { target: { value: "Per il montaggio" } });
    cleanup();
    sessionStorage.clear();
    expect(bozzeCantieriPrelievo("azienda", "operaio")).toMatchObject([{ cantiere: "C065" }]);
    expect(bozzeCantieriPrelievo("altra-azienda", "operaio")).toEqual([]);
    expect(bozzeCantieriPrelievo("azienda", "altro-operaio")).toEqual([]);

    const altroCantiere = inventario("C064");
    expect(screen.queryByRole("textbox", { name: "Quantità di Tubo corrugato" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rivedi · 1 materiale" })).toBeInTheDocument();
    altroCantiere.unmount();
    const altroOperaio = inventario("C065", "altro-operaio");
    expect(screen.queryByRole("button", { name: /^Rivedi ·/ })).not.toBeInTheDocument();
    altroOperaio.unmount();

    inventario("C065");
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const ripreso = await screen.findByRole("dialog");
    expect(within(ripreso).getByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toHaveValue("2,25");
    expect(within(ripreso).getByLabelText("Note facoltative")).toHaveValue("Per il montaggio");
  });

  it("accoda prima di inviare e ritenta con lo stesso identificativo anche dopo il rimontaggio", async () => {
    state.mutate.mockRejectedValueOnce(new Error("Failed to fetch"));
    const campo = apriDaCantiere("C065");
    fireEvent.change(campo, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Registra prelievo" }));
    await waitFor(async () => expect(await syncQueue.getAll("prelievo")).toMatchObject([{ status: "pending", retryCount: 1 }]));
    cleanup();
    sessionStorage.clear();

    state.online = false;
    state.disponibile = 0;
    inventario("C065");
    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(leggiBozzaPrelievo(chiave)).toMatchObject({ inVerifica: true });

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 1500);
    state.online = true;
    await syncQueue.processQueue();
    expect(state.mutate).toHaveBeenCalledTimes(2);
    expect(state.mutate.mock.calls[1][0]).toEqual(state.mutate.mock.calls[0][0]);
    expect(leggiBozzaPrelievo(chiave)).toEqual(BOZZA_PRELIEVO_VUOTA);
  });

  it("riapre la bozza quando il magazzino conferma che la registrazione è stata respinta", async () => {
    state.mutate.mockRejectedValueOnce({ code: "P0001", message: "Giacenza insufficiente" });
    apriDaCantiere("C065");
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Registra prelievo" }));
    await waitFor(async () => {
      expect(state.mutate).toHaveBeenCalledTimes(1);
      expect(await syncQueue.getAll("prelievo")).toEqual([]);
      expect(leggiBozzaPrelievo(chiave)).toMatchObject({ inVerifica: false });
    });
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    expect(await screen.findByRole("textbox", { name: "Verifica quantità di Tubo corrugato" })).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const registra = await screen.findByRole("button", { name: "Registra prelievo" });
    expect(salvaBozzaPrelievo(chiave, bozza, BOZZA_PRELIEVO_VUOTA)).toEqual({ stato: "salvata" });
    fireEvent.click(registra);
    expect(state.mutate).not.toHaveBeenCalled();
    expect(leggiBozzaPrelievo(chiave)).toEqual(BOZZA_PRELIEVO_VUOTA);
  });

  it("attende un salvataggio locale riuscito prima di inviare il prelievo", async () => {
    apriDaCantiere("C065");
    fireEvent.click(screen.getByRole("button", { name: /^Rivedi ·/ }));
    const registra = await screen.findByRole("button", { name: "Registra prelievo" });
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => { throw new Error("Spazio esaurito"); });
    fireEvent.click(registra);
    expect(state.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText("Non riesco a salvare il prelievo su questo dispositivo. Riprova.")).toBeInTheDocument();
    fireEvent.click(registra);
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
  });

  it("mostra dove prendere i materiali e conferma più articoli insieme", async () => {
    inventario("C065");
    expect(screen.getByText("Corsia A · Scaffale 4")).toBeInTheDocument();
    expect(screen.queryByText("Nastro isolante")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Disponibilità dei materiali" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Tutti" }));
    expect(screen.getByText("Nastro isolante")).toBeInTheDocument();
    expect(screen.getByText("Esaurito")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi Nastro isolante al prelievo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Tubo corrugato al prelievo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 1 materiale" }));
    const primo = await screen.findByRole("dialog");
    fireEvent.click(within(primo).getByRole("button", { name: "Inventario" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi Viti zincate al prelievo" }));
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 materiali" }));

    const riepilogo = within(await screen.findByRole("dialog"));
    expect(riepilogo.getByText("Corsia B · Ripiano 1")).toBeInTheDocument();
    fireEvent.click(riepilogo.getByRole("button", { name: "Aumenta quantità di Viti zincate" }));
    fireEvent.change(riepilogo.getByRole("textbox", { name: "Verifica quantità di Tubo corrugato" }), { target: { value: "2,25" } });
    fireEvent.click(riepilogo.getByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ orderId: "C065", righe: [
      { stock_item_id: "tubo", quantita: 2.25 }, { stock_item_id: "viti", quantita: 2 },
    ] });
  });

  it("tiene due liste separate e calcola la quantità disponibile complessiva", async () => {
    fireEvent.change(apriDaCantiere("C065"), { target: { value: "6,25" } });
    scegliCantiere("C064");
    expect(screen.getByText("6,25 m in altre bozze")).toBeInTheDocument();
    expect(screen.getByText("Per il cantiere").parentElement).toHaveTextContent("3,75 m");
    fireEvent.change(aggiungiTubo(), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 prelievi" }));

    const dialogo = within(await screen.findByRole("dialog", { name: "Riepilogo prelievi" }));
    const roma = within(dialogo.getByRole("region", { name: "C-064 · Via Roma" }));
    const milano = within(dialogo.getByRole("region", { name: "C-065 · Scuola via Milano" }));
    expect(milano.getByRole("textbox", { name: /Verifica quantità/ })).toHaveValue("6,25");
    expect(roma.getByText("Disponibili 3,75 m con le altre bozze.")).toBeInTheDocument();
    const registra = dialogo.getByRole("button", { name: "Registra 2 prelievi" });
    expect(registra).toBeDisabled();
    expect(dialogo.queryByRole("button", { name: "Per ubicazione" })).not.toBeInTheDocument();
    fireEvent.change(roma.getByRole("textbox", { name: /Verifica quantità/ }), { target: { value: "3,75" } });
    fireEvent.click(dialogo.getByRole("button", { name: "Per ubicazione" }));
    const lista = within(dialogo.getByRole("region", { name: "Lista ritiro" }));
    expect(lista.getAllByText("Tubo corrugato")).toHaveLength(1);
    expect(lista.getByText("10 m", { exact: true })).toBeInTheDocument();
    expect(lista.getByText("C-065 · Scuola via Milano").closest("li")).toHaveTextContent("6,25 m");
    expect(lista.getByText("C-064 · Via Roma").closest("li")).toHaveTextContent("3,75 m");
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(registra);

    await waitFor(() => expect(bozzeCantieriPrelievo("azienda", "operaio")).toEqual([]));
    expect(state.mutate).toHaveBeenCalledTimes(2);
    const [primo, secondo] = state.mutate.mock.calls.map(([arg]) => arg);
    expect(primo).toMatchObject({ orderId: "C065", righe: [{ stock_item_id: "tubo", quantita: 6.25 }] });
    expect(secondo).toMatchObject({ orderId: "C064", righe: [{ stock_item_id: "tubo", quantita: 3.75 }] });
    expect(primo.requestId).not.toBe(secondo.requestId);
  });

  it("mostra ubicazioni e codici salvati quando il telefono è offline", async () => {
    fireEvent.change(apriDaCantiere("C065"), { target: { value: "1,25" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Viti zincate al prelievo" }));
    scegliCantiere("C064");
    aggiungiTubo();
    cleanup();
    state.datiInCache = false;
    state.online = false;
    inventario();

    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 prelievi" }));
    const dialogo = within(await screen.findByRole("dialog"));
    fireEvent.click(dialogo.getByRole("button", { name: "Per ubicazione" }));
    const lista = within(dialogo.getByRole("region", { name: "Lista ritiro" }));
    const scaffale = within(lista.getByRole("region", { name: "Deposito nord · Corsia A · Scaffale 4" }));
    expect(scaffale.getByText("TUB-12")).toBeInTheDocument();
    expect(scaffale.getByText("2,25 m", { exact: true })).toBeInTheDocument();
    const ripiano = within(lista.getByRole("region", { name: "Deposito nord · Corsia B · Ripiano 1" }));
    expect(ripiano.getByText("Viti zincate")).toBeInTheDocument();
    expect(dialogo.getByRole("button", { name: "Metti in coda 2 prelievi" })).toBeEnabled();
  });

  it("segnala lo spostamento di un articolo prima di indicarlo nella lista di ritiro", async () => {
    const vista = inventario("C065");
    aggiungiTubo();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Viti zincate al prelievo" }));
    state.depositoTubo = "nuovo-deposito";
    vista.rerender(modulo("C065"));
    expect(screen.getByText("Articolo spostato. Rimuovilo e aggiungilo di nuovo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 materiali" }));
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.queryByRole("button", { name: "Per ubicazione" })).not.toBeInTheDocument();
    expect(dialogo.getByRole("button", { name: "Registra prelievo" })).toBeDisabled();
  });

  it("accoda due cantieri offline e ritenta soltanto l’invio rimasto incerto", async () => {
    apriDaCantiere("C065");
    scegliCantiere("C064");
    aggiungiTubo();
    cleanup();
    sessionStorage.clear();
    state.online = false;
    inventario();
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 prelievi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Metti in coda 2 prelievi" }));
    await waitFor(async () => expect(await syncQueue.getAll("prelievo")).toHaveLength(2));
    expect(state.mutate).not.toHaveBeenCalled();

    state.mutate.mockResolvedValueOnce({ stato: "consegnato" }).mockRejectedValueOnce(new Error("Failed to fetch"));
    state.online = true;
    await syncQueue.processQueue();
    expect(bozzeCantieriPrelievo("azienda", "operaio")).toMatchObject([
      { cantiere: "C064", bozza: { inVerifica: true } },
    ]);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 1500);
    await syncQueue.processQueue();
    expect(state.mutate).toHaveBeenCalledTimes(3);
    expect(state.mutate.mock.calls[2][0]).toEqual(state.mutate.mock.calls[1][0]);
    expect(state.mutate.mock.calls[0][0].orderId).toBe("C065");
  });

  it("registra la lista pronta e conserva quella ancora da completare", async () => {
    apriDaCantiere("C065");
    scegliCantiere("C064");
    fireEvent.change(aggiungiTubo(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 prelievi" }));
    expect(await screen.findByText("Invii solo i prelievi pronti.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registra prelievo" }));
    await waitFor(() => expect(bozzeCantieriPrelievo("azienda", "operaio")).toMatchObject([
      { cantiere: "C064", bozza: { inVerifica: false } },
    ]));
    expect(state.mutate).toHaveBeenCalledOnce();
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ orderId: "C065" }));
  });

  it("recupera una bozza precedente mantenendo la destinazione salvata nella lista", async () => {
    apriDaCantiere("C065");
    const precedente = leggiBozzaPrelievo(chiave);
    cleanup();
    salvaBozzaPrelievo(chiave, precedente, { ...precedente, orderId: "C064", nomeCantiere: "C-064 · Via Roma" });

    apriDaCantiere("C065");
    fireEvent.click(screen.getByRole("button", { name: "Rivedi · 2 prelievi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Registra 2 prelievi" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2));
    expect(state.mutate.mock.calls[0][0]).toMatchObject({ orderId: "C064", requestId: precedente.id });
    expect(state.mutate.mock.calls[1][0]).toMatchObject({ orderId: "C065" });
  });
});
