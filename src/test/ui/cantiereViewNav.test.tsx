import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { CantiereViewNav } from "@/components/orders/CantiereViewNav";
import { useOrderDetailNavigation } from "@/hooks/useOrderDetailNavigation";
import { CANTIERE_VIEWS } from "@/lib/orders/detailNavigation";

const device = vi.hoisted(() => ({mobile:false}));
vi.mock("@/hooks/use-mobile", () => ({useIsMobile: () => device.mobile}));

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
  device.mobile = false;
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});
afterEach(cleanup);
describe("viste del cantiere", () => {
  it.each([false, true])("apre Rilievi e sopralluoghi nella posizione corretta, anche con link vecchi, mobile=%s", mobile => {
    device.mobile = mobile;
    mount("?tab=cantiere&vista_cantiere=ufficio#section-sopralluoghi");
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto sopralluoghi");
    const controls = mobile ? screen.getAllByRole("option") : screen.getByRole("navigation",{name:"Viste del cantiere"}).querySelectorAll("button");
    const cron = CANTIERE_VIEWS.findIndex(view => view.value === "cronoprogramma");
    expect(controls[cron+1]).toHaveTextContent("Rilievi e sopralluoghi");
    if(mobile) fireEvent.change(screen.getByRole("combobox",{name:"Viste del cantiere"}),{target:{value:"ufficio"}});
    else fireEvent.click(screen.getByRole("button",{name:"Ufficio"}));
    expect(screen.getByLabelText("URL corrente").textContent).not.toContain("#");
    if(mobile) fireEvent.change(screen.getByRole("combobox",{name:"Viste del cantiere"}),{target:{value:"sopralluoghi"}});
    else fireEvent.click(screen.getByRole("button",{name:"Rilievi e sopralluoghi"}));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto sopralluoghi");
    fireEvent.click(screen.getByRole("button", {name:"Indietro"}));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto ufficio");
  });
  it("gli stessi pulsanti su desktop e mobile controllano vista e cronologia", () => {
    mount("?tab=cantiere&from=agenda");
    fireEvent.click(screen.getByRole("button", { name: "Ore e persone" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto squadra");
    expect(screen.getByRole("button", { name: "Ore e persone" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Consegna e assistenza" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Contenuto collaudo");
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent("from=agenda&vista_cantiere=collaudo");
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(screen.getByRole("button", { name: "Ore e persone" })).toHaveAttribute("aria-current", "page");
  });
  it("un collegamento diretto prevale sulla vista memorizzata e apre i dettagli", async () => {
    mount("?tab=cantiere&vista_cantiere=squadra#section-diario");
    expect(screen.getByRole("button", { name: "Rapportini" })).toHaveAttribute("aria-current", "page");
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
