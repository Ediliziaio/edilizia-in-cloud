import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  QuadroDpiEsterni,
  ConsegnaDpiEsterno,
  AmbitoDpiEsterni,
} from "@/hooks/useDpiEsterni";
import type { VerbaleDpi } from "@/lib/sicurezza/dpiCommessa";
const s = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  loading: false,
  q: undefined as QuadroDpiEsterni | undefined,
  save: vi.fn(),
  open: vi.fn(),
  query: vi.fn(),
  reread: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useDpiEsterni", () => ({
  leggiDpiEsterni: (...v: unknown[]) => s.reread(...v),
  useDpiEsterni: (...v: unknown[]) => {
    s.query(...v);
    return {
      data: s.q,
      isError: s.error,
      isLoading: s.loading,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useSalvaDpiEsterni: () => ({ isPending: false, mutateAsync: s.save }),
  useStoricoDpiEsterni: () => ({
    data: [],
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  apriVerbaleDpiEsterno: (...v: unknown[]) => s.open(...v),
}));
vi.mock("@/hooks/useGestioneDpi", () => ({
  useSalvaDpi: () => {
    throw new Error(
      "Il registro interno non deve essere usato per operai esterni",
    );
  },
  useStoricoDpi: () => {
    throw new Error("Non leggere lo storico interno");
  },
}));
import { DpiEsterni } from "@/components/sicurezza/DpiEsterni";
const ambito: AmbitoDpiEsterni = {
  companyId: "azienda",
  subId: "sub1",
  orderId: "commessa",
  data: "2026-10-27",
  faseId: "fase",
};
const verbale = (operaio_id: string, id: string): VerbaleDpi => ({
  id,
  operaio_id,
  titolo: `Verbale ${id}`,
  file_name: `${id}.pdf`,
  catalogo_id: "consegna_dpi",
  catalogo_versione: 1,
  order_id: null,
  fase_id: null,
  applicabile_dal: null,
  applicabile_al: null,
  stato: "ricevuto",
  data_rilascio: null,
  data_scadenza: null,
  updated_at: "2026-10-27T10:00:00.123456+00:00",
  impronta: `hash-${id}`,
});
const consegna = (
  patch: Partial<ConsegnaDpiEsterno> = {},
): ConsegnaDpiEsterno => ({
  id: "d1",
  tipo: "casco",
  marca: "Marca",
  matricola: "1",
  consegnato_il: "2026-10-01",
  scade_il: null,
  stato: "in_use",
  restituito_il: null,
  modulo_registrato: true,
  versione: 2,
  evidenza_id: "e1",
  evidenza_attesa: verbale("a1", "e1").updated_at,
  evidenza_impronta: "hash-e1",
  evidenza_snapshot: verbale("a1", "e1"),
  verbale_cambiato: false,
  verbale_pertinente: true,
  verbale_corrente: verbale("a1", "e1"),
  ...patch,
});
beforeEach(() => {
  s.allowed = true;
  s.readonly = false;
  s.error = false;
  s.loading = false;
  s.query.mockClear();
  s.reread.mockReset();
  s.save.mockReset().mockResolvedValue({});
  s.open.mockReset().mockResolvedValue(undefined);
  s.q = {
    company_id: "azienda",
    sub_id: "sub1",
    order_id: "commessa",
    data: "2026-10-27",
    fase_id: "fase",
    addetti: [
      {
        id: "a1",
        nome: "Mario",
        cognome: "Rossi",
        qualifica: "Posatore",
        attivo: true,
        assegnazioni: [],
        consegne: [],
      },
      {
        id: "a2",
        nome: "Mario",
        cognome: "Rossi",
        qualifica: "Posatore",
        attivo: true,
        assegnazioni: [],
        consegne: [],
      },
    ],
    evidenze: [verbale("a1", "e1"), verbale("a2", "e2")],
  };
});
afterEach(cleanup);
const mostra = (aperto = true) =>
  render(<DpiEsterni ambito={ambito} apertoIniziale={aperto} />);
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
describe("DPI delle imprese esterne senza fusione con il registro interno", () => {
  it("legge su apertura con contesto esatto e non mostra dati quando il permesso viene meno", () => {
    const r = mostra(false);
    expect(s.query).toHaveBeenLastCalledWith(ambito, false);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Dotazioni DPI dell’impresa esterna/,
      }),
    );
    expect(s.query).toHaveBeenLastCalledWith(ambito, true);
    expect(screen.getByText("2 operai nel contesto")).toBeTruthy();
    s.allowed = false;
    r.rerender(<DpiEsterni ambito={ambito} apertoIniziale />);
    expect(screen.queryByText(/Mario/)).toBeNull();
  });
  it("distingue errore e zero operai senza affermare la completezza", () => {
    s.error = true;
    const r = mostra();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "non è possibile confermare completezza",
    );
    expect(screen.queryByText("2 operai nel contesto")).toBeNull();
    s.error = false;
    s.q!.addetti = [];
    r.rerender(<DpiEsterni ambito={ambito} apertoIniziale />);
    expect(
      screen.getByText(/non vengono creati dipendenti interni/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Registra dotazione esterna" }),
    ).toBeDisabled();
  });
  it("il modulo propone soltanto i verbali del titolare e manda la richiesta al registro esterno", async () => {
    mostra();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra dotazione esterna" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Registro dell’impresa esterna",
    );
    change("Addetto titolare", "a1");
    const sel = screen.getByLabelText("Verbale DPI dal fascicolo dell’operaio");
    expect(
      within(sel)
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["", "e1"]);
    change("Dispositivo", "casco");
    change("Data di consegna", "2026-10-27");
    change(
      "Motivo della registrazione o rettifica",
      "Collegamento nominativo da verificare",
    );
    change("Verbale DPI dal fascicolo dell’operaio", "e1");
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0]).toMatchObject({
      titolareId: "a1",
      dataRiferimento: "2026-10-27",
      faseId: "fase",
      dati: {
        evidenza_id: "e1",
        evidenza_attesa: "2026-10-27T10:00:00.123456+00:00",
        evidenza_impronta: "hash-e1",
      },
    });
  });
  it("cambiare operaio azzera la scelta del verbale di un omonimo", () => {
    mostra();
    fireEvent.click(
      screen.getByRole("button", { name: "Registra dotazione esterna" }),
    );
    change("Addetto titolare", "a1");
    change("Verbale DPI dal fascicolo dell’operaio", "e1");
    change("Addetto titolare", "a2");
    expect(
      screen.getByLabelText("Verbale DPI dal fascicolo dell’operaio"),
    ).toHaveValue("");
    expect(
      within(screen.getByLabelText("Verbale DPI dal fascicolo dell’operaio"))
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["", "e2"]);
  });
  it("una variazione dell’impronta richiede scelta esplicita anche se il timestamp coincide", async () => {
    s.q!.addetti[0].consegne = [
      consegna({ evidenza_impronta: "vecchia", verbale_cambiato: true }),
    ];
    mostra();
    fireEvent.click(
      screen.getByRole("button", { name: "Rettifica dotazione" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Il riferimento salvato è cambiato",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questa versione del verbale" }),
    );
    change(
      "Motivo della registrazione o rettifica",
      "Riesame della versione corrente",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0]).toMatchObject({
      versione: 2,
      dati: { evidenza_impronta: "hash-e1" },
    });
  });
  it("rilegge i verbali senza perdere la rettifica e conferma la nuova impronta solo su richiesta", async () => {
    s.q!.addetti[0].consegne = [consegna()];
    s.reread.mockResolvedValue({
      ...s.q!,
      evidenze: [{ ...verbale("a1", "e1"), impronta: "hash-nuovo" }],
    });
    mostra();
    fireEvent.click(
      screen.getByRole("button", { name: "Rettifica dotazione" }),
    );
    change("Motivo della registrazione o rettifica", "Conferma dopo rilettura");
    change("Marca", "Marca da conservare");
    fireEvent.click(
      screen.getByRole("button", { name: "Rileggi verbali dal fascicolo" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Usa questa versione del verbale" }),
      ).toBeTruthy(),
    );
    expect(s.reread).toHaveBeenCalledWith(ambito);
    expect(screen.getByLabelText("Marca")).toHaveValue("Marca da conservare");
    expect(
      screen.getByLabelText("Motivo della registrazione o rettifica"),
    ).toHaveValue("Conferma dopo rilettura");
    expect(s.save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa questa versione del verbale" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva nel registro" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0]).toMatchObject({
      versione: 2,
      dati: {
        marca: "Marca da conservare",
        evidenza_impronta: "hash-nuovo",
        evidenza_attesa: verbale("a1", "e1").updated_at,
      },
    });
  });
  it("un verbale fuori ambito non offre l’apertura come documento pertinente", () => {
    s.q!.addetti[0].consegne = [consegna({ verbale_pertinente: false })];
    mostra();
    expect(
      screen.getByText(
        "Verbale non disponibile o non pertinente a questo contesto.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Apri verbale corrente" }),
    ).toBeNull();
    expect(s.open).not.toHaveBeenCalled();
  });
  it("la sola lettura conserva storico e apertura autorizzata, senza azioni di scrittura", async () => {
    s.readonly = true;
    s.q!.addetti[0].consegne = [consegna()];
    mostra();
    expect(
      screen.queryByRole("button", { name: "Registra dotazione esterna" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Rettifica dotazione" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Apri verbale corrente" }),
    );
    await waitFor(() =>
      expect(s.open).toHaveBeenCalledWith(ambito, "a1", verbale("a1", "e1")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Storico dotazione" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Storico della consegna DPI",
    );
  });
});
