import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollegaOrdineFatturaDialog } from "@/components/fatturazione/CollegaOrdineFatturaDialog";

// Una fattura cumulativa da 3.000 € di imponibile per due ordini dello stesso fornitore.
const DATI: Record<string, unknown[]> = {
  purchase_orders: [
    { id: "a", oda_number: "ODA-2026-001", status: "ricevuto", issue_date: "2026-10-01", subtotal: 1000, total: 1220, supplier: { name: "Edil Forniture", vat_number: "IT01234567890", fiscal_code: null } },
    { id: "b", oda_number: "ODA-2026-002", status: "ricevuto", issue_date: "2026-10-10", subtotal: 2500, total: 3050, supplier: { name: "Edil Forniture", vat_number: "IT01234567890", fiscal_code: null } },
  ],
  fatture_ricevute: [{ id: "altra", purchase_order_id: "b" }],
  fattura_ricevuta_ordini: [],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const risposta = Promise.resolve({ data: DATI[tabella] ?? [], error: null });
      const q: Record<string, unknown> = {};
      Object.assign(q, { select: () => q, eq: () => q, order: () => q, in: () => q, limit: () => risposta, then: (r: (v: unknown) => unknown) => risposta.then(r) });
      return q;
    },
  },
}));

const FATTURA = {
  id: "f1",
  cedente_ragione_sociale: "Edil Forniture",
  cedente_piva: "01234567890",
  cedente_cf: null as string | null,
  totale_documento: 3660,
  imponibile_totale: 3000,
};

function disegna(onScelto = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CollegaOrdineFatturaDialog open onOpenChange={() => {}} companyId="co" fattura={FATTURA} onScelto={onScelto} />
    </QueryClientProvider>,
  );
  return onScelto;
}

describe("Collegare una fattura a più ordini", () => {
  it("una nuova fattura parte senza ordini, quote e ricerca della precedente", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { open: true, onOpenChange: vi.fn(), companyId: "co", fattura: FATTURA, onScelto: vi.fn() };
    const vista = (p = props) => <QueryClientProvider client={qc}><CollegaOrdineFatturaDialog {...p} /></QueryClientProvider>;
    const { rerender } = render(vista());
    await screen.findByText("ODA-2026-001");
    fireEvent.click(screen.getByRole("checkbox", { name: /ODA-2026-001/ }));
    fireEvent.change(screen.getByPlaceholderText("Cerca per numero ordine o fornitore..."), { target: { value: "ODA-2026-001" } });
    // Il chiamante chiude dopo il salvataggio senza passare da onOpenChange.
    rerender(vista({ ...props, open: false }));
    rerender(vista({ ...props, fattura: { ...FATTURA, id: "f2", imponibile_totale: 700 } }));
    await screen.findByText("ODA-2026-002");
    expect((screen.getByPlaceholderText("Cerca per numero ordine o fornitore...") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("checkbox").every(x => !(x as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByRole("button", { name: "Collega" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /ODA-2026-002/ }));
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    expect(props.onScelto).toHaveBeenCalledWith([{ purchase_order_id: "b", importo: 700 }]);
  });

  it("chiudere e riaprire la stessa fattura azzera una scelta non salvata", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const vista = (open: boolean) => <QueryClientProvider client={qc}><CollegaOrdineFatturaDialog open={open} onOpenChange={() => {}} companyId="co" fattura={FATTURA} onScelto={vi.fn()} /></QueryClientProvider>;
    const { rerender } = render(vista(true));
    await screen.findByText("ODA-2026-001");
    fireEvent.click(screen.getByRole("checkbox", { name: /ODA-2026-001/ }));
    rerender(vista(false));
    rerender(vista(true));
    await screen.findByText("ODA-2026-001");
    expect(screen.getAllByRole("checkbox").every(x => !(x as HTMLInputElement).checked)).toBe(true);
  });
  it("un ordine solo: tutta la fattura su quello", async () => {
    const onScelto = disegna();
    await screen.findByText("ODA-2026-001");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("Tutta la fattura va su questo ordine.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    expect(onScelto).toHaveBeenCalledWith([{ purchase_order_id: expect.any(String), importo: expect.any(Number) }]);
  });

  it("due ordini: una quota a testa, il resto costo generale, l'ordine già fatturato si vede", async () => {
    const onScelto = disegna();
    await screen.findByText("ODA-2026-001");
    expect(await screen.findByText("già fatturato")).toBeTruthy();

    // Ordinati dal più recente: prima ODA-2026-002 (2.500), poi ODA-2026-001 (proposta: il resto, 500).
    const [primo, secondo] = screen.getAllByRole("checkbox");
    fireEvent.click(primo);
    fireEvent.click(secondo);
    const quotaA = screen.getByLabelText("Quota per ODA-2026-001") as HTMLInputElement;
    const quotaB = screen.getByLabelText("Quota per ODA-2026-002") as HTMLInputElement;
    expect(quotaB.value).toBe("2500,00");
    expect(quotaA.value).toBe("500,00");

    // Quote oltre l'imponibile: non si collega.
    fireEvent.change(quotaA, { target: { value: "1.000,00" } });
    expect(screen.getByText("Le quote superano l'imponibile della fattura.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Dividi tra 2 ordini" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(quotaB, { target: { value: "1800" } });
    expect(screen.getByText(/restano un costo generale/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dividi tra 2 ordini" }));
    expect(onScelto).toHaveBeenCalledWith(expect.arrayContaining([
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: 1800 },
    ]));
  });
});
