import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { totaliGenerale } from "@/lib/orders/commesseGenerali";
import { calcolaPianoEconomico } from "@/lib/orders/generali/pianoConti";
import { CostiComuni } from "@/components/orders/generali/piano/CostiComuni";
import { CantiereGenerale } from "@/components/orders/generali/moduli/CantiereScheda";

vi.mock("@/components/orders/RapportiniUfficio", () => ({
  RapportiniUfficio: ({ orderId }: { orderId: string }) => <p>Scrivi rapportino su {orderId}</p>,
}));
vi.mock("@/components/orders/OrdineRapportiniCampo", () => ({
  OrdineRapportiniCampo: ({ orderId }: { orderId: string }) => <p>Rapportini di {orderId}</p>,
}));
vi.mock("@/components/orders/DaApprovareCommessa", () => ({
  DaApprovareCommessa: ({ orderId }: { orderId: string }) => <p>Bolle di {orderId}</p>,
}));
vi.mock("@/components/orders/LinkedPurchaseOrdersCard", () => ({
  LinkedPurchaseOrdersCard: ({ orderId }: { orderId: string }) => <p>Ordini e DDT di {orderId}</p>,
}));
vi.mock("@/components/orders/OrderLaborCosts", () => ({ OrderLaborCosts: () => <p>Squadre</p> }));
// Dal 15/11/2026 le lavorazioni stanno nella stessa scheda dei rapportini.
vi.mock("@/components/orders/OrderWorkPhases", () => ({
  OrderWorkPhases: ({ orderId }: { orderId: string }) => <p>Lavorazioni di {orderId}</p>,
}));
vi.mock("@/components/orders/generali/design/FasiDalPianoDialog", () => ({ InvitoFasiDalPiano: (): null => null }));
// Il controllo forniture sta nella scheda degli acquisti.
vi.mock("@/components/orders/generali/moduli/RiconciliazioneGenerale", () => ({ RiconciliazioneGenerale: () => <p>Controllo forniture</p> }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewOrders: true, canViewBilling: true }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "societa-1", name: "Impresa" } }),
}));
vi.mock("@/components/orders/OrderDocumentiFornitore", () => ({
  OrderBolleDdtCard: ({ orderId }: { orderId: string }) => <p>Bolle ricevute di {orderId}</p>,
  OrderFattureFornitoriCard: ({ orderId }: { orderId: string }) => <p>Fatture di {orderId}</p>,
}));
vi.mock("@/components/orders/OrderCostiCommessa", () => ({
  OrderCostiCommessaCard: ({ orderId }: { orderId: string }) => <p>Costi di {orderId}</p>,
}));
vi.mock("@/components/orders/QuadroPagamentiCommessa", () => ({
  UsciteCommessa: ({ orderId }: { orderId: string }) => <p>Pagamenti di {orderId}</p>,
}));
vi.mock("@/components/orders/SubappaltatoriCommessa", () => ({
  SubappaltatoriCommessa: ({ orderId }: { orderId: string }) => <p>Subappalti di {orderId}</p>,
}));
afterEach(cleanup);

const r: RiepilogoGenerale = {
  generale: {
    id: "operazione-globale",
    codice: "O-1",
    nome: "Residenza",
    modello: "sviluppo",
    valore: null,
    cliente: null,
    clienteId: null,
    creataIl: null,
  },
  figlie: [],
  permessi: { importi: true, costi: true, margini: true },
};
const piano = calcolaPianoEconomico({
  oggi: "2026-11-10",
  generaleId: r.generale.id,
  voci: [],
  figlie: [],
  incassi: [],
  righe: [
    {
      id: "s1",
      fonte: "spesa",
      rifId: "s1",
      orderId: r.generale.id,
      data: "2026-11-01",
      tipo: "costo",
      chiave: "terreno",
      categoria: "terreno",
      descrizione: "Acquisto terreno",
      importo: 400000,
      voceId: null,
    },
  ],
});

describe("Gestione dell'intera operazione", () => {
  it("mostra i costi della generale senza chiedere di creare unità e apre le fonti", () => {
    const apri = vi.fn();
    render(
      <MemoryRouter>
        <CostiComuni piano={piano} riepilogo={r} onApriRighe={apri} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Costi dell'intera commessa")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /400/ }));
    expect(apri.mock.calls[0][1][0].orderId).toBe("operazione-globale");
    expect(screen.getByRole("table", { name: "Costi registrati per voce del piano" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Margine pieno" })).not.toBeInTheDocument();
  });
  it("registra rapportini e bolle sulla generale e nasconde la scrittura in sola lettura", async () => {
    render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={r} totali={totaliGenerale(r)} puoModificare={false} />
      </QueryClientProvider></MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Rapportini di operazione-globale")).toBeVisible());
    expect(screen.getByText("Bolle di operazione-globale")).toBeVisible();
    expect(screen.queryByText(/Scrivi rapportino/)).not.toBeInTheDocument();
  });
  it("usa lo stesso identificativo della generale per forniture e DDT", async () => {
    render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={r} totali={totaliGenerale(r)} puoModificare />
      </QueryClientProvider></MemoryRouter>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Acquisti e DDT" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByText("Ordini e DDT di operazione-globale")).toBeVisible());
  });
  it.each([
    // Otto schede diventate quattro (15/11/2026): fatture e pagamenti insieme, ditte con le squadre.
    ["Fatture e pagamenti", "Fatture"],
    ["Fatture e pagamenti", "Pagamenti"],
    ["Squadre e ditte", "Subappalti"],
  ])("apre %s (%s) direttamente sulla generale", async (tab, testo) => {
    render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={r} totali={totaliGenerale(r)} puoModificare />
      </QueryClientProvider></MemoryRouter>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: tab }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByText(`${testo} di operazione-globale`)).toBeVisible());
  });
  it("consente il dettaglio facoltativo dell'unità e torna alla generale nello stesso cantiere", async () => {
    const figlia = {
      id: "unita-1",
      codice: "A1",
      nome: "Appartamento",
    } as RiepilogoGenerale["figlie"][number];
    render(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={{ ...r, figlie: [figlia] }} totali={totaliGenerale(r)} puoModificare />
      </QueryClientProvider></MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Ambito del cantiere"), { target: { value: "unita-1" } });
    await waitFor(() => expect(screen.getByText("Rapportini di unita-1")).toBeVisible());
    fireEvent.change(screen.getByLabelText("Ambito del cantiere"), { target: { value: r.generale.id } });
    await waitFor(() => expect(screen.getByText("Rapportini di operazione-globale")).toBeVisible());
  });
});

describe("le schede del cantiere: otto diventate quattro", () => {
  it("quattro schede, e un collegamento vecchio apre la scheda che contiene la sezione", async () => {
    render(
      <MemoryRouter initialEntries={["/azienda/ordini/G?scheda=cantiere&vista-cantiere=pagamenti"]}><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={r} totali={totaliGenerale(r)} puoModificare />
      </QueryClientProvider></MemoryRouter>,
    );
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Rapportini e lavorazioni", "Acquisti e DDT", "Fatture e pagamenti", "Squadre e ditte",
    ]);
    expect(screen.getByRole("tab", { name: "Fatture e pagamenti" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByText("Pagamenti di operazione-globale")).toBeVisible());
    expect(screen.getByRole("heading", { name: "Pagamenti" })).toBeVisible();
  });

  it("senza il permesso dei costi non c'è la scheda delle fatture e il collegamento ripiega sui rapportini", async () => {
    render(
      <MemoryRouter initialEntries={["/azienda/ordini/G?scheda=cantiere&vista-cantiere=fatture"]}><QueryClientProvider client={new QueryClient()}>
        <CantiereGenerale riepilogo={{ ...r, permessi: { importi: false, costi: false, margini: false } }} totali={totaliGenerale(r)} puoModificare={false} />
      </QueryClientProvider></MemoryRouter>,
    );
    expect(screen.queryByRole("tab", { name: "Fatture e pagamenti" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Rapportini di operazione-globale")).toBeVisible());
    expect(screen.getByText("Lavorazioni di operazione-globale")).toBeVisible();
  });
});
