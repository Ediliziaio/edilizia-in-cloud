import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WarehouseUsciteTab } from "@/components/warehouse/WarehouseUsciteTab";
import type { UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";

const stato = vi.hoisted(() => ({ chiamate: [] as Array<{ uscitaId: string; ddtExtra: unknown }>, navigazioni: [] as string[] }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => (to: string) => stato.navigazioni.push(to),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => ({ isNative: true }) }));
vi.mock("@/hooks/useShipmentDDTPDF", () => ({ useShipmentDDTPDF: () => ({ generate: vi.fn() }) }));

// Le uscite di Demo 2 com'erano il 29/10/2026: tutte senza DDT tranne quella finta già documentata.
const USCITE: UscitaRow[] = [
  { id: "u1", numero: "U-2026-0004", data: "2026-10-05", destinatario_tipo: "cantiere", customer_id: null, order_id: "o1",
    destinatario_libero: null, cliente_snapshot: { ragione_sociale: "Studio Cedro" }, vettore: { tipo: "mittente" },
    righe: [{ descrizione: "Lamella", quantita: 1 }, { descrizione: "Guida", quantita: 2 }], stato: "registrata",
    documento_id: null, note: null, warehouse_id: "w1", created_at: "2026-10-05" },
  { id: "u2", numero: "U-2026-0001", data: "2026-06-26", destinatario_tipo: "libero", customer_id: null, order_id: null,
    destinatario_libero: { ragione_sociale: "Bianchi" }, cliente_snapshot: { ragione_sociale: "Bianchi" }, vettore: null,
    righe: [{ descrizione: "Profilo", quantita: 1 }], stato: "registrata", documento_id: null, note: null, warehouse_id: "w1", created_at: "2026-06-26" },
  { id: "u3", numero: "U-2026-0002", data: "2026-08-24", destinatario_tipo: "cantiere", customer_id: null, order_id: "o2",
    destinatario_libero: null, cliente_snapshot: { ragione_sociale: "Verdi" }, vettore: null,
    righe: [{ descrizione: "Vite", quantita: 10 }], stato: "ddt_creato", documento_id: "d9", note: null, warehouse_id: "w1", created_at: "2026-08-24" },
];

vi.mock("@/hooks/warehouse/useWarehouseUscita", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/warehouse/useWarehouseUscita")>()),
  useWarehouseUscite: () => ({ data: USCITE, isLoading: false }),
  useCreateDdtFromUscita: () => ({
    isPending: false,
    mutateAsync: async (args: { uscitaId: string; ddtExtra: unknown }) => {
      stato.chiamate.push(args);
      return { documento_id: "nuovo-doc", numero_ddt: "DDT-2026-0005" };
    },
  }),
}));

function disegna() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WarehouseUsciteTab warehouseFilter={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stato.chiamate.length = 0;
  stato.navigazioni.length = 0;
});

describe("Uscite di magazzino e DDT", () => {
  it("dice quante uscite sono partite senza DDT", () => {
    disegna();
    expect(screen.getByText(/2 uscite sono partite senza DDT/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Senza DDT · 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Con DDT · 1" })).toBeTruthy();
  });

  it("il filtro «Senza DDT» lascia solo quelle da documentare", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Senza DDT · 2" }));
    expect(screen.getByText("U-2026-0004")).toBeTruthy();
    expect(screen.getByText("U-2026-0001")).toBeTruthy();
    expect(screen.queryByText("U-2026-0002")).toBeNull();
  });

  it("per un cantiere propone «Trasferimento a cantiere» e manda i dati di trasporto", async () => {
    disegna();
    const riga = screen.getByText("U-2026-0004").closest("div.flex.items-center.gap-3") as HTMLElement;
    fireEvent.click(within(riga).getByRole("button", { name: /Crea DDT/ }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Trasferimento a cantiere")).toBeTruthy();
    // Le righe dell'uscita sono proposte come colli.
    expect((within(finestra).getByLabelText("Colli") as HTMLInputElement).value).toBe("2");
    fireEvent.change(within(finestra).getByLabelText("Aspetto dei beni"), { target: { value: "Bancale" } });
    fireEvent.click(within(finestra).getByRole("button", { name: /Crea il DDT/ }));
    await vi.waitFor(() => expect(stato.chiamate).toHaveLength(1));
    expect(stato.chiamate[0]).toEqual({
      uscitaId: "u1",
      ddtExtra: { causale_trasporto: "trasferimento_cantiere", porto: "Franco", numero_colli: "2", aspetto_beni: "Bancale" },
    });
    await vi.waitFor(() => expect(stato.navigazioni).toEqual(["/azienda/documenti/nuovo-doc"]));
  });

  it("per un destinatario libero propone «Vendita»", async () => {
    disegna();
    const riga = screen.getByText("U-2026-0001").closest("div.flex.items-center.gap-3") as HTMLElement;
    fireEvent.click(within(riga).getByRole("button", { name: /Crea DDT/ }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Vendita")).toBeTruthy();
  });
});
