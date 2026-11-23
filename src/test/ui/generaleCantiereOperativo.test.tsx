import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { totaliGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CantiereGenerale } from "@/components/orders/generali/moduli/CantiereScheda";
import type { ReactNode } from "react";

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewCosts: true, canViewOrders: true, canEditOrders: true }),
}));
vi.mock("@/hooks/useMaterialiPerFase", () => ({
  useMaterialiPerFase: (id?: string) => ({ data: { righe: id ? [{ id: "item", name: "Cemento", quantity: 5 }] : [] } }),
}));
vi.mock("@/hooks/useDettagliPrioritaOperazione", () => ({
  useEdificiPriorita: (): { data: undefined } => ({ data: undefined }),
}));
vi.mock("@/components/orders/generali/moduli/MovimentiOperazione", () => ({
  MovimentiOperazione: ({ vista, onApri, azioni }: { vista: string; onApri: (id: string, fase: string) => void; azioni?: ReactNode }) => (
    <section aria-label="Vista aggregata">
      {["lavorazioni", "cronoprogramma"].includes(vista) ? <button onClick={() => onApri("figlia", "fase")}>Fondazioni</button> : vista}
      {azioni}
    </section>
  ),
}));
vi.mock("@/components/orders/generali/moduli/LavorazioniAmbito", () => ({
  LavorazioniAmbito: ({ orderId, fase, onApriCronoprogramma }: { orderId: string; fase: string; onApriCronoprogramma: () => void }) =>
    <><p>{orderId} · {fase}</p><button onClick={onApriCronoprogramma}>Vedi date</button></>,
  CronoprogrammaAmbito: ({ orderId }: { orderId: string }) => <p>Cronoprogramma · {orderId}</p>,
}));
vi.mock("@/components/orders/OrderRichiesteOfferta", () => ({
  OrderRichiesteOfferta: ({ orderId, commesse }: { orderId: string; commesse?: { id: string }[] }) =>
    <p>Richieste · {orderId}{commesse && ` · ${commesse.map(c => c.id).join(",")}`}</p>,
}));
vi.mock("@/components/orders/NuovoOdaCommessaDialog", () => ({
  NuovoOdaCommessaDialog: ({ orderId, items }: { orderId: string; items: { name: string }[] }) =>
    <div role="dialog" aria-label="Nuovo OdA">{orderId} · {items[0]?.name}</div>,
}));
vi.mock("@/components/orders/LinkedPurchaseOrdersCard", () => ({
  LinkedPurchaseOrdersCard: ({ orderId, items }: { orderId: string; items: { name: string }[] }) =>
    <p>Ordini · {orderId} · {items[0]?.name}</p>,
}));
vi.mock("@/components/orders/generali/moduli/RiconciliazioneGenerale", () => ({
  RiconciliazioneGenerale: ({ commessaId, onApriPagamenti }: { commessaId?: string; onApriPagamenti: () => void }) =>
    <><p>Controllo · {commessaId ?? "tutta"}</p><button onClick={onApriPagamenti}>Vedi pagamenti</button></>,
}));
vi.mock("@/components/orders/generali/moduli/MaterialiOperazione", () => ({
  default: ({ apri, genera }: { apri: (id: string, ricerca?: string) => void; genera?: (id: string) => void }) => <>
    <button onClick={() => apri("figlia", "Cemento")}>Materiale del lotto</button>
    <button onClick={() => genera?.("figlia")}>Genera per il lotto</button>
  </>,
}));
vi.mock("@/components/orders/generali/moduli/MaterialiAmbito", () => ({
  default: ({ orderId, apriOrdini, generaIniziale, ricercaIniziale, apriRiepilogo }: {
    orderId: string; apriOrdini: () => void; generaIniziale?: boolean; ricercaIniziale?: string; apriRiepilogo?: () => void;
  }) => <div>
    <p>Materiali · {orderId}</p>
    {generaIniziale && <p>Computo da aprire · {orderId}</p>}
    {ricercaIniziale && <p>Articolo · {ricercaIniziale}</p>}
    <button onClick={apriOrdini}>Apri gli ordini del lotto</button>
    <button onClick={apriRiepilogo}>Riepilogo materiali</button>
  </div>,
}));

const riepilogo = {
  generale: { id: "generale", modello: "appalto", codice: "G-1", nome: "Operazione" },
  figlie: [{ id: "figlia", codice: "F-1", nome: "Edificio A" }],
  permessi: { costi: true, importi: true, margini: true },
} as RiepilogoGenerale;

function Indirizzo() {
  return <output data-testid="ricerca">{useLocation().search}</output>;
}

function apri(ricerca = "") {
  return render(
    <MemoryRouter initialEntries={[`/azienda/ordini/generale?scheda=cantiere${ricerca}`]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CantiereGenerale riepilogo={riepilogo} totali={totaliGenerale(riepilogo)} puoModificare />
        <Indirizzo />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function selezionaTab(nome: RegExp) {
  const tab = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("Cantiere della commessa generale", () => {
  it("parte dalla vista complessiva e apre la fase nella commessa che la gestisce", async () => {
    apri();
    expect(screen.getByRole("region", { name: "Vista aggregata" })).toHaveTextContent("da-seguire");
    selezionaTab(/^Lavorazioni$/);
    fireEvent.click(screen.getByRole("button", { name: "Fondazioni" }));
    expect(await screen.findByText("figlia · fase")).toBeInTheDocument();
    expect(screen.getByTestId("ricerca")).toHaveTextContent("ambito-cantiere=figlia");
  });

  it("l'indice cerca il lotto e collega il computo generale e la vista complessiva", async () => {
    apri("&vista-cantiere=lavorazioni");
    const indice = within(screen.getByRole("complementary", { name: "Indice lavorazioni" }));
    fireEvent.change(indice.getByRole("searchbox"), { target: { value: "edificio" } });
    fireEvent.click(indice.getByRole("button", { name: /Edificio A/ }));
    expect(await screen.findByText("figlia ·")).toBeInTheDocument();
    fireEvent.click(indice.getByRole("button", { name: "Computo generale" }));
    expect(await screen.findByText("generale ·")).toBeInTheDocument();
    fireEvent.click(indice.getByRole("button", { name: "Tutte le fasi" }));
    expect(screen.getByRole("region", { name: "Vista aggregata" })).toBeInTheDocument();
  });

  it("apre i materiali prima degli acquisti e mantiene la commessa passando agli OdA", async () => {
    apri("&vista-cantiere=articoli");
    expect(screen.getByRole("tab", { name: "Materiali" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(await screen.findByRole("button", { name: "Materiale del lotto" }));
    expect(await screen.findByText("Materiali · figlia")).toBeInTheDocument();
    expect(screen.getByText("Articolo · Cemento")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri gli ordini del lotto" }));
    expect(await screen.findByText("Ordini · figlia · Cemento")).toBeInTheDocument();
  });

  it("avvia la generazione nell'ambito scelto e torna ai materiali dell’operazione", async () => {
    apri("&vista-cantiere=materiali&vista-materiali=magazzino");
    fireEvent.click(await screen.findByRole("button", { name: "Genera per il lotto" }));
    expect(await screen.findByText("Computo da aprire · figlia")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo materiali" }));
    expect(await screen.findByRole("button", { name: "Genera per il lotto" })).toBeInTheDocument();
    expect(screen.getByTestId("ricerca")).toHaveTextContent("vista-materiali=magazzino");
  });

  it("mantiene il collegamento storico alle forniture e apre il nuovo OdA sulla generale", async () => {
    apri("&vista-cantiere=forniture");
    expect(screen.getByRole("tab", { name: /^Ordini d’acquisto$/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^DDT$/ })).toHaveAttribute("aria-selected", "false");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo OdA sulla generale" }));
    expect(await screen.findByRole("dialog", { name: "Nuovo OdA" })).toHaveTextContent("generale · Cemento");
    changeFormControl(screen.getByLabelText("Ambito del cantiere"), { target: { value: "figlia" } });
    expect(await screen.findByText("Ordini · figlia · Cemento")).toBeInTheDocument();
    expect(within(screen.getByRole("tablist", { name: "Sezioni del cantiere" })).getByRole("tab", { name: /^DDT$/ })).toBeInTheDocument();
  });

  it("dal cronoprogramma complessivo apre la fase e torna al calendario della stessa commessa", async () => {
    apri("&vista-cantiere=cronoprogramma");
    fireEvent.click(screen.getByRole("button", { name: "Fondazioni" }));
    expect(await screen.findByText("figlia · fase")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vedi date" }));
    expect(await screen.findByText("Cronoprogramma · figlia")).toBeInTheDocument();
    expect(screen.getByTestId("ricerca")).toHaveTextContent("ambito-cantiere=figlia");
    expect(screen.getByTestId("ricerca")).not.toHaveTextContent("fase-cantiere");
  });

  it("apre le richieste d’offerta di tutta l’operazione e poi solo della figlia scelta", async () => {
    apri("&vista-cantiere=offerte");
    expect(await screen.findByText("Richieste · generale · generale,figlia")).toBeInTheDocument();
    changeFormControl(screen.getByLabelText("Ambito del cantiere"), { target: { value: "figlia" } });
    expect(await screen.findByText("Richieste · figlia")).toBeInTheDocument();
  });

  it("il controllo forniture segue l'ambito e non si carica insieme all'elenco", async () => {
    apri("&vista-cantiere=controllo");
    expect(await screen.findByText("Controllo · tutta")).toBeInTheDocument();
    changeFormControl(screen.getByLabelText("Ambito del cantiere"), { target: { value: "generale" } });
    expect(await screen.findByText("Controllo · generale")).toBeInTheDocument();
    changeFormControl(screen.getByLabelText("Ambito del cantiere"), { target: { value: "figlia" } });
    expect(await screen.findByText("Controllo · figlia")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Ordini$/ }));
    expect(await screen.findByText("Ordini · figlia · Cemento")).toBeInTheDocument();
    expect(screen.queryByText("Controllo · figlia")).not.toBeInTheDocument();
  });
});
