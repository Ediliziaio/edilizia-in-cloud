import {
  fireEvent,
  render,
  screen,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  readonly: false,
  invoke: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: m.readonly,
    canManagePurchasing: true,
  }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({
    data: [
      {
        id: "b1",
        descrizione: "Condizionatore inverter",
        quantita: 10,
        unita_misura: "pz",
        purchase_order_item_id: "clima",
      },
    ],
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useConsegneDDT", () => ({
  useConsegneDDT: () => ({
    data: [
      {
        riga_id: "b1",
        purchase_order_item_id: "clima",
        quantita: 10,
        tipo: "ingresso",
      },
    ],
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useControlloOrdiniDDT", () => ({
  useControlloOrdiniDDT: () => ({
    data: {
      ordini: [{ id: "oda", oda_number: "ODA-TEST" }],
      righe: [
        {
          id: "clima",
          description: "Condizionatore inverter",
          quantity: 10,
          quantity_received: 10,
          unit_of_measure: "pz",
          purchase_order_id: "oda",
          oda_number: "ODA-TEST",
        },
        {
          id: "tapp",
          description: "Tapparella alluminio",
          quantity: 2,
          quantity_received: 0,
          unit_of_measure: "pz",
          purchase_order_id: "oda",
          oda_number: "ODA-TEST",
        },
      ],
      bolle: [{ id: "ddt", numero_ddt: "DDT-TEST" }],
    },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useConfrontoFattura", () => ({
  useOriginaliConfronto: () => ({
    data: [{ id: "foto", nome: "Bolla originale.jpg" }],
  }),
}));
vi.mock("@/components/fatturazione/OriginaliConfronto", () => ({
  OriginaliConfronto: () => <p>Foto originale della bolla</p>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: m.invoke } },
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: { rpc: m.rpc },
}));
import { ControlloOrdiniDDTCard } from "@/components/ddt/ControlloOrdiniDDTCard";
import type { DDTRicezione } from "@/hooks/useDDTRicezione";
beforeEach(() => {
  m.readonly = false;
  m.invoke.mockReset();
  m.rpc.mockReset();
});
afterEach(cleanup);
function mostra(daScheda?: Omit<ComponentProps<typeof ControlloOrdiniDDTCard>, "ddt">) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Controllo() {
    const [aperto, setAperto] = useState(daScheda?.apertoDallaScheda);
    return <ControlloOrdiniDDTCard
      {...daScheda}
      apertoDallaScheda={aperto}
      onApertoChange={aperto === undefined ? undefined : (valore) => {
        setAperto(valore);
        daScheda?.onApertoChange?.(valore);
      }}
      ddt={{
        id: "ddt",
        company_id: "azienda",
        supplier_id: "fornitore",
        numero_ddt: "DDT-TEST",
      } as DDTRicezione}
    />;
  }
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Controllo />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
it("apre il confronto richiesto dalla testata della scheda", () => {
  const onApertoChange = vi.fn();
  mostra({ apertoDallaScheda: true, onApertoChange });
  const dialogo = screen.getByRole("dialog", { name: "Confronto DDT e ordini" });
  expect(within(dialogo).getByText("Tapparella alluminio")).toBeInTheDocument();
  fireEvent.click(within(dialogo).getByRole("button", { name: /^Chiudi confronto$/ }));
  expect(onApertoChange).toHaveBeenCalledWith(false);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("dall’OdA mostra l’originale e l’ordine scelto prima di andare alle quantità", async () => {
  const onApriConsegne = vi.fn();
  mostra({ apertoDallaScheda: true, ordineIniziale: "oda", mostraOriginale: true, onApriConsegne });
  const dialogo = within(screen.getByRole("dialog", { name: "Confronto DDT e ordini" }));
  expect(dialogo.getByRole("tab", { name: "PDF / foto originali" })).toHaveAttribute("aria-selected", "true");
  expect(dialogo.getByRole("combobox", { name: "Ordine da confrontare" })).toHaveTextContent("ODA-TEST");
  expect(dialogo.getByText("Foto originale della bolla")).toBeInTheDocument();
  expect(dialogo.getByText("Tapparella alluminio")).toBeInTheDocument();
  fireEvent.click(dialogo.getByRole("button", { name: "Vai alla conferma quantità" }));
  await waitFor(() => expect(onApriConsegne).toHaveBeenCalledOnce());
  expect(m.rpc).not.toHaveBeenCalled();
});
it("mostra la tapparella mancante anche se non appare nel DDT e apre il confronto con l’originale", () => {
  mostra();
  const riga = screen.getByText("Tapparella alluminio").closest("tr")!;
  expect(within(riga).getByText("Da ricevere")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apri confronto" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Tapparella alluminio")).toBeInTheDocument();
  fireEvent.mouseDown(
    within(dialog).getByRole("tab", { name: "PDF / foto originali" }),
  );
  fireEvent.click(
    within(dialog).getByRole("tab", { name: "PDF / foto originali" }),
  );
  expect(
    within(dialog).getByText("Foto originale della bolla"),
  ).toBeInTheDocument();
});
it("l’AI propone ma non registra arrivi o abbinamenti finché la persona non sceglie", async () => {
  m.invoke.mockResolvedValue({
    data: {
      impronta: "stabile",
      righe: [
        {
          riga_id: "b1",
          ordine_righe: ["tapp"],
          affidabilita: "media",
          motivo: "Da controllare con il documento originale",
        },
      ],
    },
    error: null,
  });
  m.rpc.mockResolvedValue({ data: { impronta: "nuova" }, error: null });
  mostra();
  fireEvent.click(screen.getByRole("button", { name: "Apri confronto" }));
  fireEvent.click(screen.getByRole("button", { name: "Controlla con AI" }));
  await screen.findByText("Da controllare con il documento originale");
  expect(m.rpc).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /Usa · ODA-TEST · Tapparella/ }),
  );
  await waitFor(() =>
    expect(m.rpc).toHaveBeenCalledWith("ddt_accetta_abbinamento_ai", {
      p_ddt: "ddt",
      p_riga: "b1",
      p_ordine_riga: "tapp",
      p_impronta: "stabile",
    }),
  );
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("in sola lettura lascia il confronto disponibile e nasconde le azioni di modifica", () => {
  m.readonly = true;
  mostra();
  expect(
    screen.queryByRole("button", { name: "Collega ordine" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apri confronto" }));
  expect(
    screen.queryByRole("button", { name: "Controlla con AI" }),
  ).not.toBeInTheDocument();
});
