import {cleanup, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {OrderLaborCosts} from "@/components/orders/OrderLaborCosts";
const m = vi.hoisted(() => ({error: false, loading: false, costs: true}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "c"}, role: "company_admin"})}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({canViewCosts: m.costs, canEditOrders: true})}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({useCompanyStaffUsers: () => ({data: [] as unknown[]})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {}}));
vi.mock("@tanstack/react-query", () => ({useQuery: ({queryKey}: {queryKey: string[]}) => queryKey[0] === "subappaltatori-order" ? {data: [{id: "s", ragione_sociale: "Edil Alfa", importo_contrattuale: 1000, totale_sal_lordo: 300, durc_scadenza: "2020-01-01"}], isError: m.error, isLoading: m.loading, refetch: vi.fn()} : {data: [] as unknown[]}, useQueryClient: () => ({invalidateQueries: vi.fn()}), useMutation: () => ({isPending: false, mutate: vi.fn()})}));
beforeEach(() => {m.error = false; m.loading = false; m.costs = true;}); afterEach(cleanup);
const draw = () => render(<MemoryRouter><OrderLaborCosts orderId="o" parte="ditte" compact /></MemoryRouter>);
it("un DURC scaduto resta visibile anche con il dettaglio dei contratti chiuso", () => {
  draw(); expect(screen.getByText("1 DURC scaduto")).toBeVisible();
  expect(screen.getByText(/Subappalti · contratti e DURC/).closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Edil Alfa", {selector: "p"}).closest("details")).not.toHaveAttribute("open");
});
it("un errore non si presenta come zero subappalti o DURC regolari", () => {
  m.error = true; draw(); expect(screen.getByText(/Subappalti · contratti e DURC/)).toHaveTextContent("non verificabili");
});
it("la sola visibilità operativa non espone gli importi del contratto", () => {
  m.costs = false; draw(); expect(screen.queryByText(/300,00/)).not.toBeInTheDocument();
  expect(screen.getByText("1 DURC scaduto")).toBeVisible();
});
