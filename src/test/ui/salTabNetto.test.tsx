// src/test/ui/salTabNetto.test.tsx
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalTab } from "@/components/orders/SalTab";

const dati = vi.hoisted(() => ({ sal: [] as Array<Record<string, unknown>> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    // Lettura: l'oggetto si può «attendere» a ogni passo della catena.
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? dati.sal : [], error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

const sal = (numero_sal: number, stato: string, importo_totale: number) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato, importo_totale, note: null as string | null, installment_id: null as string | null,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 40000, percentuale_avanzamento: 40, importo_sal: importo_totale, note: null as string | null }],
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={100000} installments={[]} />
    </QueryClientProvider>,
  );
beforeEach(() => { dati.sal = []; });
afterEach(cleanup);

describe("SAL: meno SAL precedenti", () => {
  it("il secondo SAL dice quanto era già nei precedenti e quanto fatturare ora", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Già maturato nei SAL precedenti:\s*10\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Da fatturare con questo SAL:\s*6\.000,00/)).toBeInTheDocument();
    // il primo SAL non ha precedenti: la riga compare una volta sola
    expect(screen.getAllByText(/Già maturato nei SAL precedenti/)).toHaveLength(1);
  });

  it("una bozza precedente non conta", async () => {
    dati.sal = [sal(2, "emesso", 16000), sal(1, "bozza", 10000)];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.queryByText(/Già maturato nei SAL precedenti/)).not.toBeInTheDocument();
  });

  it("un netto negativo si chiama «Rettifica»", async () => {
    dati.sal = [sal(2, "emesso", 8000), sal(1, "firmato", 10000)];
    disegna();
    expect(await screen.findByText(/Rettifica:\s*[-−]2\.000,00/)).toBeInTheDocument();
  });
});
