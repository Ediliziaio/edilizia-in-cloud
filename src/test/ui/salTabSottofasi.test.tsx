// Il modulo del nuovo verbale con le sottofasi (10/11/2026).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, salMatura: "emesso" as string,
  update: vi.fn(), sostituisci: vi.fn(), conferma: vi.fn(),
  canEdit:true,readError:false,save:vi.fn(),
  fasi: [] as Array<Record<string, unknown>>,
  sottofasi: [] as Array<Record<string, unknown>>, vociCommessa: [] as Array<Record<string, unknown>>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => stato.conferma }));
vi.mock("@/components/shared/PrintPreviewModal", () => ({ PrintPreviewModal: (): null => null }));
vi.mock("@/hooks/useSalMatura", () => ({ useSalMatura: () => stato.salMatura }));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:stato.canEdit,canViewSettingsOrders:false})}));
vi.mock("@/lib/orders/saveSalDraft",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/orders/saveSalDraft")>(),saveSalDraft:stato.save}));
vi.mock("@/hooks/usePianoPagamenti", () => ({ useSostituisciRate: () => ({ mutate: stato.sostituisci, isPending: false }) }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (tabella: string) => {
    const lettura: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabella === "sal_records" ? stato.sal : tabella === "order_work_phases" ? stato.fasi : tabella === "order_work_subphases" ? stato.sottofasi : tabella === "order_work_phase_voci" ? stato.vociCommessa : [], error: stato.readError?new Error("rete non disponibile"):null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order", "in", "not", "range"]) lettura[metodo] = () => lettura;
    lettura.update = (valori: Record<string, unknown>) => {
      stato.update(tabella, valori);
      const scrittura: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) };
      scrittura.eq = () => scrittura;
      scrittura.select = () => ({then:(ok:(value:unknown)=>unknown)=>Promise.resolve({data:[{id:"confirmed",...valori}],error:null}).then(ok)});
      return scrittura;
    };
    return lettura;
  };
  return { supabase: { from: costruisci, functions: { invoke: vi.fn() } } };
});

import { SalTab } from "@/components/orders/SalTab";

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={20000} vatRate={22} installments={[]} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stato.sal = []; stato.salMatura = "emesso";
  stato.fasi = [{ id: "f1", name: "Primo solaio", status: "in_corso", percentuale: 57, importo_venduto: 10000 }];
  stato.sottofasi = [
    { id: "s1", phase_id: "f1", name: "Getto", position: 1, peso: 1, fatta: false, percentuale: 50, quantita_fatta: 20 },
    { id: "s2", phase_id: "f1", name: "Travi", position: 2, peso: 1, fatta: true, percentuale: 100, quantita_fatta: null },
  ];
  stato.vociCommessa = [
    { subphase_id: "s1", quantita: 40, unita: "m³", importo: 8000 },
    { subphase_id: "s2", quantita: 10, unita: "m", importo: 2000 },
  ];
  stato.canEdit = true; stato.readError = false; stato.save.mockResolvedValue({ id: "draft" });
  stato.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Nuovo verbale: sotto ogni fase le sue sottofasi", () => {
  it("la fase prende la media delle sottofasi, e una quantità cambiata la sposta", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Crea verbale/ }));
    expect(await screen.findByText("Getto")).toBeInTheDocument();
    expect(screen.getByText("Travi")).toBeInTheDocument();
    // Getto 20/40 = 50% su 8000, Travi fatta su 2000 → 60%
    const pctFase = screen.getByLabelText("Avanzamento cumulativo (%)") as HTMLInputElement;
    await waitFor(() => expect(pctFase.value).toBe("60"));
    expect(pctFase.readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText("Quantità a oggi di Getto"), { target: { value: "30" } });
    // Getto 75% → 8000 × 75% + 2000 = 8000 su 10000
    expect(pctFase.value).toBe("80");
    expect((screen.getByLabelText("Avanzamento di Getto") as HTMLInputElement).value).toBe("75");
  });

  it("salva fase e sottofasi insieme", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Crea verbale/ }));
    await screen.findByText("Getto");
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salva bozza SAL" }));
    await waitFor(() => expect(stato.save).toHaveBeenCalled());
    const linee = stato.save.mock.calls[0][1].lines;
    expect(linee[0]).toMatchObject({ fase_id: "f1", percentuale_avanzamento: "60" });
    expect(linee[0].sottofasi.map((d: { descrizione: string; percentuale_avanzamento: string }) => [d.descrizione, d.percentuale_avanzamento]))
      .toEqual([["Getto", "50"], ["Travi", "100"]]);
  });
});
