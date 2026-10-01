import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { OrderWorkspaceNav } from "@/components/orders/OrderWorkspaceNav";
import { OrderDisclosure } from "@/components/orders/OrderDisclosure";
import { useOrderDetailNavigation } from "@/hooks/useOrderDetailNavigation";
import { ECONOMIA_VIEWS, MATERIALI_VIEWS } from "@/lib/orders/detailNavigation";
const device = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => device.mobile }));

function Harness() {
  const { activeTab, activeEconomiaView, activeMaterialiView, navigateTo } = useOrderDetailNavigation(true);
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output>{location.search}{location.hash}</output>
    <button onClick={() => navigate(-1)}>Indietro</button>
    {activeTab === "finanza" && <div id="economia-workspace">
      <OrderWorkspaceNav label="Viste economiche" views={ECONOMIA_VIEWS} value={activeEconomiaView} onChange={economiaView => navigateTo({ tab: "finanza", economiaView })} />
      {activeEconomiaView === "documenti" && <OrderDisclosure id="section-sal" title="SAL" description="Avanzamento"><p>Verbali SAL</p></OrderDisclosure>}
    </div>}
    {activeTab === "articoli" && <div id="materiali-workspace">
      <OrderWorkspaceNav label="Viste dei materiali" views={MATERIALI_VIEWS} value={activeMaterialiView} onChange={materialiView => navigateTo({ tab: "articoli", materialiView })} />
    </div>}
  </>;
}
const mount = (query: string) => render(<MemoryRouter initialEntries={[`/azienda/ordini/test${query}`]}><Harness /></MemoryRouter>);
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterEach(() => { cleanup(); device.mobile = false; });

describe("Viste materiali ed economia", () => {
  it("su mobile usa un solo selettore e mantiene URL e cronologia", () => {
    device.mobile = true;
    mount("?tab=finanza&vista_economia=margini");
    expect(screen.queryByRole("button", { name: "Margini e costi" })).not.toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "Viste economiche" });
    fireEvent.change(select, { target: { value: "pagamenti" } });
    expect(select).toHaveValue("pagamenti");
    expect(screen.getByRole("status")).toHaveTextContent("vista_economia=pagamenti");
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(select).toHaveValue("margini");
    expect(screen.queryByText(ECONOMIA_VIEWS[0].description)).not.toBeInTheDocument();
  });
  it("mantiene selezione, descrizione e cronologia economica", () => {
    mount("?tab=finanza");
    fireEvent.click(screen.getByRole("button", { name: "Incassi e pagamenti" }));
    expect(screen.getByRole("button", { name: "Incassi e pagamenti" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(ECONOMIA_VIEWS[1].description)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(screen.getByRole("button", { name: "Margini e costi" })).toHaveAttribute("aria-current", "page");
  });
  it("il collegamento SAL apre la vista documenti e il dettaglio senza click aggiuntivi", async () => {
    mount("?tab=articoli&vista_economia=margini#section-sal");
    expect(screen.getByRole("button", { name: "Varianti, SAL e documenti" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByText("Verbali SAL")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Margini e costi" }));
    expect(screen.queryByText("Verbali SAL")).not.toBeInTheDocument();
  });
  it("anche una sezione query legacy apre gli acquisti e si può abbandonare", () => {
    mount("?tab=finanza&section=section-acquisti");
    expect(screen.getByRole("button", { name: "Ordini d’acquisto" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Magazzino e seriali" }));
    expect(screen.getByRole("button", { name: "Magazzino e seriali" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("status")).not.toHaveTextContent("section=");
  });
});
