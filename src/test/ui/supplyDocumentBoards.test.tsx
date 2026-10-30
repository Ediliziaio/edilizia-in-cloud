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
import SupplierRfqsList from "@/pages/azienda/SupplierRfqsList";
import DDTRicezioneList from "@/pages/azienda/DDTRicezioneList";
import type { SupplierRfq, ContatoriRichiesta } from "@/hooks/useSupplierRfqs";
import type { DDTRicezioneWithJoins, DDTStato } from "@/hooks/useDDTRicezione";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null as null, effectiveCompany: null as null }),
}));

vi.mock("@/hooks/usePipelineTransition", () => ({
  usePipelineTransition: () => ({
    request: vi.fn(),
    saving: false,
    dialog: null as React.ReactNode,
  }),
}));

const state = vi.hoisted(() => ({
  rfqs: [] as SupplierRfq[],
  counters: {} as Record<string, ContatoriRichiesta>,
  ddt: [] as DDTRicezioneWithJoins[],
  readonly: false,
  costs: true,
  error: false,
  create: vi.fn(),
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
vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: () => ({ orders: [{ id: "po1", status: "inviato" }] }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ddt/NewDDTDialog", () => ({
  NewDDTDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Nuovo DDT</div> : null,
}));
function Url() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}
function open(node: React.ReactNode, url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      {node}
      <Url />
    </MemoryRouter>,
  );
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  state.rfqs = [];
  state.counters = {};
  state.ddt = [];
  state.readonly = false;
  state.costs = true;
  state.error = false;
  state.create.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Richieste d’offerta", () => {
  it("apre sulle richieste operative e rende consultabili le concluse", () => {
    state.rfqs = [
      rfq("a"),
      rfq("b", "aggiudicata", { purchase_order_id: "po2" }),
    ];
    state.counters = { a: counter(), b: counter() };
    open(<SupplierRfqsList />, "/azienda/ordini?tab=offerte");
    expect(screen.getByText("Materiale a")).toBeInTheDocument();
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Elenco" }),
    );
    expect(screen.queryByText("Materiale b")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=active");
    fireEvent.click(
      screen.getByRole("button", { name: "Pipeline" }),
    );
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Ambito richieste d’offerta" }),
      ).getByRole("button", { name: /^Storico/ }),
    );
    expect(screen.queryByText("Materiale a")).not.toBeInTheDocument();
    expect(screen.getByText("Materiale b")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("rdo_ambito=history");
    fireEvent.click(
      screen.getByRole("button", { name: "Elenco" }),
    );
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
      "/azienda/ordini?tab=offerte&vista=elenco&periodo=30&rdo_ambito=all",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Colonna In attesa" }),
      ).getByText("Materiale a"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apri ordine d’acquisto" }),
    ).toHaveAttribute("href", "/azienda/ordini-acquisto/po2");
    fireEvent.change(
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
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Stato richieste d’offerta" }),
      ).getByRole("button", { name: /^Aggiudicata/ }),
    );
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
      "/azienda/ordini?tab=offerte&rdo_fornitore=s1&rdo_periodo=30&rdo_focus=scadute",
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
    fireEvent.change(
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
    open(<DDTRicezioneList />, "/azienda/ordini?tab=ddt");
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
    fireEvent.click(
      within(screen.getByRole("region", { name: "Riepilogo DDT" })).getByRole(
        "button",
        { name: /Non conformi \/ danni/i },
      ),
    );
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
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare");
    expect(screen.queryByText("Nessun DDT registrato")).not.toBeInTheDocument();
  });
});

describe("Colonne dell’elenco documenti", () => {
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
