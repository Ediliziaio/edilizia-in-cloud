import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IncarichiCantiere } from "@/components/sicurezza/IncarichiCantiere";
import { OperaiSubappaltatore } from "@/components/subappaltatori/OperaiSubappaltatore";
import { FascicoloDocumenti } from "@/components/sicurezza/FascicoloDocumenti";
import { ImpreseCommessa } from "@/components/sicurezza/ImpreseCommessa";
vi.mock("@/components/sicurezza/VerificaItpImpresa", () => ({
  VerificaItpImpresa: () : null => null,
}));
vi.mock("@/components/sicurezza/DpiEsterni", () => ({
  DpiEsterni: () : null => null,
}));
const state = vi.hoisted(() => ({
  readonly: false,
  allowed: true,
  error: false,
  fasi: [] as unknown[],
  salva: vi.fn(),
  upload: vi.fn(),
  toast: vi.fn(),
  workers: [] as unknown[],
  assignments: [] as unknown[],
  incarichi: [] as unknown[],
  evidenze: [] as unknown[],
  imprese: {
    imprese: [],
    operai: [],
    assegnazioni: [],
    evidenze: [],
  } as Record<string, unknown[]>,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewSicurezzaCantiere: state.allowed,
    solaLettura: state.readonly,
  }),
}));
const result = (data: unknown) => ({
  data,
  isLoading: false,
  isError: state.error,
  refetch: vi.fn(),
});
vi.mock("@/hooks/useFascicoloCantiere", () => ({
  useFasiFascicolo: () => result(state.fasi),
  useFigurePerIncarico: () => result([]),
  useIncarichiCantiere: () => result(state.incarichi),
  useOperaiEsterni: () => result(state.workers),
  useAssegnazioniEsterne: () => result(state.assignments),
  useCommesseFascicolo: () =>
    result([{ id: "c1", order_code: "ORD-001", description: "Prova" }]),
  useEvidenzeFascicolo: () => result(state.evidenze),
  useImpreseCommessa: () => result(state.imprese),
  useScriviFascicolo: () => ({ mutateAsync: state.salva, isPending: false }),
  apriFileFascicolo: vi.fn(),
  caricaFileFascicolo: state.upload,
}));
vi.mock("sonner", () => ({ toast: { error: state.toast, success: vi.fn() } }));
beforeEach(() => {
  state.readonly = false;
  state.allowed = true;
  state.error = false;
  state.fasi = [];
  state.salva.mockReset().mockResolvedValue({ id: "saved" });
  state.toast.mockReset();
  state.upload.mockReset().mockResolvedValue("az/saved/prova.pdf");
  state.workers = [];
  state.assignments = [];
  state.incarichi = [];
  state.evidenze = [];
  state.imprese = { imprese: [], operai: [], assegnazioni: [], evidenze: [] };
});
afterEach(cleanup);
const open = (node: React.ReactNode) =>
  render(<MemoryRouter>{node}</MemoryRouter>);
describe("Fascicolo integrato: comportamenti operativi", () => {
  it("sola lettura: non propone creazione o modifica", () => {
    state.readonly = true;
    open(
      <>
        <IncarichiCantiere companyId="az" orderId="c1" />
        <OperaiSubappaltatore companyId="az" subId="sub" />
        <FascicoloDocumenti companyId="az" subId="sub" />
      </>,
    );
    expect(
      screen.queryByRole("button", { name: "Assegna" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aggiungi operaio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aggiungi" }),
    ).not.toBeInTheDocument();
  });
  it("non mostra dati del fascicolo senza permesso sicurezza", () => {
    state.allowed = false;
    open(
      <>
        <IncarichiCantiere companyId="az" orderId="c1" />
        <OperaiSubappaltatore companyId="az" subId="sub" />
        <FascicoloDocumenti companyId="az" subId="sub" />
      </>,
    );
    expect(
      screen.queryByRole("heading", { name: "Figure e responsabilità" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/serve il permesso/)).toHaveLength(2);
  });
  it("un errore dati non diventa un elenco vuoto rassicurante", () => {
    state.error = true;
    open(<ImpreseCommessa companyId="az" orderId="c1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("non disponibili");
    expect(
      screen.queryByText(/Nessuna impresa collegata/),
    ).not.toBeInTheDocument();
  });
  it("richiede nominante e riferimento prima di documentare una nomina", async () => {
    open(<IncarichiCantiere companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    fireEvent.change(screen.getByLabelText("Nome e cognome"), {
      target: { value: "Tecnico Prova" },
    });
    fireEvent.change(screen.getByLabelText("Stato della nomina"), {
      target: { value: "documentato" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(state.salva).not.toHaveBeenCalled();
    expect(state.toast).toHaveBeenCalled();
  });
  it("salva la figura con la commessa corrente, senza inviare inviti", async () => {
    open(<IncarichiCantiere companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    fireEvent.change(screen.getByLabelText("Nome e cognome"), {
      target: { value: "Tecnico Prova" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: "c1",
          subappaltatore_id: null,
          nominativo: "Tecnico Prova",
          stato: "proposto",
        }),
      ),
    );
  });
  it("non salva un POS senza la commessa né ricevuto senza allegato", () => {
    open(<FascicoloDocumenti companyId="az" subId="sub" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "pos" },
    });
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "POS Prova" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(state.salva).not.toHaveBeenCalled();
    expect(state.toast).toHaveBeenCalledWith(
      expect.stringContaining("commessa"),
    );
    fireEvent.change(
      screen.getByLabelText("Commessa (necessaria per il POS)"),
      { target: { value: "c1" } },
    );
    fireEvent.change(screen.getByLabelText("Stato"), {
      target: { value: "ricevuto" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(state.salva).not.toHaveBeenCalled();
    expect(state.toast).toHaveBeenCalledWith(expect.stringContaining("Allega"));
  });
  it("riprende l’associazione dopo un errore metadati senza ricaricare il file o perdere il soggetto", async () => {
    state.salva
      .mockReset()
      .mockResolvedValueOnce({ id: "saved" })
      .mockRejectedValueOnce(new Error("Rete interrotta"))
      .mockResolvedValue({ id: "saved" });
    open(<FascicoloDocumenti companyId="az" subId="sub" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "DURC prova" },
    });
    const file = new File(["PDF sintetico"], "prova.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/File PDF o immagine/), {
      target: { files: [file] },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith("Rete interrotta"),
    );
    expect(state.upload).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(state.salva.mock.calls[2][0]).toMatchObject({
      id: "saved",
      file_path: "az/saved/prova.pdf",
      subappaltatore_id: "sub",
    });
  });

  it("modifica il periodo di una assegnazione esistente usando il suo ID", async () => {
    state.workers = [
      {
        id: "o1",
        nome: "Mario",
        cognome: "Prova",
        mansione: "Operaio",
        attivo: true,
      },
    ];
    state.assignments = [
      {
        id: "a1",
        operaio_id: "o1",
        order_id: "c1",
        dal: "2026-10-01",
        al: null,
        area: "Interni",
        attivita: "Posa",
      },
    ];
    open(<OperaiSubappaltatore companyId="az" subId="sub" />);
    state.fasi = [{ id: "fase-posa", name: "Posa", order_id: "c1" }];
    fireEvent.click(screen.getByRole("button", { name: "Modifica periodo" }));
    fireEvent.change(screen.getByLabelText("Fase di lavoro"), {
      target: { value: "fase-posa" },
    });
    fireEvent.change(screen.getByLabelText("Al"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "a1",
          fase_id: "fase-posa",
          operaio_id: "o1",
          order_id: "c1",
          al: "2026-10-31",
        }),
      ),
    );
  });
  it("nel cantiere esclude POS di altre commesse e documenti di addetti non assegnati", () => {
    state.imprese = {
      imprese: [{ id: "sub", ragione_sociale: "Impresa Prova" }],
      operai: [],
      assegnazioni: [],
      evidenze: [
        {
          id: "d1",
          subappaltatore_id: "sub",
          tipo: "pos",
          titolo: "POS altro cantiere",
          order_id: "c2",
          operaio_id: null,
          stato: "ricevuto",
        },
        {
          id: "d2",
          subappaltatore_id: "sub",
          tipo: "formazione",
          titolo: "Attestato non assegnato",
          order_id: null,
          operaio_id: "o1",
          stato: "ricevuto",
        },
        {
          id: "d3",
          subappaltatore_id: "sub",
          tipo: "durc",
          titolo: "DURC impresa",
          order_id: null,
          operaio_id: null,
          stato: "ricevuto",
        },
      ],
    };
    open(<ImpreseCommessa companyId="az" orderId="c1" />);
    expect(screen.getByText("DURC impresa")).toBeInTheDocument();
    expect(screen.queryByText("POS altro cantiere")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Attestato non assegnato"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/POS di questa impresa/)).toBeInTheDocument();
  });
});

describe("SDS aziendali nel fascicolo", () => {
  it("crea una SDS senza inventare commessa, impresa esterna o classificazione", async () => {
    open(<FascicoloDocumenti companyId="az" soloSdsAziendali />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi SDS" }));
    expect(screen.getByLabelText("Tipo")).toHaveValue("sds");
    expect(screen.getByLabelText("Tipo")).toBeDisabled();
    expect(screen.getByLabelText("Commessa")).toBeDisabled();
    expect(
      screen.queryByLabelText("Fase della commessa"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mese di competenza"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "SDS sigillante" },
    });
    fireEvent.change(screen.getByLabelText("Revisione"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Data rilascio"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nel fascicolo" }),
    );
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "sds",
          order_id: null,
          subappaltatore_id: null,
          operaio_id: null,
          fase_id: null,
          incarico_id: null,
          catalogo_id: null,
          revisione: "2",
          data_rilascio: "2026-10-01",
        }),
      ),
    );
  });
  it("in sola lettura la libreria non propone upload o modifica", () => {
    state.readonly = true;
    open(<FascicoloDocumenti companyId="az" soloSdsAziendali />);
    expect(
      screen.queryByRole("button", { name: "Aggiungi SDS" }),
    ).not.toBeInTheDocument();
  });
});

describe("Consultazione dal quadro documentale", () => {
  it("apre il solo record selezionato e permette di tornare all’elenco", () => {
    state.evidenze = [
      {
        id: "e1",
        company_id: "az",
        order_id: "c1",
        tipo: "psc",
        titolo: "PSC selezionato",
        stato: "ricevuto",
        file_path: "az/e1/file.pdf",
        origine_requisito: "da_verificare",
      },
      {
        id: "e2",
        company_id: "az",
        order_id: "c1",
        tipo: "durc",
        titolo: "DURC altro record",
        stato: "ricevuto",
        file_path: "az/e2/file.pdf",
        origine_requisito: "da_verificare",
      },
    ];
    const torna = vi.fn();
    const view = open(
      <FascicoloDocumenti
        companyId="az"
        orderId="c1"
        documentoSelezionato="e1"
        onDeseleziona={torna}
      />,
    );
    expect(screen.getByText("PSC selezionato")).toBeInTheDocument();
    expect(screen.queryByText("DURC altro record")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cerca nel fascicolo")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Torna a tutti i documenti" }),
    );
    expect(torna).toHaveBeenCalledOnce();
    view.rerender(
      <MemoryRouter>
        <FascicoloDocumenti companyId="az" orderId="c1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("DURC altro record")).toBeInTheDocument();
  });
  it("un identificativo non restituito dalla fonte non mostra record estranei", () => {
    state.evidenze = [
      {
        id: "e2",
        company_id: "az",
        order_id: "c1",
        tipo: "durc",
        titolo: "DURC altro record",
        stato: "ricevuto",
        file_path: "az/e2/file.pdf",
        origine_requisito: "da_verificare",
      },
    ];
    open(
      <FascicoloDocumenti
        companyId="az"
        orderId="c1"
        documentoSelezionato="non-accessibile"
      />,
    );
    expect(screen.queryByText("DURC altro record")).not.toBeInTheDocument();
    expect(state.salva).not.toHaveBeenCalled();
  });
});

describe("Titolarità dei documenti modificati dalla commessa", () => {
  it("mantiene impresa esterna e operaio quando si cambia il referente", async () => {
    state.evidenze = [
      {
        id: "e1",
        company_id: "az",
        order_id: "c1",
        subappaltatore_id: "sub-esterno",
        operaio_id: "o1",
        tipo: "formazione",
        titolo: "Attestato esterno",
        stato: "da_richiedere",
        origine_requisito: "da_verificare",
      },
    ];
    state.workers = [{ id: "o1", nome: "Mario", cognome: "Esterno" }];
    open(<FascicoloDocumenti companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Modifica / }));
    expect(screen.getByLabelText("Operaio (se personale)")).toHaveValue("o1");
    expect(screen.getByLabelText("Operaio (se personale)")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Referente della richiesta"), {
      target: { value: "Tecnico commessa" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nel fascicolo" }),
    );
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "e1",
          subappaltatore_id: "sub-esterno",
          operaio_id: "o1",
          order_id: "c1",
          referente: "Tecnico commessa",
        }),
      ),
    );
  });
  it("mantiene incarico dell’impresa esterna senza sostituirlo con uno interno", async () => {
    state.evidenze = [
      {
        id: "e1",
        company_id: "az",
        order_id: "c1",
        subappaltatore_id: "sub-esterno",
        incarico_id: "i1",
        tipo: "nomina",
        titolo: "Nomina esterna",
        stato: "da_richiedere",
        origine_requisito: "da_verificare",
      },
    ];
    state.incarichi = [
      {
        id: "i1",
        order_id: "c1",
        subappaltatore_id: "sub-esterno",
        nominativo: "Referente esterno",
        ruolo: "preposto",
      },
      {
        id: "i2",
        order_id: "c1",
        subappaltatore_id: null,
        nominativo: "Referente interno",
        ruolo: "preposto",
      },
    ];
    open(<FascicoloDocumenti companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: /^Modifica / }));
    expect(
      screen.getByLabelText("Incarico titolare del documento"),
    ).toHaveValue("i1");
    expect(
      screen.queryByRole("option", { name: /Referente interno/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nel fascicolo" }),
    );
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({
          subappaltatore_id: "sub-esterno",
          incarico_id: "i1",
        }),
      ),
    );
  });
  it("un record interno rimane interno anche se viene consultato da un pannello subappaltatore", async () => {
    state.evidenze = [
      {
        id: "e1",
        company_id: "az",
        order_id: "c1",
        subappaltatore_id: null,
        tipo: "psc",
        titolo: "PSC interno",
        stato: "da_richiedere",
        origine_requisito: "da_verificare",
      },
    ];
    open(<FascicoloDocumenti companyId="az" orderId="c1" subId="sub" />);
    fireEvent.click(screen.getByRole("button", { name: /^Modifica / }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salva nel fascicolo" }),
    );
    await waitFor(() =>
      expect(state.salva).toHaveBeenCalledWith(
        expect.objectContaining({ subappaltatore_id: null }),
      ),
    );
  });
});

it("crea dalla commessa una richiesta per l’impresa selezionata, azzerando operaio e incarico al cambio titolare", async () => {
  state.imprese.imprese = [
    { id: "sub-a", ragione_sociale: "Impresa A" },
    { id: "sub-b", ragione_sociale: "Impresa B" },
  ];
  state.workers = [{ id: "o1", nome: "Mario", cognome: "Esterno" }];
  open(<FascicoloDocumenti companyId="az" orderId="c1" />);
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
  fireEvent.change(screen.getByLabelText("Titolo"), {
    target: { value: "Attestato da richiedere" },
  });
  fireEvent.change(screen.getByLabelText("Titolare del documento"), {
    target: { value: "sub-a" },
  });
  fireEvent.change(screen.getByLabelText("Operaio (se personale)"), {
    target: { value: "o1" },
  });
  fireEvent.change(screen.getByLabelText("Titolare del documento"), {
    target: { value: "sub-b" },
  });
  expect(screen.getByLabelText("Operaio (se personale)")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Salva nel fascicolo" }));
  await waitFor(() =>
    expect(state.salva).toHaveBeenCalledWith(
      expect.objectContaining({
        subappaltatore_id: "sub-b",
        order_id: "c1",
        operaio_id: null,
        incarico_id: null,
        stato: "da_richiedere",
      }),
    ),
  );
});

it("non sposta un documento esistente attraverso il selettore del nuovo documento", () => {
  state.evidenze = [
    {
      id: "e1",
      company_id: "az",
      order_id: "c1",
      subappaltatore_id: "sub-a",
      titolo: "Documento esterno",
      tipo: "altro",
      stato: "da_richiedere",
      origine_requisito: "da_verificare",
    },
  ];
  open(<FascicoloDocumenti companyId="az" orderId="c1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Modifica Documento esterno" }),
  );
  expect(
    screen.queryByLabelText("Titolare del documento"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/il titolare originale viene mantenuto/),
  ).toBeInTheDocument();
});

describe("Chiusura sicura del modulo documento", () => {
  it("chiude senza conferma se non è stato cambiato alcun campo", () => {
    open(<FascicoloDocumenti companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("mantiene i dati tornando alla modifica e li abbandona solo con la scelta esplicita", () => {
    open(<FascicoloDocumenti companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "Documento in preparazione" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Le modifiche non ancora salvate andranno perse",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continua modifica" }));
    expect(screen.getByLabelText("Titolo")).toHaveValue(
      "Documento in preparazione",
    );
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Chiudi senza salvare" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.salva).not.toHaveBeenCalled();
  });
  it("un cambiamento riportato al valore iniziale non produce un falso avviso", () => {
    open(<FascicoloDocumenti companyId="az" orderId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "Temporaneo" },
    });
    fireEvent.change(screen.getByLabelText("Titolo"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
