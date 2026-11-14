/**
 * «Genera dal computo», dopo «Salva i materiali» (14/11/2026): gli ordini in bozza
 * per fornitore, con la funzione della barra dei Materiali.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProcurementItem } from "@/lib/orders/materialProcurement";

const crea = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/orders/createMaterialPurchaseOrder", () => ({ createMaterialPurchaseOrder: crea.fn }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DopoIlSalvataggio } from "@/components/orders/materiali/DopoIlSalvataggio";
import { raggruppaPerFornitore } from "@/lib/distinta/ordiniDaMateriali";

const riga = (p: Partial<ProcurementItem> & { id: string; name: string }): ProcurementItem =>
  ({ quantity: 1, purchase_price: 0, vat_rate: 22, supplier_id: null, stock_item_id: null, status: "da_ordinare", posizioni: null, unita_misura: "pz", ...p } as ProcurementItem);

const MATERIALI = [
  riga({ id: "1", name: "Intonaco premiscelato di fondo", quantity: 101, purchase_price: 6.12, supplier_id: "f-edil", unita_misura: "sacco" }),
  riga({ id: "2", name: "Cemento", quantity: 35, purchase_price: 4.86, supplier_id: "f-edil", unita_misura: "sacco" }),
  riga({ id: "3", name: "Travetto precompresso", quantity: 412, purchase_price: 2.6, supplier_id: "f-fornace", unita_misura: "m" }),
  riga({ id: "4", name: "Casseforme", quantity: 80, supplier_id: null, unita_misura: "mq" }),
];
const FORNITORI = new Map([["f-edil", "Edilmateriali"], ["f-fornace", "Fornace Rossi"]]);

const apri = (onOpenChange = vi.fn()) => render(
  <QueryClientProvider client={new QueryClient()}>
    <DopoIlSalvataggio open onOpenChange={onOpenChange} materiali={MATERIALI} companyId="c1" orderId="o1" orderCode="C-1" userId="u1" fornitori={FORNITORI} mostraPrezzi />
  </QueryClientProvider>,
);

beforeEach(() => { crea.fn.mockReset(); crea.fn.mockResolvedValue({ poId: "po" }); });

describe("dopo il salvataggio: gli ordini per fornitore", () => {
  it("raggruppa per fornitore col totale, dal più alto; i senza fornitore a parte", () => {
    const { gruppi, senzaFornitore } = raggruppaPerFornitore(MATERIALI, FORNITORI);
    expect(gruppi.map((g) => [g.nome, g.righe.length, g.totale])).toEqual([["Fornace Rossi", 1, 1071.2], ["Edilmateriali", 2, 788.22]]);
    expect(senzaFornitore.map((m) => m.name)).toEqual(["Casseforme"]);
  });

  it("crea un ordine in bozza per ogni fornitore scelto, con la funzione della barra dei Materiali", async () => {
    const chiudi = vi.fn();
    apri(chiudi);
    const elenco = screen.getByRole("list", { name: "Ordini da creare" });
    expect(within(elenco).getByText("Edilmateriali")).toBeInTheDocument();
    expect(within(elenco).getByText("788,22 €")).toBeInTheDocument();
    expect(screen.getByText(/1 materiali senza fornitore/)).toBeInTheDocument();
    // Tolgo Fornace Rossi: resta un ordine solo.
    fireEvent.click(screen.getByLabelText("Ordina a Fornace Rossi"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crea l'ordine in bozza" })); });
    expect(crea.fn).toHaveBeenCalledTimes(1);
    expect(crea.fn.mock.calls[0][0]).toMatchObject({ companyId: "c1", orderId: "o1", supplierId: "f-edil", userId: "u1" });
    expect(crea.fn.mock.calls[0][0].items.map((i: ProcurementItem) => i.id)).toEqual(["1", "2"]);
    expect(chiudi).toHaveBeenCalledWith(false);
  });

  it("se un ordine non si crea lo dice e resta aperta per riprovare", async () => {
    crea.fn.mockImplementation(async ({ supplierId }: { supplierId: string }) => {
      if (supplierId === "f-fornace") throw new Error("Verifica prima ODA-12");
      return { poId: "po" };
    });
    const chiudi = vi.fn();
    apri(chiudi);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Crea 2 ordini in bozza" })); });
    expect(crea.fn).toHaveBeenCalledTimes(2);
    expect(chiudi).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ordine creato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crea l'ordine in bozza" })).toBeEnabled();
  });
});
