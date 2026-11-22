import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { changeFormControl } from "@/test/helpers/changeFormControl";
import { totaliGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { CantiereGenerale } from "@/components/orders/generali/moduli/CantiereScheda";

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewCosts: true, canViewOrders: true, canEditOrders: true }),
}));
vi.mock("@/hooks/useMaterialiPerFase", () => ({
  useMaterialiPerFase: (id?: string) => ({ data: { righe: id ? [{ id: "item", name: "Cemento", quantity: 5 }] : [] } }),
}));
vi.mock("@/components/orders/generali/moduli/MovimentiOperazione", () => ({
  MovimentiOperazione: ({ vista, onApri }: { vista: string; onApri: (id: string, fase: string) => void }) => (
    <section aria-label="Vista aggregata">
      {vista === "lavorazioni" ? <button onClick={() => onApri("figlia", "fase")}>Fondazioni</button> : vista}
    </section>
  ),
}));
vi.mock("@/components/orders/OrderWorkPhases", () => ({
  OrderWorkPhases: ({ orderId, faseIniziale }: { orderId: string; faseIniziale: string }) =>
    <p>{orderId} · {faseIniziale}</p>,
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
  RiconciliazioneGenerale: (): null => null,
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
    expect(screen.getByRole("region", { name: "Vista aggregata" })).toHaveTextContent("rapportini");
    selezionaTab(/^Lavorazioni$/);
    fireEvent.click(screen.getByRole("button", { name: "Fondazioni" }));
    expect(await screen.findByText("figlia · fase")).toBeInTheDocument();
    expect(screen.getByTestId("ricerca")).toHaveTextContent("ambito-cantiere=figlia");
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
});
