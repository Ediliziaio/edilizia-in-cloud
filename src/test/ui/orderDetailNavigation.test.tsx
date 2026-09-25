import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { OrderDetailNavigation } from "@/components/orders/OrderDetailNavigation";
import { useOrderDetailNavigation } from "@/hooks/useOrderDetailNavigation";
import { isOrderDetailTab } from "@/lib/orders/detailNavigation";

const scrollIntoView = vi.fn();

function Harness({ initiallyReady = true }: { initiallyReady?: boolean }) {
  const [ready, setReady] = useState(initiallyReady);
  const { activeTab, navigateTo } = useOrderDetailNavigation(ready);
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="URL corrente">{location.pathname}{location.search}{location.hash}</output>
    <button onClick={() => navigate(-1)}>Indietro</button>
    <button onClick={() => navigate(1)}>Avanti</button>
    <button onClick={() => setReady(true)}>Carica commessa</button>
    <button onClick={() => navigateTo({ tab: "finanza", section: "section-pagamenti" })}>Registra incasso</button>
    <button onClick={() => navigateTo({ tab: "cantiere", section: "section-pianificazione" })}>Pianifica</button>
    {ready && <div id="order-detail-overview">
      <h2>Testata comune</h2>
      <details><summary>Stato</summary><div id="section-stato">Storico</div></details>
      <Tabs value={activeTab} onValueChange={value => isOrderDetailTab(value) && navigateTo({ tab: value })}>
      <OrderDetailNavigation />
      <TabsContent value="panoramica">
        <h2>Riepilogo</h2>
        <details><summary>Note</summary><div id="section-note">Strumenti</div></details>
      </TabsContent>
      <TabsContent value="cantiere">
        <h2>Lavorazioni</h2><div id="section-rapportini">Rapportini</div><div id="section-sal">Verbali SAL</div>
        <details><summary>Calendario</summary><div id="section-pianificazione">Date e appuntamenti</div><div id="section-attivita">Attività del cantiere</div></details>
      </TabsContent>
      <TabsContent value="articoli"><h2>Materiali</h2></TabsContent>
      <TabsContent value="finanza"><h2>Economia</h2><div id="section-pagamenti">Rate e incassi</div></TabsContent>
    </Tabs></div>}
  </>;
}

function mount(search = "", ready = true) {
  return render(<MemoryRouter initialEntries={[`/azienda/ordini/test${search}`]}>
    <Harness initiallyReady={ready} />
  </MemoryRouter>);
}

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});
afterEach(cleanup);

describe("navigazione commessa reale (Radix + React Router)", () => {
  it("presenta sempre le stesse quattro aree accessibili", () => {
    mount();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tablist", { name: "Aree della commessa" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Panoramica" })).toHaveAttribute("aria-selected", "true");
  });

  it("cambia pannello, conserva gli altri parametri e supporta Indietro/Avanti", () => {
    mount("?from=agenda");
    selectTab("Cantiere");
    expect(screen.getByRole("heading", { name: "Lavorazioni" })).toBeVisible();
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent("?from=agenda&tab=cantiere");
    selectTab("Materiali e acquisti");
    expect(screen.getByRole("heading", { name: "Materiali" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    expect(screen.getByRole("tab", { name: "Cantiere" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("tab", { name: "Materiali e acquisti" })).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["campo", "Cantiere", "Rapportini"],
    ["sal", "Cantiere", "Verbali SAL"],
    ["stato", "Panoramica", "Storico"],
    ["altro", "Panoramica", "Strumenti"],
  ])("recupera il vecchio link %s e apre la sezione corretta", async (legacy, tab, content) => {
    mount(`?tab=${legacy}`);
    expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByText(content, { exact: true })).toBeVisible());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("attende il caricamento della commessa prima di aprire e scorrere un link", async () => {
    mount("?tab=stato", false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Carica commessa" }));
    await waitFor(() => expect(screen.getByText("Storico")).toBeVisible());
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("apre i dettagli del calendario da un'azione e azzera l'ancora al cambio area", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Pianifica" }));
    await waitFor(() => expect(screen.getByText("Date e appuntamenti")).toBeVisible());
    selectTab("Economia e pagamenti");
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent("/azienda/ordini/test?tab=finanza");
    expect(screen.getByLabelText("URL corrente").textContent).not.toContain("#");
  });

  it("Registra incasso raggiunge i pagamenti senza mutazioni", async () => {
    mount("?from=agenda");
    fireEvent.click(screen.getByRole("button", { name: "Registra incasso" }));
    expect(screen.getByText("Rate e incassi")).toBeVisible();
    expect(screen.getByLabelText("URL corrente")).toHaveTextContent("?from=agenda&tab=finanza#section-pagamenti");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("non forza lo scroll all'apertura senza destinazione esplicita", async () => {
    mount();
    await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("al cambio tab torna alla testata condivisa, senza nascondere riepilogo e azioni", async () => {
    mount();
    for (const name of ["Cantiere", "Materiali e acquisti", "Economia e pagamenti", "Panoramica"]) {
      scrollIntoView.mockClear();
      selectTab(name);
      expect(screen.getByRole("heading", { name: "Testata comune" })).toBeVisible();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(scrollIntoView.mock.instances.at(-1)).toBe(document.getElementById("order-detail-overview"));
    }
  });

  it("il link alle attività apre anche il contenitore della pianificazione", async () => {
    mount("?tab=panoramica#section-attivita");
    expect(screen.getByRole("tab", { name: "Cantiere" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByText("Attività del cantiere")).toBeVisible());
  });

  it("il ridimensionamento non cambia area né rimonta il contenuto", () => {
    mount("?tab=cantiere");
    const panel = screen.getByRole("tabpanel");
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("tabpanel")).toBe(panel);
    expect(screen.getByRole("tab", { name: "Cantiere" })).toHaveAttribute("aria-selected", "true");
  });
});
