// src/test/ui/salTabRata.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Installment } from "@/lib/orderUtils";

const stato = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, salMatura: "emesso" as string,
  update: vi.fn(), sostituisci: vi.fn(), conferma: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/hooks/useSalMatura", () => ({ useSalMatura: () => stato.salMatura }));
vi.mock("@/hooks/usePianoPagamenti", () => ({ useSostituisciRate: () => ({ mutate: stato.sostituisci, isPending: false }) }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? stato.sal : [], error: null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
    lettura.update = (valori: Record<string, unknown>) => {
      stato.update(tabella, valori);
      const scrittura: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) };
      scrittura.eq = () => scrittura;
      return scrittura;
    };
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

import { SalTab } from "@/components/orders/SalTab";

const sal = (numero_sal: number, statoSal: string, importo_totale: number, installment_id: string | null = null) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato: statoSal, importo_totale, note: null as string | null, installment_id,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 40000, percentuale_avanzamento: 25, importo_sal: importo_totale, note: null as string | null }],
});
const rate = (): Installment[] => [
  { id: "r0", position: 0, label: "Alla firma", type: "deposit", amount: 3000, is_paid: false, trigger_evento: "firma_contratto" },
  { id: "r1", position: 1, label: "SAL 1", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 1 },
  { id: "r2", position: 2, label: "SAL 2", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 2 },
  { id: "r3", position: 3, label: "Saldo", type: "balance", amount: 0, is_paid: false, trigger_evento: "fine_lavori" },
];
const disegna = (installments: Installment[] = rate()) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={20000} vatRate={22} installments={installments} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stato.sal = []; stato.salMatura = "emesso";
  stato.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("SAL = rata: i SAL che il piano aspetta", () => {
  it("elenca le rate «al SAL n°» senza verbale, con il loro importo", async () => {
    disegna();
    expect(await screen.findByText("SAL da emettere")).toBeInTheDocument();
    expect(screen.getByText(/SAL n\. 1/)).toBeInTheDocument();
    expect(screen.getByText(/SAL n\. 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Emetti" })).toHaveLength(2);
  });

  it("«Emetti» apre il verbale già legato alla rata, col numero che la rata aspetta", async () => {
    stato.sal = [sal(1, "emesso", 10000, "r1")];
    disegna();
    // il SAL 1 c'è già: resta da emettere solo il 2
    await screen.findByText("SAL da emettere");
    expect(screen.getAllByRole("button", { name: "Emetti" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Emetti" }));
    expect(await screen.findByText(/SAL n\. 2\. La rata «SAL 2» vale/)).toBeInTheDocument();
  });

  it("senza rate «al SAL» (o con tutti i verbali fatti) la sezione non c'è", async () => {
    stato.sal = [sal(2, "emesso", 10000, "r2"), sal(1, "emesso", 5000, "r1")];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.queryByText("SAL da emettere")).not.toBeInTheDocument();
  });
});

describe("SAL = rata: la vita del verbale", () => {
  it("una bozza si emette con un tocco; un emesso si segna approvato; poi niente", async () => {
    stato.sal = [sal(3, "approvato", 9000), sal(2, "emesso", 8000), sal(1, "bozza", 7000)];
    disegna([]);
    await screen.findByText("SAL #3");
    fireEvent.click(screen.getByRole("button", { name: "Emetti" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", { stato: "emesso" }));
    fireEvent.click(screen.getByRole("button", { name: "Segna approvato" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", { stato: "approvato" }));
    expect(screen.getAllByRole("button", { name: /Emetti|Segna approvato/ })).toHaveLength(2);
  });

  it("la rata del verbale è «maturata» quando il verbale è emesso (regola di partenza)", async () => {
    stato.sal = [sal(1, "emesso", 10000, "r1")];
    disegna();
    expect(await screen.findByText(/SAL 1 · maturata/)).toBeInTheDocument();
  });

  it("con la regola «approvato» un verbale solo emesso non fa maturare la rata; uno approvato sì", async () => {
    stato.salMatura = "approvato";
    stato.sal = [sal(2, "approvato", 10000, "r2"), sal(1, "emesso", 5000, "r1")];
    disegna();
    await screen.findByText("SAL #2");
    expect(screen.getByText(/SAL 2 · maturata/)).toBeInTheDocument();
    expect(screen.queryByText(/SAL 1 · maturata/)).not.toBeInTheDocument();
  });

  it("se la rata vale altro del SAL con l'IVA si propone di allinearla, dopo conferma", async () => {
    // SAL 1: 10.000 netti → 12.200 con IVA; la rata vale 5.000
    stato.sal = [sal(1, "emesso", 10000, "r1")];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Imposta la rata a/ }));
    await waitFor(() => expect(stato.sostituisci).toHaveBeenCalledTimes(1));
    expect(stato.conferma).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Cambia la rata" }));
    const mandate = stato.sostituisci.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(mandate.map((r) => [r.id, r.amount])).toEqual([["r0", 3000], ["r1", 12200], ["r2", 5000], ["r3", 0]]);
  });

  it("se non si conferma, la rata resta com'è", async () => {
    stato.conferma.mockResolvedValue(false);
    stato.sal = [sal(1, "emesso", 10000, "r1")];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Imposta la rata a/ }));
    await waitFor(() => expect(stato.conferma).toHaveBeenCalled());
    expect(stato.sostituisci).not.toHaveBeenCalled();
  });

  it("il saldo finale non si allinea (lo calcola il modulo): nessun pulsante", async () => {
    stato.sal = [sal(1, "emesso", 10000, "r3")];
    disegna();
    await screen.findByText("SAL #1");
    expect(screen.queryByRole("button", { name: /Imposta la rata a/ })).not.toBeInTheDocument();
  });
});
