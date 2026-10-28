import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import "@testing-library/jest-dom/vitest";

const state = vi.hoisted(() => ({
  canEdit: true,
  fail: false,
  from: vi.fn(),
  rpc: vi.fn(),
}));
const records = [
  {
    id: "released",
    direzione: "attiva",
    importo: 7500,
    stato: "svincolata",
    data_svincolo_effettiva: "2026-08-20",
    controparte: "Condominio",
    orders: { order_code: "ORD-1" },
  },
  {
    id: "open",
    direzione: "attiva",
    importo: 100,
    stato: "trattenuta",
    data_svincolo_prevista: "2026-01-01",
    controparte: "Cliente",
    orders: { order_code: "ORD-2" },
  },
  {
    id: "sub",
    direzione: "passiva",
    importo: 500,
    stato: "trattenuta",
    controparte: "Subappaltatore demo",
  },
];
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "ritenute-garanzia" ? records : [],
    isLoading: false,
    isError: state.fail,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "demo" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isAdmin: state.canEdit,
    solaLettura: !state.canEdit,
    isLoading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: state.from, rpc: state.rpc },
}));
vi.mock("@/components/fatturazione/FiscalWorkspace", () => ({
  FiscalLegacyRedirect: (): null => null,
  FiscalStandaloneWorkspace: (): null => null,
}));
vi.mock("@/components/fatturazione/FiscalReleaseDialog", () => ({
  FiscalReleaseDialog: (): null => null,
}));
import RitenuteGaranzia from "@/pages/azienda/RitenuteGaranzia";
import {
  FiscalSectionHeader,
  FiscalMetric,
} from "@/components/fatturazione/FiscalSectionLayout";

function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function setup() {
  return render(
    <MemoryRouter
      initialEntries={["/?tab=fiscalita&sezione=ritenute&anno=2026&mese=10"]}
    >
      <RitenuteGaranzia embedded />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.canEdit = true;
  state.fail = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

it("shares clear title and card styling rather than a navy hero", () => {
  render(
    <>
      <FiscalSectionHeader
        title="Titolo"
        description="Descrizione"
        actions={<button>Azione</button>}
      />
      <FiscalMetric
        label="Dato"
        value="0,00 €"
        description="Valore documentato"
      />
    </>,
  );
  expect(screen.getByRole("heading", { name: "Titolo", level: 2 })).toHaveClass(
    "text-lg",
    "font-semibold",
  );
  expect(screen.getByRole("group", { name: "Dato" })).toHaveClass(
    "rounded-xl",
    "bg-white",
    "p-4",
  );
  expect(screen.getByRole("button", { name: "Azione" })).toBeVisible();
});
it("aligns guarantee content with the other fiscal sections and preserves balances", () => {
  const { container } = setup();
  expect(container.querySelector(".container, .bg-eic-navy-deep")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Ritenute di garanzia", level: 2 }),
  ).toHaveClass("text-lg");
  expect(
    within(screen.getByRole("group", { name: "Trattenuto a te" })).getByText(
      /100,00/,
    ),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("group", { name: "Svincolato nel 2026" }),
    ).getByText(/7.500,00/),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("group", { name: "Trattenuto ai subappaltatori" }),
    ).getByText(/500,00/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Trattenute a te (2)" }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByText("Criteri di lettura e verifica"));
  expect(
    screen.getByText(/conteggio nei filtri comprende anche/),
  ).toBeVisible();
  expect(state.from).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("changes direction without losing the selected year or writing records", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Ai subappaltatori (1)" }),
  );
  expect(screen.getByTestId("url")).toHaveTextContent("anno=2026");
  expect(screen.getByTestId("url")).toHaveTextContent("direzione=passiva");
  expect(screen.getByText("Subappaltatore demo")).toBeVisible();
  expect(screen.queryByText("ORD-1")).toBeNull();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("retains read-only permissions", () => {
  state.canEdit = false;
  setup();
  expect(screen.getByRole("button", { name: "Nuova ritenuta" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Verifica svincolo" }),
  ).toBeNull();
});
it("drills into the annual release KPI and restores the complete list", () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Filtra: Svincolato nel 2026" }),
  );
  expect(screen.getByText("ORD-1")).toBeVisible();
  expect(screen.queryByText("ORD-2")).toBeNull();
  expect(screen.getByTestId("url")).toHaveTextContent(
    "stato_ritenute=svincolata_anno",
  );
  fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
  expect(screen.getByText("ORD-2")).toBeVisible();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Cerca nelle garanzie" }),
    { target: { value: "Condominio" } },
  );
  expect(screen.getByText("ORD-1")).toBeVisible();
  expect(screen.queryByText("ORD-2")).toBeNull();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("does not show financial cards on a query error", () => {
  state.fail = true;
  setup();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByRole("group", { name: "Trattenuto a te" })).toBeNull();
});
