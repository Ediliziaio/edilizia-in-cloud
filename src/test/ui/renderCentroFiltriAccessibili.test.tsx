import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ isScopriPlan: false }) }));
vi.mock("@/components/render/RenderCreditsWidget", () => ({ RenderCreditsWidget: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/render/renderHistory", () => ({ useRenderHistory: () => ({ items: [] as unknown[], total: 0, isLoading: queryState.isLoading, isError: !!queryState.error, error: queryState.error, refetch: vi.fn() }) }));
const queryState = vi.hoisted(() => ({ isLoading: false, error: null as Error | null }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[], ...queryState, refetch: vi.fn() }) }));
import RenderCategoryHub from "@/pages/azienda/RenderCategoryHub";
afterEach(cleanup);
beforeEach(() => { queryState.isLoading = false; queryState.error = null; });
function setup() {
  render(<MemoryRouter><RenderCategoryHub /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("button", { name: "Nuovo render" })[0]);
  return within(screen.getByRole("dialog", { name: "Che cosa vuoi trasformare?" }));
}
it("distingue ricerca vuota e ripristino completo conservando il focus", () => {
  const modules = setup();
  expect(modules.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/azienda/render/"))).toHaveLength(14);
  fireEvent.click(modules.getByRole("button", { name: "Aperture" }));
  expect(modules.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/azienda/render/"))).toHaveLength(4);
  expect(modules.getByRole("button", { name: "Aperture" })).toHaveAttribute("aria-pressed", "true");
  const search = modules.getByRole("textbox", { name: "Cerca modulo render" });
  fireEvent.change(search, { target: { value: "nessun-modulo-di-collaudo" } });
  expect(modules.getByRole("status")).toHaveTextContent("Nessun modulo trovato.");
  expect(modules.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/azienda/render/"))).toHaveLength(0);
  fireEvent.click(modules.getByRole("button", { name: "Mostra tutti i moduli" }));
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  expect(modules.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/azienda/render/"))).toHaveLength(14);
  expect(modules.getByRole("button", { name: "Tutte" })).toHaveAttribute("aria-pressed", "true");
});
it("presenta i moduli disponibili con lo stesso stato e mantiene i percorsi", () => {
  const modules = setup();
  expect(screen.getByRole("link", { name: "Planimetrie e progetti", hidden: true })).toHaveAttribute("href", "/azienda/planimetrie");
  for (const [name, slug] of [["Ristrutturazioni", "ristrutturazioni"], ["Pavimenti esterni", "pavimenti-esterni"], ["Giardini", "giardini"], ["Porte blindate", "porte-blindate"], ["Porte interne", "porte-interne"]]) {
    const link = modules.getByRole("link", { name });
    expect(link).not.toHaveTextContent("Motore");
    expect(link).toHaveAttribute("href", `/azienda/render/${slug}`);
    expect(link).toHaveAttribute("aria-disabled", "false");
  }
});

it.each(["caricamento", "errore", "vuoto"])("distingue i contatori non disponibili dallo zero reale: %s", (state) => {
  queryState.isLoading = state === "caricamento";
  queryState.error = state === "errore" ? new Error("Errore simulato") : null;
  render(<MemoryRouter><RenderCategoryHub /></MemoryRouter>);
  const states = within(screen.getByRole("group", { name: "Stato dei render" }));
  for (const name of ["Pronti", "In lavorazione", "Da completare", "Con errore", "Tutti"]) {
    expect(states.getByRole("button", { name: `${name} ${state === "vuoto" ? "0" : "—"}` })).toBeInTheDocument();
  }
  if (state === "errore") expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare i render");
});

import { RenderUnifiedGallery } from "@/components/render/RenderUnifiedGallery";
it.each(["caricamento", "errore", "vuoto"])("la galleria distingue disponibilità e zero: %s", (state) => {
  render(<MemoryRouter><RenderUnifiedGallery moduleName="Prova" badgeLabel="Prova" title="Galleria" description="Prova" backPath="/render" newPath="/nuovo" items={[]} isLoading={state === "caricamento"} error={state === "errore" ? new Error("Errore simulato") : undefined} emptyTitle="Vuoto" emptyDescription="Nessun render" /></MemoryRouter>);
  for (const name of ["Totali", "Visibili", "Collegati CRM", "Contatti"]) {
    expect(within(screen.getByRole("group", { name })).getByText(state === "vuoto" ? "0" : "—")).toBeInTheDocument();
  }
});
