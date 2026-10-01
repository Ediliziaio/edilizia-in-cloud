import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { CantiereViewNav } from "@/components/orders/CantiereViewNav";
import { useOrderDetailNavigation } from "@/hooks/useOrderDetailNavigation";

const scrollIntoView = vi.fn();
function Harness() {
  const { activeCantiereView, navigateTo } = useOrderDetailNavigation(true);
  const location = useLocation();
  const navigate = useNavigate();
  return <div id="cantiere-workspace">
    <output aria-label="URL corrente">{location.search}{location.hash}</output>
    <button onClick={() => navigate(-1)}>Indietro</button>
    <CantiereViewNav value={activeCantiereView} onChange={cantiereView => navigateTo({ tab: "cantiere", cantiereView })} />
    <h2>Contenuto {activeCantiereView}</h2>
    {activeCantiereView === "diario" && <details id="section-diario"><summary>Storico</summary><p>Eventi economici</p></details>}
  </div>;
}
function mount(search = "?tab=cantiere") {
  return render(<MemoryRouter initialEntries={[`/azienda/ordini/test${search}`]}><Harness /></MemoryRouter>);
}
beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});
afterEach(cleanup);
describe("viste del cantiere", () => {
  it("gli stessi pulsanti su desktop e mobile controllano vista e cronologia", () => {
    mount("?tab=cantiere&from=agenda");
    fireEvent.click(screen.getByRole("button", { name: "Squadra e mezzi" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto squadra");
    expect(screen.getByRole("button", { name: "Squadra e mezzi" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Collaudo" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto collaudo");
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent("from=agenda&vista_cantiere=collaudo");
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(screen.getByRole("button", { name: "Squadra e mezzi" })).toHaveAttribute("aria-current", "page");
  });
  it("un collegamento diretto prevale sulla vista memorizzata e apre i dettagli", async () => {
    mount("?tab=cantiere&vista_cantiere=squadra#section-diario");
    expect(screen.getByRole("button", { name: "Diario" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByText("Eventi economici")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Lavorazioni" }));
    expect(screen.getByLabelText("URL corrente").textContent).not.toContain("#");
    expect(screen.getByRole("button", { name: "Lavorazioni" })).toHaveAttribute("aria-current", "page");
  });
  it("una vista esplicita scorre al workspace e una sconosciuta usa Lavorazioni", async () => {
    mount("?tab=cantiere&vista_cantiere=inesistente");
    expect(screen.getByRole("button", { name: "Lavorazioni" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.instances.at(-1)).toBe(document.getElementById("cantiere-workspace"));
  });
});
