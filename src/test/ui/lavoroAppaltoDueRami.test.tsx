import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeAll, expect, it, vi} from "vitest";
import CreateLavoroAppaltatore from "@/pages/azienda/CreateLavoroAppaltatore";

vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "c"}})}));
vi.mock("@/hooks/use-toast", () => ({useToast: () => ({toast: vi.fn()})}));
vi.mock("@/hooks/useAppaltatoreModule", () => ({useAppaltatoreModuleEnabled: () => true, APPALTATORE_MODULE_FLAG: "appaltatore_module"}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("@/lib/geo/geocodeBestEffort", () => ({geocodeBestEffort: vi.fn()}));
vi.mock("react-router-dom", async () => {
  const vero = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {...vero, useNavigate: () => vi.fn()};
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({invalidateQueries: vi.fn()}),
  useMutation: () => ({isPending: false, mutate: vi.fn()}),
  useQuery: ({queryKey}: {queryKey: unknown[]}) => {
    if (String(queryKey[0]) === "appaltatori-list") {
      return {data: [{id: "k", business_name: "Edil Rossi S.r.l.", fiscal_code: "IT1"}], isLoading: false};
    }
    return {data: [] as unknown[], isLoading: false};
  },
}));

beforeAll(() => {
  // Radix misura gli elementi: jsdom non lo sa fare.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterEach(cleanup);
const draw = () => render(<MemoryRouter><CreateLavoroAppaltatore /></MemoryRouter>);

it("si apre a corpo: importo certo e piano rate", () => {
  draw();
  expect(screen.getByText("Compenso e pagamenti")).toBeVisible();
  expect(screen.getByLabelText("Importo totale (€) — netto")).toBeVisible();
  expect(screen.getByText("Unica rata (saldo)")).toBeVisible();
  expect(screen.queryByLabelText("Tetto concordato (€)")).not.toBeInTheDocument();
});

it("a misura l'importo diventa una stima, compare il tetto e le rate spariscono", () => {
  draw();
  fireEvent.click(screen.getByRole("button", {name: /A misura/}));

  expect(screen.getByText("Stima e tetto")).toBeVisible();
  expect(screen.getByLabelText("Importo stimato (€)")).toBeVisible();
  expect(screen.getByLabelText("Tetto concordato (€)")).toBeVisible();
  // Nessun piano rate: una scadenza su un importo stimato è una previsione falsa.
  expect(screen.queryByText("Unica rata (saldo)")).not.toBeInTheDocument();
  expect(screen.getByText(/La scadenza arriva con la fattura del rendiconto/)).toBeVisible();
});

it("la scelta è dichiarata, non dedotta: entrambi i modi sono visibili da subito", () => {
  draw();
  expect(screen.getByRole("button", {name: /A corpo/})).toBeVisible();
  expect(screen.getByRole("button", {name: /A misura/})).toBeVisible();
  expect(screen.getByText("Come viene pagato questo lavoro")).toBeVisible();
});

it("senza committente scelto il salvataggio resta chiuso e dice cosa manca", () => {
  draw();
  expect(screen.getByText("Scegli il committente per continuare.")).toBeVisible();
});
