import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import SopralluoghiList from "@/pages/azienda/sopralluoghi/SopralluoghiList";
import PurchaseOrdersList from "@/pages/azienda/PurchaseOrdersList";
import type { SopralluogoBacheca } from "@/lib/sopralluoghi/bacheca";
import type { PurchaseOrder } from "@/hooks/usePurchaseOrders";

vi.mock("@/hooks/usePipelineTransition", () => ({
  usePipelineTransition: () => ({
    request: vi.fn(),
    saving: false,
    dialog: null as React.ReactNode,
  }),
}));

const state = vi.hoisted(() => ({
  surveys: [] as SopralluogoBacheca[],
  orders: [] as PurchaseOrder[],
  perm: {
    solaLettura: false,
    isAdmin: false,
    canViewSettingsCustomization: true,
    canManagePurchasing: true,
    canEditOrders: false,
    canViewCosts: true,
  },
  create: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.perm }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "c1",
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "c1" } }),
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [] as const }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.surveys,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: () => ({
    orders: state.orders,
    isLoading: false,
    isError: false,
    create: { mutate: state.create },
  }),
}));
vi.mock("@/hooks/useOperationalSuppliers", () => ({
  useOperationalSuppliers: () => ({ suppliers: [] as const }),
}));
vi.mock("@/hooks/useSupplierRfqs", () => ({
  useSupplierRfqs: () => ({
    rfqs: [] as const,
    contatori: {},
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useAcquistiDaOrdinare", () => ({
  useAcquistiDaOrdinare: () => ({
    data: [] as const,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/acquisti/DaOrdinareMateriali", () => ({
  DaOrdinareMateriali: (): null => null,
}));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({
  WarehouseSelect: (): null => null,
}));
vi.mock("@/components/orders/CommessaCombobox", () => ({
  CommessaCombobox: (): null => null,
}));
vi.mock("@/components/sopralluoghi/PianificaSopralluogoDialog", () => ({
  PianificaSopralluogoDialog: ({
    sopralluogo,
  }: {
    sopralluogo: SopralluogoBacheca | null;
  }) =>
    sopralluogo ? <div role="dialog">Pianifica {sopralluogo.code}</div> : null,
}));

function Url() {
  const l = useLocation();
  return <output data-testid="url">{l.search}</output>;
}
function apri(element: React.ReactNode, url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      {element}
      <Url />
    </MemoryRouter>,
  );
}
function survey(
  id: string,
  extra: Partial<SopralluogoBacheca> = {},
): SopralluogoBacheca {
  return {
    id,
    code: `SOP-${id}`,
    status: "draft",
    scheduled_at: null,
    address: "Via Roma",
    city: "Lodi",
    contact_id: null,
    client_id: null,
    technician_id: null,
    estimate_id: null,
    order_id: null,
    created_at: "2026-10-01",
    cliente_nome: `Cliente ${id}`,
    ...extra,
  };
}
function oda(
  id: string,
  status: string,
  issue_date = "2026-10-01",
): PurchaseOrder {
  return {
    id,
    oda_number: `ODA-${id}`,
    status,
    issue_date,
    expected_delivery_date: null,
    order_id: "c1",
    supplier_id: "f1",
    total: 100,
    suppliers: { name: "Fornitore Alfa" },
    orders: { order_code: "C-001" },
    purchase_order_items: [],
    ddt_ricezione: [],
  } as unknown as PurchaseOrder;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 26, 12));
  state.perm.solaLettura = false;
  state.perm.canViewCosts = true;
  state.surveys = [
    survey("a", { cliente_nome: "Mario Rossi" }),
    survey("b", { status: "signed", cliente_nome: "Anna Verdi" }),
    survey("archiviato", { status: "archived" }),
  ];
  state.orders = [
    oda("bozza", "bozza"),
    oda("attivo", "inviato"),
    oda("vecchio", "inviato", "2026-07-01"),
    oda("ricevuto", "ricevuto"),
    oda("annullato", "annullato"),
  ];
  state.create.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("sopralluoghi: pipeline ed elenco coerenti", () => {
  it("usa le fasi reali ed esclude gli archiviati, senza ereditare la vista degli acquisti", () => {
    apri(<SopralluoghiList />, "/azienda/ordini?tab=sopralluoghi&vista=elenco");
    expect(screen.getByRole("button", { name: "Pipeline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Colonna Da pianificare" }),
      ).getByRole("link", { name: "SOP-a" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Colonna Firmato" })).getByRole(
        "link",
        { name: "SOP-b" },
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "SOP-archiviato" }),
    ).not.toBeInTheDocument();
  });
  it("mantiene ricerca e risultati quando cambia vista e conserva i parametri delle altre schede", () => {
    apri(<SopralluoghiList />, "/azienda/ordini?tab=sopralluoghi&commessa=c1");
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Cerca per cliente, telefono, indirizzo o codice",
      }),
      { target: { value: "Rossi" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    expect(screen.getByTestId("url")).toHaveTextContent("sop_cerca=Rossi");
    expect(screen.getByTestId("url")).toHaveTextContent("commessa=c1");
    expect(screen.getByTestId("url")).toHaveTextContent("sop_vista=elenco");
    expect(screen.getByRole("link", { name: "SOP-a" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "SOP-b" }),
    ).not.toBeInTheDocument();
  });
  it("consente di aprire la pianificazione, ma nasconde le azioni in sola lettura", () => {
    state.perm.solaLettura = true;
    apri(<SopralluoghiList />, "/azienda/ordini?tab=sopralluoghi");
    expect(
      screen.queryByRole("button", { name: "Pianifica" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Nuovo sopralluogo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SOP-a" })).toBeInTheDocument();
  });
});

describe("acquisti: gli stessi filtri nelle due viste", () => {
  it("mantiene riepiloghi, emissione e filtro di stato passando all'elenco", () => {
    apri(<PurchaseOrdersList />, "/azienda/ordini?tab=acquisto&commessa=c1");
    expect(
      screen.getByRole("combobox", { name: "Emissione OdA" }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Riepilogo acquisti" }),
      ).getByRole("button", { name: /Da mandare/i }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Stato degli OdA" })).getByRole(
        "button",
        { name: /Da mandare/ },
      ),
    );
    expect(
      screen.getByRole("link", { name: "Ordine ODA-bozza" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ordine ODA-attivo" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Vista" })).getByRole("button", {
        name: "Elenco",
      }),
    );
    expect(screen.getAllByText("ODA-bozza")[0]).toBeInTheDocument();
    expect(screen.queryByText("ODA-attivo")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("stato=bozze");
    expect(screen.getByTestId("url")).toHaveTextContent("commessa=c1");
  });
  it("applica l'emissione anche alla pipeline e mantiene le stesse righe nell'elenco", () => {
    apri(
      <PurchaseOrdersList />,
      "/azienda/ordini?tab=acquisto&periodo=30&stato=attivi",
    );
    expect(
      screen.getByRole("link", { name: "Ordine ODA-attivo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ordine ODA-vecchio" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Vista" })).getByRole("button", {
        name: "Elenco",
      }),
    );
    expect(screen.getAllByText("ODA-attivo")[0]).toBeInTheDocument();
    expect(screen.queryByText("ODA-vecchio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Azzera/ }));
    expect(screen.getByTestId("url")).not.toHaveTextContent("periodo=");
    expect(screen.getByTestId("url")).not.toHaveTextContent("stato=");
    expect(screen.getByTestId("url")).toHaveTextContent("vista=elenco");
  });
  it("offre un passaggio esplicito all'elenco degli annullati e non permette creazioni in sola lettura", () => {
    state.perm.solaLettura = true;
    apri(
      <PurchaseOrdersList />,
      "/azienda/ordini?tab=acquisto&stato=annullati",
    );
    expect(screen.getByRole("button", { name: /Nuovo OdA/ })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: /Apri elenco degli annullati/ }),
    );
    expect(screen.getAllByText("ODA-annullato")[0]).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("pagina gli ordini senza perdere filtri e riparte dalla prima pagina dopo una ricerca", () => {
    state.orders = Array.from({ length: 27 }, (_, i) =>
      oda(`pagina-${i}`, "bozza"),
    );
    apri(<PurchaseOrdersList />, "/azienda/ordini?tab=acquisto&vista=elenco");
    expect(screen.queryByText("ODA-pagina-26")).not.toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Pagine ordini di acquisto" }),
      ).getByRole("button", { name: "Successivi" }),
    );
    expect(screen.getAllByText("ODA-pagina-26")[0]).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("oda_pagina=2");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca negli acquisti" }),
      { target: { value: "pagina-26" } },
    );
    expect(screen.getByTestId("url")).not.toHaveTextContent("oda_pagina=");
    expect(screen.getAllByText("ODA-pagina-26")[0]).toBeInTheDocument();
  });

  it("non espone importi o esportazioni economiche senza il permesso sui costi", () => {
    state.perm.canViewCosts = false;
    apri(<PurchaseOrdersList />, "/azienda/ordini?tab=acquisto");
    expect(screen.getByRole("button", { name: "Esporta" })).toBeDisabled();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Vista" })).getByRole("button", {
        name: "Elenco",
      }),
    );
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Totale", hidden: true }),
    ).not.toBeInTheDocument();
  });
});

describe("Elenco tabellare", () => {
  it("mostra sopralluoghi in righe con dati e azioni in colonne distinte", () => {
    state.surveys = [survey("table")];
    apri(
      <SopralluoghiList />,
      "/azienda/ordini?tab=sopralluoghi&sop_vista=elenco",
    );
    const table = screen.getByRole("table", { name: "Elenco sopralluoghi" });
    for (const name of [
      "Codice",
      "Cliente",
      "Indirizzo",
      "Data e ora",
      "Tecnico",
      "Fase",
      "Telefono",
      "Azioni",
    ])
      expect(
        within(table).getByRole("columnheader", { name }),
      ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "SOP-table" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "Pianifica" }),
    ).toBeInTheDocument();
  });
  it("mantiene anche gli acquisti in una sola tabella con le colonne operative", () => {
    state.orders = [oda("table", "bozza")];
    apri(<PurchaseOrdersList />, "/azienda/ordini?tab=acquisto&vista=elenco");
    const table = screen.getByRole("table", {
      name: "Elenco ordini d’acquisto",
    });
    expect(
      within(table).getByRole("columnheader", { name: "Fornitore" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("ODA-table")).toBeInTheDocument();
  });
});
