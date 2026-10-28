import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RigaCantiere, OggiOverview } from "@/lib/orders/cantieriOggi";
import {
  oggiRow as row,
  oggiOrder as order,
  oggiPhase as phase,
} from "@/test/fixtures/cantieriOggi";
import { setupRadixMenus } from "@/test/helpers/radixMenus";
setupRadixMenus();
const state = vi.hoisted(() => ({
  company: "c1",
  canApprove: true,
  rows: [] as RigaCantiere[],
  overview: { orders: [], phases: [], tasks: [] } as OggiOverview,
  loading: false,
  error: false,
  overviewError: false,
  refresh: vi.fn(),
  reportProps: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: state.company } }),
}));
vi.mock("@/components/campo/DaApprovareCantieri", () => ({
  usePuoApprovareCantiere: () => state.canApprove,
}));
vi.mock("@/hooks/useCantieriOggi", () => ({
  useCantieriOggi: () => ({
    cantieri: {
      data:
        state.loading || (state.error && !state.rows.length)
          ? undefined
          : state.rows,
      isPending: state.loading,
      isError: state.error,
      isFetching: false,
      dataUpdatedAt: new Date("2026-10-27T09:00:00Z").getTime(),
    },
    overview: {
      data: state.overview,
      isError: state.overviewError,
      isFetching: false,
    },
    now: new Date("2026-10-27T09:00:00Z"),
    day: "2026-10-27",
    ready: !state.loading && !state.error && !state.overviewError,
    refresh: state.refresh,
  }),
}));
vi.mock("@/components/orders/DaApprovareCommessa", () => ({
  DaApprovareCommessa: ({ orderId }: { orderId: string }) => (
    <div data-testid="approval-actions">Verifica {orderId}</div>
  ),
}));
vi.mock("@/components/orders/OrdineRapportiniCampo", () => ({
  OrdineRapportiniCampo: (props: {
    orderId: string;
    soloDaApprovare?: boolean;
  }) => {
    state.reportProps(props);
    return <div>Rapportini {props.orderId}</div>;
  },
}));
import CantieriOggi from "@/pages/azienda/CantieriOggi";
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
const mount = (url = "/azienda/ordini?tab=oggi") =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <CantieriOggi />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const table = () => within(screen.getByRole("table"));
beforeEach(() => {
  vi.clearAllMocks();
  state.company = "c1";
  state.canApprove = true;
  state.loading = false;
  state.error = false;
  state.overviewError = false;
  state.rows = [
    row({ previste: 2, timbrate: 1 }),
    row({ id: "o2", codice: "C-2", descrizione: "Posa serramenti", bolle: 3 }),
    row({ id: "o3", codice: "C-3", descrizione: "Cappotto esterno" }),
  ];
  state.overview = {
    orders: [order(), order({ id: "o2" }), order({ id: "o3" })],
    phases: [phase()],
    tasks: [],
  };
});
afterEach(cleanup);
describe("Cantieri oggi: operational workspace", () => {
  it("separates monitored and operational sites, and replaces ambiguous 0/0", () => {
    mount();
    expect(screen.getByText(/3 cantieri monitorati/)).toBeVisible();
    const kpis = within(screen.getByLabelText("Indicatori della giornata"));
    expect(
      kpis.getByRole("button", { name: /Operativi oggi/ }),
    ).toHaveTextContent("1");
    expect(table().getByText("Nessuna squadra prevista")).toBeVisible();
    expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
    expect(table().queryByText("Cappotto esterno")).toBeNull();
  });
  it("filters approvals by their own KPI and keeps the filter in the URL", () => {
    mount();
    fireEvent.click(
      within(screen.getByLabelText("Indicatori della giornata")).getByRole(
        "button",
        { name: /Da approvare/ },
      ),
    );
    expect(table().getByText("Posa serramenti")).toBeVisible();
    expect(table().queryByText("Rifacimento bagno")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "filtro_oggi=approvare",
    );
  });
  it("combines search and owner selections without changing the source", async () => {
    mount("/azienda/ordini?tab=oggi&filtro_oggi=tutti");
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca cantiere" }), {
      target: { value: "bagno" },
    });
    expect(table().getByText("Rifacimento bagno")).toBeVisible();
    expect(table().queryByText("Posa serramenti")).toBeNull();
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Responsabile cantiere" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Senza responsabile" }),
    );
    expect(screen.getByText("Nessun cantiere per questi filtri")).toBeVisible();
    expect(state.rows).toHaveLength(3);
  });
  it("opens exact pending items in the side panel without changing page", async () => {
    mount();
    fireEvent.click(
      table().getByRole("button", {
        name: "Vedi 3 da approvare: Posa serramenti",
      }),
    );
    const panel = await screen.findByRole("dialog");
    expect(
      within(panel).getByRole("tab", { name: /Da approvare/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("approval-actions")).toHaveTextContent(
      "o2",
    );
    await waitFor(() =>
      expect(state.reportProps).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: "o2", soloDaApprovare: true }),
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "cantiere_oggi=o2",
    );
    expect(screen.getByRole("link", { name: /Apri commessa/ })).toHaveAttribute(
      "href",
      "/azienda/ordini/o2",
    );
  });
  it("opens the actual plan and office navigation inside a single detail panel", async () => {
    mount();
    fireEvent.click(
      table().getByRole("button", { name: "Apri giornata: Rifacimento bagno" }),
    );
    const panel = await screen.findByRole("dialog");
    fireEvent.click(within(panel).getByRole("tab", { name: "Lavorazioni" }));
    expect(within(panel).getByText("Posa pavimento")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: /Gestisci/ }),
    ).toHaveAttribute(
      "href",
      "/azienda/ordini/o1?tab=cantiere&vista_cantiere=lavorazioni",
    );
    fireEvent.click(within(panel).getByRole("tab", { name: "Ufficio" }));
    expect(
      within(panel).getByRole("link", { name: /Gestisci attività/ }),
    ).toHaveAttribute(
      "href",
      "/azienda/ordini/o1?tab=cantiere&vista_cantiere=ufficio",
    );
  });
  it("does not mount approval actions for a read-only user", async () => {
    state.canApprove = false;
    mount();
    fireEvent.click(
      table().getByRole("button", {
        name: "Vedi 3 da approvare: Posa serramenti",
      }),
    );
    expect(
      await screen.findByText(/Per approvare serve un utente autorizzato/),
    ).toBeVisible();
    expect(screen.queryByTestId("approval-actions")).toBeNull();
    expect(state.reportProps).not.toHaveBeenCalled();
  });
  it("shows unavailable counts rather than an empty healthy dashboard", () => {
    state.rows = [];
    state.error = true;
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nessun conteggio viene sostituito con zero",
    );
    expect(
      within(screen.getByLabelText("Indicatori della giornata")).getAllByText(
        "—",
      ),
    ).toHaveLength(4);
  });
  it("preserves source rows when only planning fails and explains incomplete data", () => {
    state.overviewError = true;
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pianificazione e attività d’ufficio non disponibili",
    );
    expect(table().getByText("Rifacimento bagno")).toBeVisible();
    expect(table().getAllByText("Dati incompleti")).toHaveLength(3);
  });
  it("paginates without discarding sites beyond the first page", () => {
    state.rows = Array.from({ length: 28 }, (_, i) =>
      row({
        id: `job-${i}`,
        codice: `N-${i}`,
        descrizione: `Job ${String(i).padStart(2, "0")}`,
      }),
    );
    state.overview.orders = state.rows.map((r) => order({ id: r.id }));
    mount("/azienda/ordini?tab=oggi&filtro_oggi=tutti");
    expect(table().getAllByRole("row")).toHaveLength(26);
    fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
    expect(table().getAllByRole("row")).toHaveLength(4);
    expect(table().getByText("Job 27")).toBeVisible();
  });
});
