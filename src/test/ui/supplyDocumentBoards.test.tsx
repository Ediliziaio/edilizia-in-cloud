import { changeFormControl } from "@/test/helpers/changeFormControl";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SupplierRfqsList from "@/pages/azienda/SupplierRfqsList";
import DDTRicezioneList from "@/pages/azienda/DDTRicezioneList";
import { documentiDb, type DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";
import type { SupplierRfq, ContatoriRichiesta } from "@/hooks/useSupplierRfqs";
import type { DDTRicezioneWithJoins, DDTStato } from "@/hooks/useDDTRicezione";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: state.company ? { id: "utente" } : null, effectiveCompany: state.company ? { id: state.company } : null }),
}));

vi.mock("@/hooks/usePipelineTransition", () => ({
  usePipelineTransition: () => ({
    request: state.transition,
    saving: false,
    dialog: null as React.ReactNode,
  }),
}));

const state = vi.hoisted(() => ({
  company: "",
  jobs: [] as DocumentoPersistente[],
  transition: vi.fn(),
  rfqs: [] as SupplierRfq[],
  counters: {} as Record<string, ContatoriRichiesta>,
  ddt: [] as DDTRicezioneWithJoins[],
  readonly: false,
  costs: true,
  error: false,
  create: vi.fn(),
  csv: vi.fn(),
  xlsx: vi.fn(),
}));
vi.mock("@/lib/csvExport", () => ({
  exportToCSV: state.csv,
  exportToXLSX: state.xlsx,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: state.readonly,
    canManagePurchasing: true,
    canEditWarehouse: true,
    canViewCosts: state.costs,
  }),
}));
vi.mock("@/hooks/useSupplierRfqs", () => ({
  useSupplierRfqs: () => ({
    rfqs: state.rfqs,
    contatori: state.counters,
    isLoading: false,
    isError: state.error,
    create: { mutate: state.create, isPending: false },
  }),
}));
vi.mock("@/hooks/useOperationalSuppliers", () => ({
  useOperationalSuppliers: () => ({
    suppliers: [
      { id: "s1", name: "Alfa" },
      { id: "s2", name: "Beta" },
    ],
  }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRicezioneList: () => ({
    data: state.ddt,
    isLoading: false,
    isError: state.error,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDocumentiDDT", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/useDocumentiDDT")
  >("@/hooks/useDocumentiDDT");
  return {
    ...actual,
    useDocumentiDDT: (...args: Parameters<typeof actual.useDocumentiDDT>) => ({
      data: args[5] ? state.jobs.filter(j => j.whatsapp_invio_id === args[5]) : state.jobs,
      isLoading: false,
      isError: false,
      hasNextPage: false,
      refetch: vi.fn(),
    }),
  };
});
vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: () => ({ orders: [{ id: "po1", status: "inviato" }] }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ddt/NewDDTDialog", () => ({
  NewDDTDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Nuovo DDT</div> : null,
}));
vi.mock("@/components/ddt/DocumentiInIngresso", async (orig) => ({
  ...(await orig<typeof import("@/components/ddt/DocumentiInIngresso")>()),
  RevisioneDocumento: ({ documento, incorporata }: { documento: DocumentoPersistente; incorporata: boolean }) =>
    incorporata && <section aria-label="Verifica la bolla">{documento.files[0]?.name}</section>,
}));
function Url() {
  const location = useLocation();
  return <><output data-testid="url">{location.search}</output><output data-testid="pathname">{location.pathname}</output></>;
}
const clients: QueryClient[] = [];
function open(node: React.ReactNode, url: string, advanced = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        {node}
        <Url />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (advanced) fireEvent.click(screen.getByRole("button", {name:"Filtri avanzati"}));
}
function rfq(
  id: string,
  status = "inviata",
  extra: Partial<SupplierRfq> = {},
): SupplierRfq {
  return {
    id,
    company_id: "co",
    rfq_number: `RDO-${id}`,
    titolo: `Materiale ${id}`,
    descrizione: null,
    order_id: "c1",
    data_fabbisogno: "2026-11-01",
    scadenza_offerte: "2026-10-20",
    status,
    supplier_id_aggiudicato: null,
    purchase_order_id: null,
    aggiudicata_at: null,
    motivazione_scelta: null,
    note: null,
    created_at: "2026-10-01",
    orders: { order_code: "C-001" },
    ...extra,
  };
}
function ddt(
  id: string,
  stato: DDTStato,
  extra: Partial<DDTRicezioneWithJoins> = {},
): DDTRicezioneWithJoins {
  return {
    id,
    company_id: "co",
    purchase_order_id: "po1",
    order_id: "c1",
    supplier_id: "s1",
    destinazione: "magazzino",
    warehouse_id: "w1",
    numero_ddt: `DDT-${id}`,
    data_ricezione: "2026-10-01",
    quantita_ricevuta: 10,
    stato,
    note: null,
    created_at: "2026-10-01",
    created_by: null,
    purchase_orders: {
      id: "po1",
      oda_number: "ODA-001",
      supplier_id: "s1",
      status: "ricevuto",
      order_id: "c1",
      suppliers: { name: "Alfa" },
      orders: { id: "c1", order_code: "C-001" },
    },
    ...extra,
  };
}
function counter(extra: Partial<ContatoriRichiesta> = {}): ContatoriRichiesta {
  return {
    invitati: 3,
    risposte: 1,
    inAttesa: 2,
    attesaDal: "2026-10-10",
    migliore: 100,
    fornitori: ["s1"],
    ...extra,
  };
}
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  state.rfqs = [];
  state.counters = {};
  state.ddt = [];
  state.readonly = false;
  state.costs = true;
  state.error = false;
  state.jobs = [];
  state.company = "";
  state.transition.mockClear();
  state.create.mockClear();
  state.csv.mockClear();
  state.xlsx.mockClear();
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.useRealTimers();
});
describe("Richieste d’offerta", () => {
  it("apre sulle richieste operative e rende consultabili le concluse", () => {
    state.rfqs = [
      rfq("a"),
      rfq("b", "aggiudicata", { purchase_order_id: "po2" }),
    ];
    state.counters = { a: counter(), b: counter() };
    open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte&rdo_vista=pipeline");
    expect(screen.getByText("Materiale a")).toBeInTheDocument();
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=active");
    fireEvent.click(screen.getByRole("button", { name: "Pipeline" }));
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Ambito richieste d’offerta" }),
      ).getByRole("button", { name: /^Storico/ }),
    );
    expect(screen.queryByText("Materiale a")).not.toBeInTheDocument();
    expect(screen.getByText("Materiale b")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=history");
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(
      screen.getByRole("table", { name: "Elenco richieste d’offerta" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=history");
  });
  it("separa le fasi reali e mantiene ricerca e filtri tra le viste", () => {
    state.rfqs = [
      rfq("a"),
      rfq("b", "aggiudicata", { purchase_order_id: "po2" }),
      rfq("c", "annullata"),
    ];
    state.counters = { a: counter(), b: counter(), c: counter() };
    open(
      <SupplierRfqsList />,
      "/azienda/ordini?tab=offerte&vista=elenco&periodo=30&rdo_ambito=all&rdo_vista=pipeline",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Colonna In attesa" }),
      ).getByText("Materiale a"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apri ordine d’acquisto" }),
    ).toHaveAttribute("href", "/azienda/ordini-acquisto/po2");
    changeFormControl(
      screen.getByRole("textbox", { name: "Cerca richieste d’offerta" }),
      { target: { value: "Materiale a" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.getAllByText("Materiale a").length).toBeGreaterThan(0);
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent(
      "rdo_cerca=Materiale+a",
    );
    expect(screen.getByTestId("url")).toHaveTextContent("periodo=30");
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_vista=elenco");
  });
  it("i riepiloghi filtrano richieste aperte con risposte, senza includere quelle aggiudicate", () => {
    state.rfqs = [rfq("a"), rfq("b", "bozza"), rfq("c", "aggiudicata")];
    state.counters = { a: counter(), c: counter() };
    open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte");
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Riepilogo richieste d’offerta" }),
      ).getByRole("button", { name: /Da valutare/i }),
    );
    expect(screen.getByText("Materiale a")).toBeInTheDocument();
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    expect(screen.queryByText("Materiale c")).not.toBeInTheDocument();
    changeFormControl(screen.getByRole("combobox", { name: "Stato richieste d’offerta" }), { target: { value: "aggiudicata" } });
    expect(screen.getByText("Materiale c")).toBeInTheDocument();
    expect(screen.getByTestId("url")).not.toHaveTextContent("rdo_focus");
  });
  it("filtra per fornitore invitato e distingue la scadenza risposta dalla data creazione", () => {
    state.rfqs = [
      rfq("a"),
      rfq("b", "aggiudicata"),
      rfq("c", "bozza", { created_at: "2026-01-01" }),
    ];
    state.counters = { a: counter(), b: counter({ fornitori: ["s2"] }) };
    open(
      <SupplierRfqsList />,
      "/azienda/ordini?tab=offerte&rdo_fornitore=s1&rdo_periodo=30&rdo_focus=scadute&rdo_vista=pipeline",
    );
    expect(screen.getByText("Materiale a")).toBeInTheDocument();
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    expect(screen.queryByText("Materiale c")).not.toBeInTheDocument();
    expect(
      screen.getByText("Termine di risposta superato"),
    ).toBeInTheDocument();
  });
  it("pagina l’elenco, resetta la pagina con una ricerca e rispetta la sola lettura e i costi", () => {
    state.rfqs = Array.from({ length: 27 }, (_, i) =>
      rfq(String(i).padStart(2, "0")),
    );
    state.readonly = true;
    state.costs = false;
    state.counters = { "00": counter() };
    open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte&rdo_vista=elenco");
    expect(
      screen.getByRole("button", { name: "Nuova richiesta" }),
    ).toBeDisabled();
    expect(screen.queryByText("Migliore offerta")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_pagina=2");
    changeFormControl(
      screen.getByRole("textbox", { name: "Cerca richieste d’offerta" }),
      { target: { value: "Materiale 00" } },
    );
    expect(screen.getByTestId("url")).not.toHaveTextContent("rdo_pagina");
    expect(screen.getAllByText("Materiale 00").length).toBeGreaterThan(0);
  });
});
describe("DDT", () => {
  it("normalizza lo stato attesa e raccoglie i danni una sola volta tra le non conformità", () => {
    state.ddt = [
      ddt("a", "attesa"),
      ddt("b", "ricevuto"),
      ddt("c", "verificato", { has_damages: true }),
      ddt("d", "non_conforme"),
    ];
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt&ddt_vista=pipeline");
    expect(
      within(screen.getByRole("region", { name: "Colonna Attesi" })).getByText(
        "DDT-a",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Colonna Non conformi / danni" }),
      ).getByText("DDT-c"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Stato DDT" })); fireEvent.click(screen.getByRole("option", {name:"Non conformi"}));
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.getAllByText("DDT-c").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DDT-d").length).toBeGreaterThan(0);
    expect(screen.queryByText("DDT-b")).not.toBeInTheDocument();
  });
  it("mantiene i filtri nelle due viste e azzera ricerca, stato e pagina", () => {
    state.ddt = [
      ddt("a", "ricevuto"),
      ddt("b", "verificato", { data_ricezione: "2026-01-01" }),
    ];
    open(
      <DDTRicezioneList />,
      "/azienda/ordini?tab=ddt&stato=bozze&ddt_periodo=30&ddt_focus=verifica&ddt_cerca=DDT-a&rdo_cerca=ferro",
    );
    expect(screen.getByRole("link", { name: /DDT-a/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.getAllByText("DDT-a").length).toBeGreaterThan(0);
    expect(screen.queryByText("DDT-b")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Azzera/ }));
    expect(screen.getAllByText("DDT-b").length).toBeGreaterThan(0);
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_cerca=ferro");
    expect(screen.getByTestId("url")).not.toHaveTextContent("ddt_periodo");
  });
  it("pagina e consente la consultazione in sola lettura senza creare DDT", () => {
    state.ddt = Array.from({ length: 26 }, (_, i) =>
      ddt(String(i), "ricevuto"),
    );
    state.readonly = true;
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt&ddt_vista=elenco");
    expect(screen.getByRole("button", { name: /Nuovo DDT/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(screen.getByTestId("url")).toHaveTextContent("ddt_pagina=2");
  });
  it("segnala l’errore di caricamento senza presentare una lista vuota", () => {
    state.error = true;
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt");
    expect(screen.getAllByRole("alert").some(alert => alert.textContent?.includes("Impossibile caricare"))).toBe(true);
    expect(screen.queryByText("Nessun DDT registrato")).not.toBeInTheDocument();
  });
});

describe("Colonne dell’elenco documenti", () => {
  it("l'elenco e il CSV mantengono quote, unità e destinazioni delle consegne miste", async () => {
    state.ddt = [
      ddt("misto", "ricevuto", {
        ricezione_esplicita: true,
        quantita_ricevuta: 308,
        warehouse_id: null,
        destinazione: "cantiere",
        consegne: [
          {
            tipo: "ingresso",
            destinazione: "cantiere",
            quantita: 2.5,
            unita_misura: "mq",
          },
          {
            tipo: "ingresso",
            destinazione: "magazzino",
            quantita: 3.25,
            unita_misura: "mq",
            warehouses: { name: "Principale" },
          },
        ],
      }),
    ];
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt&ddt_vista=elenco");
    expect(
      screen.getByRole("cell", {
        name: "Cantiere: 2,5 mq · Magazzino: 3,25 mq",
      }),
    ).toBeInTheDocument();
    // L'esportazione sta nel menu «⋯» della testata comune (25/11/2026).
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /CSV/ }));
    expect(state.csv).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          numero_ddt: "DDT-misto",
          quantita: "Cantiere: 2,5 mq · Magazzino: 3,25 mq",
          destinazione: "Cantiere e magazzino",
          magazzino: "Principale",
        }),
      ],
      expect.any(Array),
      expect.any(String),
    );
  });
  it("separa numero e oggetto della richiesta d’offerta", () => {
    state.rfqs = [rfq("table")];
    open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte&rdo_vista=elenco");
    const table = screen.getByRole("table", {
      name: "Elenco richieste d’offerta",
    });
    expect(
      within(table).getByRole("columnheader", { name: "N° richiesta" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Oggetto" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "Materiale table" }),
    ).toBeInTheDocument();
  });
  it("separa fornitore, OdA e commessa del DDT e conserva i link", () => {
    state.ddt = [ddt("table", "ricevuto")];
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt&ddt_vista=elenco");
    const table = screen.getByRole("table", { name: "Elenco DDT" });
    for (const name of ["Fornitore", "OdA", "Commessa", "Magazzino", "Azioni"])
      expect(
        within(table).getByRole("columnheader", { name }),
      ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "ODA-001" }),
    ).toHaveAttribute("href", "/azienda/ordini-acquisto/po1");
    expect(within(table).getByRole("link", { name: "C-001" })).toHaveAttribute(
      "href",
      "/azienda/ordini/c1",
    );
  });
});

describe("Elenco DDT operativo", () => {
  it("dal PDF diviso apre le singole bolle", () => {
    const id = "10000000-0000-4000-8000-000000000011";
    const figli = ["10000000-0000-4000-8000-000000000012", "10000000-0000-4000-8000-000000000013"];
    state.jobs = [{
      id, company_id: "co", created_by: "u", order_id: null, source: "whatsapp", status: "split",
      split_ids: figli, files: [{ name: "Bolle.pdf", mime: "application/pdf", path: "co/u/bolle", size: 100 }],
      result: null, created_at: "2026-11-21T12:00:00Z", updated_at: "2026-11-21T12:00:00Z", last_error: null, ddt_id: null,
    }];
    open(<DDTRicezioneList />, `/azienda/ordini?tab=ddt&ddt_documento=${id}`, false);
    expect(screen.getByRole("link", { name: "Apri bolla 2" })).toHaveAttribute("href", `/azienda/ordini?tab=ddt&ddt_documento=${figli[1]}`);
  });

  it.each(["review", "registered"] as const)("apre la bolla esatta dall’attività AI con stato %s", (status) => {
    const id = "10000000-0000-4000-8000-000000000011";
    const bolla: DocumentoPersistente = {
      id, company_id: "co", created_by: "u", order_id: null, source: "whatsapp",
      status, files: [], result: null, created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z",
      last_error: null, ddt_id: status === "registered" ? "ddt-registrato" : null,
    };
    state.jobs = [
      { ...bolla, files: [{ name: "Bolla originale.pdf", mime: "application/pdf", path: "co/u/bolla", size: 100 }] },
      { ...bolla, id: "10000000-0000-4000-8000-000000000012", files: [{ name: "Altra bolla.pdf", mime: "application/pdf", path: "co/u/altra", size: 100 }] },
    ];
    open(<DDTRicezioneList />, `/azienda/ordini?tab=ddt&ddt_documento=${id}`, false);
    if (status === "review") {
      const verifica = screen.getByRole("region", { name: "Verifica la bolla" });
      expect(within(verifica).getByText("Bolla originale.pdf")).toBeInTheDocument();
      expect(within(verifica).queryByText("Altra bolla.pdf")).not.toBeInTheDocument();
      expect(screen.getByText("Da verificare")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } else expect(screen.getByTestId("pathname")).toHaveTextContent("/azienda/ddt/ddt-registrato");
  });

  it("parte dall’elenco, mostra la selezione e lo Stato dopo il numero e apre le azioni dalla riga", async () => {
    state.ddt = [ddt("stato", "ricevuto")];
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt");
    const table = screen.getByRole("table", { name: "Elenco DDT" });
    expect(within(table).getAllByRole("columnheader")[2]).toHaveAccessibleName(
      "Stato",
    );
    expect(
      screen.getByRole("region", { name: "Riepilogo DDT" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("button", { name: /^Gestisci stato DDT DDT-stato:/ }),
      { key: "Enter", code: "Enter" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Verificati" }),
    );
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ id: "stato", status: "ricevuto" }),
      "verificato",
    );
  });
  it("mostra i documenti da registrare nella stessa tabella senza ripetere i già registrati", () => {
    const base = {
      company_id: "co",
      created_by: "u",
      order_id: null as string | null,
      source: "whatsapp" as const,
      files: [
        {
          name: "Nuova-bolla.pdf",
          mime: "application/pdf",
          path: "co/u/originale",
        },
      ],
      result: null as Record<string, unknown> | null,
      created_at: "2026-11-10T12:00:00Z",
      updated_at: "2026-11-10T12:00:00Z",
    };
    state.jobs = [
      { ...base, id: "in-arrivo", status: "review" },
      {
        ...base,
        id: "gia-registrato",
        status: "registered",
        ddt_id: "gia",
        files: [{ ...base.files[0], name: "File-gia-registrato.pdf" }],
      },
    ] as DocumentoPersistente[];
    state.ddt = [ddt("gia", "ricevuto")];
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt");
    const table = screen.getByRole("table", { name: "Elenco DDT" });
    const inArrivo = within(table).getByRole("row", { name: /Nuova-bolla.pdf/ });
    expect(within(inArrivo).getByRole("link", { name: "Nuova-bolla.pdf" })).toHaveAttribute("href", expect.stringContaining("ddt_documento="));
    expect(
      within(inArrivo).getByText("Da verificare"),
    ).toBeInTheDocument();
    expect(
      within(inArrivo).getByRole("button", { name: "Controlla e registra" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("File-gia-registrato.pdf"),
    ).not.toBeInTheDocument();
    const inIngresso = screen.getByRole("button", { name: "Documenti in ingresso (1)" });
    fireEvent.click(inIngresso);
    expect(inIngresso).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Nuova-bolla.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "DDT-gia" }),
    ).not.toBeInTheDocument();
    fireEvent.click(inIngresso);
    expect(screen.getByRole("link", { name: "DDT-gia" })).toBeInTheDocument();
  });

  it("riepiloga l’invio WhatsApp, mostra i duplicati e apre solo i documenti del gruppo", async () => {
    const invio = "10000000-0000-4000-8000-000000000001";
    const altroId = "20000000-0000-4000-8000-000000000001";
    const base: DocumentoPersistente = {
      id: "foto-1", company_id: "co", created_by: "utente", order_id: null, source: "whatsapp", status: "review",
      last_error: null, ddt_id: null, result: null, created_at: "2026-10-26T10:00:00Z",
      files: [{ name: "Bolla da WhatsApp.jpg", path: "co/utente/bolla.jpg", mime: "image/jpeg", size: 123 }],
      whatsapp_invio_id: invio,
    };
    state.company = "co";
    state.jobs = [base, { ...base, id: "foto-2", whatsapp_invio_id: null, files: [{ ...base.files[0], name: "Bolla di un altro invio.jpg" }] }];
    const rpc = vi.spyOn(documentiDb, "rpc").mockImplementation(async nome => ({
      error: null,
      data: nome === "ddt_ingresso_invii" ? [{ id: invio, ricevuti: 20, duplicati_identici: 1,
        in_lettura: 7, da_controllare: 12, da_rimandare: 1, da_riprovare: 0, registrate: 0, created_at: base.created_at }]
        : [{ documento_id: base.id, altro_id: altroId, registrato: true }],
    }));
    try {
      open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt&ddt_stato=da_registrare", false);
      const recap = await screen.findByRole("region", { name: "Invii WhatsApp" });
      expect(recap).toHaveTextContent("20 file ricevuti");
      expect(recap).toHaveTextContent("7 da leggere · 12 da controllare · 1 già in archivio");
      expect(recap).toHaveTextContent("1 da rimandare");
      // Sulla riga dell'elenco è l'etichetta «Possibile duplicato», che apre il confronto (25/11/2026).
      expect(screen.getByRole("link", { name: /Possibile duplicato.*Confronta bolla/ })).toHaveAttribute("href", `/azienda/ddt/${altroId}`);
      fireEvent.click(within(recap).getByRole("button", { name: "Apri invio" }));
      expect(screen.getByTestId("url")).toHaveTextContent(`ddt_invio=${invio}`);
      expect(screen.getByText("Bolla da WhatsApp.jpg")).toBeInTheDocument();
      expect(screen.queryByText("Bolla di un altro invio.jpg")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tutti i documenti" }));
      expect(screen.getByText("Bolla di un altro invio.jpg")).toBeInTheDocument();
    } finally {
      rpc.mockRestore();
    }
  });
});

describe("Elenchi documenti con filtri raccolti", () => {
  it("apre le richieste in elenco e conserva la scelta esplicita della pipeline", () => {
    state.rfqs = [rfq("a")]; open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte", false);
    expect(screen.getByRole("table", { name: "Elenco richieste d’offerta" })).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Filtri avanzati"})).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Pipeline" }));
    expect(screen.getByRole("button", { name: "Pipeline" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_vista=pipeline");
  });
  it("mantiene i DDT in elenco con stato principale e barra superiore condivisa", () => {
    state.ddt = [ddt("a", "ricevuto")]; open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt", false);
    expect(screen.getByRole("table", { name: "Elenco DDT" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Scorri elenco ddt" })).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Filtri avanzati"})).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("combobox", { name: "Stato DDT" })); fireEvent.click(screen.getByRole("option", {name:"Non conformi"}));
    expect(screen.getByTestId("url")).toHaveTextContent("ddt_stato=non_conforme");
  });
});

it("permette di selezionare una richiesta dalla riga senza aprire il documento", () => {
  state.rfqs = [rfq("selezione")]; open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte", false);
  fireEvent.click(screen.getByLabelText("Seleziona RDO-selezione"));
  expect(screen.getByRole("region", { name: "Azioni documenti selezionati" })).toHaveTextContent("1 documento selezionato");
  expect(screen.getByRole("button", { name: "Elimina selezionati" })).toBeEnabled();
});
