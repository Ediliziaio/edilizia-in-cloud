import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ViaggioDialog } from "@/components/mezzi/ViaggioDialog";
import { draftViaggioKey } from "@/lib/mezzi/viaggi";
import { ViaggiMezzoWorkspace } from "@/components/mezzi/ViaggiMezzoWorkspace";
import type { ContestoViaggi, Viaggio } from "@/lib/mezzi/viaggi";

const state = vi.hoisted(() => ({
  user: "u1",
  context: null as ContestoViaggi | null,
  rows: [] as Viaggio[],
  mutate: vi.fn(),
  lastRead: null as unknown,
  readError: false,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: state.user } }),
}));
vi.mock("@/hooks/useMezziViaggi", () => ({
  useViaggiContesto: () => ({
    data: state.context,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSalvaViaggio: () => ({
    mutateAsync: state.mutate,
    isPending: false,
    isError: false,
  }),
  useViaggiElenco: (args: unknown) => {
    state.lastRead = args;
    return {
      data: { items: state.rows, has_more: false },
      isPending: false,
      isFetching: false,
      isError: state.readError,
      error: new Error("Registro non disponibile"),
      refetch: vi.fn(),
    };
  },
  useViaggioStorico: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "c1",
}));
vi.mock("@/lib/routing", () => ({ getRoute: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.clear();
  state.user = "u1";
  state.rows = [];
  state.readError = false;
  state.mutate.mockReset().mockResolvedValue({ id: "v1", versione: 1 });
  state.context = {
    mezzo: {
      id: "m1",
      nome: "Ducato",
      contatore: 84210,
      contatore_unita: "km",
      conducente: "Mario",
      conducente_hr_id: "h1",
    },
    conducenti: [{ id: "h1", label: "Mario" }],
    cantieri: [
      { id: "o1", label: "Cantiere A", indirizzo: "Via Uno", lat: 45, lng: 9 },
    ],
    altri_cantieri: false,
    sede: { label: "Sede", lat: 45, lng: 9 },
    puo_verificare: false,
    vede_costi: false,
    puo_scrivere: true,
  };
});
afterEach(cleanup);
const form = (
  extra: Partial<React.ComponentProps<typeof ViaggioDialog>> = {},
) =>
  render(
    <ViaggioDialog companyId="c1" mezzoId="m1" onClose={vi.fn()} {...extra} />,
  );
function fill() {
  fireEvent.change(screen.getByLabelText("Data e ora partenza"), {
    target: { value: "2020-10-01T08:00" },
  });
  fireEvent.change(screen.getByLabelText("Data e ora arrivo"), {
    target: { value: "2020-10-01T10:00" },
  });
  fireEvent.change(screen.getByLabelText("Destinazione tratta 1"), {
    target: { value: "Fornitore" },
  });
  fireEvent.change(screen.getByLabelText("Km tratta 1"), {
    target: { value: "20,5" },
  });
}
describe("Viaggi nell’app operai e nell’ufficio", () => {
  it("propone il mezzo in carico, niente tariffe né verifica; aggiunge tappe senza raddoppiare i km", async () => {
    form();
    fill();
    expect(screen.getByText(/In carico a Mario/)).toBeVisible();
    expect(
      screen.queryByLabelText("Tariffa gestionale al km"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Verifica viaggio" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Aggiungi tappa / tratta" }),
    );
    expect(screen.getByLabelText("Partenza tratta 2")).toHaveValue("Fornitore");
    fireEvent.change(screen.getByLabelText("Destinazione tratta 2"), {
      target: { value: "Sede" },
    });
    fireEvent.change(screen.getByLabelText("Km tratta 2"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invia all’ufficio" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    const sent = state.mutate.mock.calls[0][0];
    expect(sent.dati.tratte.map((t: { km: number }) => t.km)).toEqual([
      20.5, 10,
    ]);
    expect(sent.dati).not.toHaveProperty("tariffa_km");
    expect(sent.dati.conducente_hr_id).toBe("h1");
  });
  it("riprende la bozza dello stesso utente dopo un invio fallito", async () => {
    state.mutate.mockRejectedValue(new Error("Rete assente"));
    const view = form();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Invia all’ufficio" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    const key = draftViaggioKey("c1", "u1", "m1");
    expect(JSON.parse(localStorage.getItem(key)!).tratte[0].a).toBe(
      "Fornitore",
    );
    view.unmount();
    form();
    expect(screen.getByLabelText("Destinazione tratta 1")).toHaveValue(
      "Fornitore",
    );
  });
  it("non recupera la bozza di un altro utente sullo stesso dispositivo", () => {
    const view = form();
    fill();
    view.unmount();
    state.user = "u2";
    form();
    expect(screen.getByLabelText("Destinazione tratta 1")).toHaveValue("");
  });
  it("azzera la compilazione anche se cambia utente senza smontare il dialogo", () => {
    const view = form();
    fill();
    state.user = "u2";
    view.rerender(
      <ViaggioDialog companyId="c1" mezzoId="m1" onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText("Destinazione tratta 1")).toHaveValue("");
  });
  it("permette di segnare subito la partenza e conservarla sul dispositivo", () => {
    form();
    fireEvent.click(screen.getByRole("button", { name: "Partenza ora" }));
    expect(screen.getByLabelText("Data e ora partenza")).not.toHaveValue("");
    expect(
      JSON.parse(localStorage.getItem(draftViaggioKey("c1", "u1", "m1"))!).da,
    ).not.toBe("");
  });
  it("precompila la commessa corrente solo se accessibile", () => {
    const view = form({ defaultOrderId: "o1" });
    expect(screen.getByLabelText("Destinazione tratta 1")).toHaveValue(
      "Cantiere A",
    );
    view.unmount();
    localStorage.clear();
    form({ defaultOrderId: "non-accessibile" });
    expect(screen.getByLabelText("Destinazione tratta 1")).toHaveValue("");
    expect(
      screen.getByRole("combobox", { name: "Attribuzione tratta 1" }),
    ).toHaveTextContent("Da attribuire in ufficio");
  });
  it("Esc chiude prima il menu e poi la finestra, senza bloccare i clic della pagina", async () => {
    state.context!.puo_verificare = true;
    const close = vi.fn();
    const view = render(
      <ViaggioDialog companyId="c1" mezzoId="m1" onClose={close} />,
    );
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Conducente del viaggio" }),
      { key: "ArrowDown" },
    );
    await screen.findByRole("listbox");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    view.unmount();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
  it("cerca un conducente autorizzato e conserva il suo identificativo nel salvataggio", async () => {
    state.context!.puo_verificare = true;
    state.context!.conducenti = [
      { id: "h1", label: "Mario" },
      { id: "h2", label: "Luca" },
    ];
    form();
    fill();
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Conducente del viaggio" }),
      { key: "ArrowDown" },
    );
    await screen.findByRole("listbox");
    fireEvent.change(
      await screen.findByRole("combobox", {
        name: "Cerca Conducente del viaggio",
      }),
      { target: { value: "Luca" } },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Luca" }));
    expect(
      screen.getByRole("combobox", { name: "Conducente del viaggio" }),
    ).toHaveTextContent("Luca");
    fireEvent.click(screen.getByRole("button", { name: "Salva bozza" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.mutate.mock.calls[0][0].dati.conducente_hr_id).toBe("h2");
  });
  it("blocca la verifica con contachilometri discordanti", () => {
    state.context!.puo_verificare = true;
    state.context!.vede_costi = true;
    form({ defaultOrderId: "o1" });
    fill();
    fireEvent.change(screen.getByLabelText("Contachilometri iniziale"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Contachilometri finale"), {
      target: { value: "150" },
    });
    expect(
      screen.getByRole("button", { name: "Verifica viaggio" }),
    ).toBeDisabled();
    expect(screen.getByText(/Scarto rispetto alle tratte/)).toHaveTextContent(
      "29,5",
    );
  });
  it("senza mezzi selezionati non manda richieste di creazione; consulta soltanto la commessa corrente", () => {
    render(
      <MemoryRouter>
        <ViaggiMezzoWorkspace
          companyId="c1"
          orderId="o1"
          readOnly
          vedeCosti={false}
        />
      </MemoryRouter>,
    );
    expect(state.lastRead).toMatchObject({ companyId: "c1", orderId: "o1" });
    expect(
      screen.queryByRole("button", { name: "Registra viaggio" }),
    ).not.toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("il registro nell’app operai non parte con letture inutili; si apre su richiesta", () => {
    render(
      <MemoryRouter>
        <ViaggiMezzoWorkspace companyId="c1" mezzoId="m1" campo />
      </MemoryRouter>,
    );
    expect(state.lastRead).toMatchObject({ enabled: false });
    fireEvent.click(screen.getByRole("button", { name: "Viaggi e tratte" }));
    expect(state.lastRead).toMatchObject({ enabled: true });
  });
  it("il messaggio di errore non viene presentato come un registro vuoto", () => {
    state.readError = true;
    render(
      <MemoryRouter>
        <ViaggiMezzoWorkspace companyId="c1" mezzoId="m1" readOnly />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Registro non disponibile",
    );
    expect(
      screen.queryByText(/Nessun viaggio registrato nel periodo/),
    ).not.toBeInTheDocument();
  });
});
