import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  vuotoProdottoSds,
  type QuadroProdottiSds,
  type ImpiegoProdottoSds,
} from "@/lib/sicurezza/prodottiSds";
const s = vi.hoisted(() => ({
  allowed: true,
  readonly: false,
  error: false,
  loading: false,
  q: undefined as QuadroProdottiSds | undefined,
  save: vi.fn(),
  read: vi.fn(),
  open: vi.fn(),
  hook: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: s.allowed,
    solaLettura: s.readonly,
  }),
}));
vi.mock("@/hooks/useProdottiSds", () => ({
  useProdottiSds: (...v: unknown[]) => {
    s.hook(...v);
    return {
      data: s.q,
      isError: s.error,
      isLoading: s.loading,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useSalvaProdottoSds: () => ({ isPending: false, mutateAsync: s.save }),
  useStoricoProdottoSds: () => ({
    data: [],
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  leggiProdottiSds: (...v: unknown[]) => s.read(...v),
  apriSdsProdotto: (...v: unknown[]) => s.open(...v),
}));
import { ProdottiSdsCommessa } from "@/components/sicurezza/ProdottiSdsCommessa";
const frame = (): QuadroProdottiSds => ({
  company_id: "azienda",
  order_id: "ordine",
  data: "2026-10-27",
  fase_id: "fase",
  materiali: [
    {
      id: "m1",
      order_id: "ordine",
      nome: "Sigillante omonimo",
      codice: "A1",
      stock_item_id: null,
      fase_id: "fase",
      natura_riga: "materiale",
      impronta: "m-hash",
    },
    {
      id: "m2",
      order_id: "ordine",
      nome: "Sigillante omonimo",
      codice: "A2",
      stock_item_id: null,
      fase_id: "fase",
      natura_riga: "materiale",
      impronta: "m2-hash",
    },
  ],
  imprese: [{ id: "sub", ragione_sociale: "Impresa esterna" }],
  documenti: [
    {
      id: "e1",
      subappaltatore_id: null,
      order_id: "ordine",
      fase_id: null,
      titolo: "SDS del prodotto A",
      file_name: "a.pdf",
      revisione: "1.0",
      data_rilascio: "2026-10-01",
      data_scadenza: null,
      stato: "ricevuto",
      applicabile_dal: null,
      applicabile_al: null,
      updated_at: "2026-10-27T10:00:00.123456Z",
      disponibile: true,
      impronta: "e-hash",
    },
    {
      id: "e2",
      subappaltatore_id: "sub",
      order_id: "ordine",
      fase_id: null,
      titolo: "SDS esterna",
      file_name: "ext.pdf",
      revisione: "2.0",
      data_rilascio: "2026-10-01",
      data_scadenza: null,
      stato: "verificato",
      applicabile_dal: null,
      applicabile_al: null,
      updated_at: "2026-10-27T10:00:00Z",
      disponibile: true,
      impronta: "ext-hash",
    },
  ],
  impieghi: [],
});
const prodotto = (): ImpiegoProdottoSds => ({
  ...vuotoProdottoSds("2026-10-27", "fase"),
  id: "p1",
  company_id: "azienda",
  order_id: "ordine",
  versione: 2,
  aggiornato_il: "2026-10-27T11:00:00Z",
  nome: "Prodotto registrato",
  produttore: "Fabbricante",
  impiego: "Sigillatura giunti",
  materiale_id: "m1",
  materiale_impronta: "m-hash",
  materiale_snapshot: frame().materiali[0],
  materiale_corrente: frame().materiali[0],
  materiale_cambiato: false,
  evidenza_id: "e1",
  evidenza_impronta: "e-hash",
  evidenza_snapshot: frame().documenti[0],
  documento_corrente: frame().documenti[0],
  documento_cambiato: false,
  documento_pertinente: true,
  pertinente: true,
  corrispondenza_confermata: true,
  sds_necessaria: "si",
  al: null,
});
const props = {
  companyId: "azienda",
  orderId: "ordine",
  dataRiferimento: "2026-10-27",
  faseRiferimento: "fase",
  fasi: [
    {
      id: "fase",
      company_id: "azienda",
      order_id: "ordine",
      name: "Posa",
      start_date: null,
      end_date: null,
    },
  ],
};
beforeEach(() => {
  s.allowed = true;
  s.readonly = false;
  s.error = false;
  s.loading = false;
  s.q = frame();
  s.save.mockReset().mockResolvedValue({});
  s.read.mockReset();
  s.open.mockReset().mockResolvedValue(undefined);
  s.hook.mockClear();
});
afterEach(cleanup);
const mostra = () => {
  const r = render(<ProdottiSdsCommessa {...props} />);
  fireEvent.click(
    screen.getByRole("button", { name: /Prodotti e schede di sicurezza/ }),
  );
  return r;
};
const cambia = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
describe("Prodotti della commessa e schede SDS", () => {
  it("legge su apertura, mantiene distinta assenza ed errore e disabilita con fase indisponibile", () => {
    s.error = true;
    const r = mostra();
    expect(s.hook).toHaveBeenLastCalledWith(
      {
        companyId: "azienda",
        orderId: "ordine",
        data: "2026-10-27",
        faseId: "fase",
      },
      true,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "non è possibile confermare",
    );
    s.error = false;
    r.rerender(<ProdottiSdsCommessa {...props} contestoNonDisponibile />);
    expect(s.hook.mock.calls.at(-1)?.[1]).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("fase non disponibile");
  });
  it("propone entrambi i materiali omonimi e non seleziona una SDS automaticamente", () => {
    mostra();
    expect(screen.getByText(/2 materiali ancora da esaminare/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registra prodotto" }));
    const options = within(
      screen.getByLabelText("Materiale di origine"),
    ).getAllByRole("option");
    expect(options.map((x) => x.getAttribute("value"))).toEqual([
      "",
      "m1",
      "m2",
    ]);
    cambia("Materiale di origine", "m1");
    expect(screen.getByLabelText("Nome commerciale del prodotto")).toHaveValue(
      "Sigillante omonimo",
    );
    expect(screen.getByLabelText("SDS dal fascicolo")).toHaveValue("");
    expect(
      within(screen.getByLabelText("SDS dal fascicolo"))
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["", "e1"]);
  });
  it("cambiare impresa o fase azzera file e conferma del prodotto", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Registra prodotto" }));
    cambia("SDS dal fascicolo", "e1");
    fireEvent.click(screen.getByLabelText(/Ho controllato che/));
    cambia("Impresa che impiega il prodotto", "sub");
    expect(screen.getByLabelText("SDS dal fascicolo")).toHaveValue("");
    expect(screen.getByLabelText(/Ho controllato che/)).not.toBeChecked();
    expect(
      within(screen.getByLabelText("SDS dal fascicolo"))
        .getAllByRole("option")
        .map((o) => o.getAttribute("value")),
    ).toEqual(["", "e2"]);
  });
  it("un conflitto conserva dati, versione e richiesta per un retry identico", async () => {
    s.q!.impieghi = [prodotto()];
    s.save.mockRejectedValue(
      new Error("Prodotto cambiato: rileggi la registrazione"),
    );
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Rettifica prodotto" }));
    cambia(
      "Motivo della registrazione o rettifica",
      "Controllo del prodotto reale",
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva impiego" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Prodotto cambiato"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva impiego" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledTimes(2));
    expect(s.save.mock.calls[1][0]).toEqual(s.save.mock.calls[0][0]);
    expect(s.save.mock.calls[0][0].versione).toBe(2);
    expect(
      screen.getByLabelText("Motivo della registrazione o rettifica"),
    ).toHaveValue("Controllo del prodotto reale");
  });
  it("rilegge file/materiali senza sovrascrivere la descrizione né confermare nuove fonti", async () => {
    s.q!.impieghi = [prodotto()];
    const nuova = frame();
    nuova.documenti[0].impronta = "nuovo-file";
    nuova.documenti[0].revisione = "2.0";
    nuova.materiali[0].impronta = "nuovo-materiale";
    s.read.mockResolvedValue(nuova);
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Rettifica prodotto" }));
    cambia("Nome commerciale del prodotto", "Descrizione da conservare");
    cambia("Motivo della registrazione o rettifica", "Riesame della fonte");
    fireEvent.click(
      screen.getByRole("button", { name: "Rileggi materiali e SDS" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Usa la versione SDS riletta" }),
      ).toBeTruthy(),
    );
    expect(screen.getByLabelText("Nome commerciale del prodotto")).toHaveValue(
      "Descrizione da conservare",
    );
    expect(screen.getByLabelText(/Ho controllato che/)).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa la versione SDS riletta" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Conferma la fonte materiale riletta",
      }),
    );
    expect(screen.getByLabelText(/Ho controllato che/)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/Ho controllato che/));
    fireEvent.click(screen.getByRole("button", { name: "Salva impiego" }));
    await waitFor(() => expect(s.save).toHaveBeenCalledOnce());
    expect(s.save.mock.calls[0][0]).toMatchObject({
      versione: 2,
      dati: {
        nome: "Descrizione da conservare",
        materiale_impronta: "nuovo-materiale",
        evidenza_impronta: "nuovo-file",
        corrispondenza_confermata: true,
      },
    });
  });
  it("sola lettura mantiene storico e apertura autorizzata, un permesso revocato nasconde la cache", async () => {
    s.readonly = true;
    s.q!.impieghi = [prodotto()];
    const r = mostra();
    expect(
      screen.queryByRole("button", { name: "Registra prodotto" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Rettifica prodotto" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apri SDS corrente" }));
    await waitFor(() => expect(s.open).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Storico prodotto" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Storico del prodotto",
    );
    s.allowed = false;
    r.rerender(<ProdottiSdsCommessa {...props} />);
    expect(screen.queryByText("Prodotto registrato")).toBeNull();
    expect(s.save).not.toHaveBeenCalled();
  });
});
