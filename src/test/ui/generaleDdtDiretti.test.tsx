import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiconciliazioneGenerale } from "@/components/orders/generali/moduli/RiconciliazioneGenerale";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

const m = vi.hoisted(() => ({ fatture: [] as unknown[], legami: [] as unknown[], collega: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditOrders: true, canViewBilling: true }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/hooks/useControlloFornitureGenerale", () => ({
  useCollegaRigaFornitura: () => ({ mutate: m.collega, isPending: false }),
  useControlloFornitureGenerale: () => ({
    data: {
      ordini: [],
      righe: [],
      quadri: [],
      fattureConOrdine: [],
      fatture: m.fatture,
      legamiDdt: m.legami,
      bolle: [{ id: "ddt", order_id: "g", purchase_order_id: null, numero_ddt: "DIR-1", stato: "ricevuto" }],
      consegne: [
        {
          id: "r",
          ddt_ricezione_id: "ddt",
          purchase_order_item_id: null,
          descrizione: "Materiale diretto",
          quantita: 5,
          prezzo_unitario: 10,
          importo: 50,
        },
      ],
    },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/orders/ExpensePaymentDialog", () => ({
  ExpensePaymentDialog: ({ costId }: { costId: string }) => <p>Pagamento costo {costId}</p>,
}));
vi.mock("@/components/fatturazione/RiepilogoFatturaRicevuta", () => ({
  RiepilogoFatturaRicevuta: ({ fatturaId }: { fatturaId: string | null }) =>
    fatturaId ? <p>Dettaglio fattura {fatturaId}</p> : null,
}));
const riepilogo: RiepilogoGenerale = {
  generale: {
    id: "g",
    codice: "O-63",
    nome: "Test",
    modello: "sviluppo",
    valore: null,
    cliente: null,
    clienteId: null,
    creataIl: null,
  },
  figlie: [],
  permessi: { importi: true, costi: true, margini: true },
};
beforeEach(() => {
  m.collega.mockClear();
  m.fatture = [
    {
      id: "f",
      purchase_order_id: null,
      company_cost_id: "c",
      numero_fattura: "F-DIR",
      tipo_documento: "TD01",
      imponibile_totale: 50,
      stato: "contabilizzata",
      righe: [],
    },
  ];
  m.legami = [{ id: "l", fattura_ricevuta_id: "f", ddt_ricezione_id: "ddt" }];
});
afterEach(cleanup);
const mostra = () =>
  render(
    <MemoryRouter>
      <RiconciliazioneGenerale riepilogo={riepilogo} />
    </MemoryRouter>,
  );

it("mostra il percorso diretto senza un falso avviso di riga d'ordine mancante", () => {
  mostra();
  const tabella = within(screen.getByRole("table", { name: "Riconciliazione DDT senza ordine" }));
  expect(tabella.getByRole("link", { name: "DDT DIR-1" })).toHaveAttribute("href", "/azienda/ddt/ddt");
  expect(tabella.getByText("Importi coerenti")).toBeVisible();
  expect(screen.queryByText(/non sono abbinate a una riga d'ordine/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Solo righe da controllare (0)")).toBeVisible();
  expect(screen.queryByLabelText(/Riga ordine per fattura F-DIR/)).not.toBeInTheDocument();
  expect(m.collega).not.toHaveBeenCalled();
});
it("apre fattura e pagamento dello stesso costo dalla riconciliazione", () => {
  mostra();
  fireEvent.click(screen.getByRole("button", { name: "Fattura F-DIR" }));
  expect(screen.getByText("Dettaglio fattura f")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Pagamenti fattura F-DIR" }));
  expect(screen.getByText("Pagamento costo c")).toBeVisible();
});
it("una bolla senza fattura resta visibile e segnala cosa manca", () => {
  m.fatture = [];
  m.legami = [];
  mostra();
  expect(screen.getByText("Nessuna fattura collegata")).toBeVisible();
  expect(screen.getByLabelText("Solo righe da controllare (1)")).toBeVisible();
  expect(screen.getByText("In attesa della fattura o del suo collegamento")).toBeVisible();
});
it("non presenta come scostamento il totale di una fattura che copre altre bolle", () => {
  m.fatture = [{ ...(m.fatture[0] as Record<string, unknown>), imponibile_totale: 100 }];
  m.legami.push({ id: "l2", fattura_ricevuta_id: "f", ddt_ricezione_id: "altro-ddt" });
  mostra();
  expect(screen.getByText("Fattura su più DDT: importi non ripartiti tra le bolle.")).toBeVisible();
  expect(screen.queryByText(/Importi della bolla e delle fatture diversi/)).not.toBeInTheDocument();
});
