// Il nuovo verbale in un passaggio (10/11/2026, lotto C): rata proposta, voci che cambiano, certificato ed emissione.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, salMatura: "emesso" as string,
  update: vi.fn(), sostituisci: vi.fn(), conferma: vi.fn(),
  canEdit:true,readError:false,save:vi.fn(),upsert:vi.fn(),
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
    lettura.upsert = (riga: Record<string, unknown>) => { stato.upsert(tabella, riga); return Promise.resolve({ error: null }); };
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
import type { Installment } from "@/lib/orderUtils";
import { certificatoNelModulo, rataProposta, vociCheCambiano } from "@/lib/orders/salNuovoVerbale";
import { percentualiPrecedenti } from "@/lib/orders/salDaFasi";

const rate = (): Installment[] => [
  { id: "r1", position: 1, label: "SAL 1", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 1 },
  { id: "r2", position: 2, label: "SAL 2", type: "deposit", amount: 5000, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 2 },
];
const sal1 = () => ({
  id: "s1", numero_sal: 1, data_emissione: "2026-10-01", stato: "emesso", importo_totale: 4000, note: null as string | null, installment_id: "r1",
  sal_voci: [
    { id: "v1", descrizione: "Demolizioni", importo_contrattuale: 4000, percentuale_avanzamento: 100, importo_sal: 4000, note: null as string | null, fase_id: "f1" },
    { id: "v2", descrizione: "Massetti", importo_contrattuale: 6000, percentuale_avanzamento: 0, importo_sal: 0, note: null as string | null, fase_id: "f2" },
  ],
  sal_certificati: { sal_id: "s1", lavori_contrattuali: 4000, varianti: 0, ritenuta_pct: 5, ritenuta: 200, recupero_anticipazione: 0, altre_detrazioni: 0, acconti_precedenti: 0, netto: 3800 },
});
const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SalTab orderId="o1" companyId="c1" orderTotalAmount={10000} vatRate={10} installments={rate()} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stato.sal = [sal1()]; stato.salMatura = "emesso"; stato.sottofasi = []; stato.vociCommessa = [];
  stato.fasi = [
    { id: "f1", name: "Demolizioni", status: "completata", percentuale: 100, importo_venduto: 4000 },
    { id: "f2", name: "Massetti", status: "in_corso", percentuale: 50, importo_venduto: 6000 },
  ];
  stato.canEdit = true; stato.readError = false; stato.save.mockResolvedValue({ id: "nuovo-sal" });
  stato.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Lotto C, i conti", () => {
  it("propone la prima rata «al SAL» ancora libera", () => {
    expect(rataProposta(rate(), [{ numero_sal: 1, installment_id: "r1" }])).toBe("r2");
    expect(rataProposta(rate(), [{ numero_sal: 1, installment_id: "r1" }, { numero_sal: 2, installment_id: "r2" }])).toBe("");
  });

  it("le voci uguali al SAL precedente non si mostrano; senza precedente tutte", () => {
    const prec = percentualiPrecedenti(2, [sal1()]);
    const voci = [
      { descrizione: "Demolizioni", importo_contrattuale: "4000", percentuale_avanzamento: "100", note: "", fase_id: "f1" },
      { descrizione: "Massetti", importo_contrattuale: "6000", percentuale_avanzamento: "50", note: "", fase_id: "f2" },
      { descrizione: "Extra", importo_contrattuale: "100", percentuale_avanzamento: "0", note: "" },
    ];
    expect(vociCheCambiano(voci, prec)).toEqual([false, true, true]);
    expect(vociCheCambiano(voci, percentualiPrecedenti(1, []))).toEqual([true, true, true]);
    // importo vuoto o cambiato da una variante: si vede anche a % ferma
    expect(vociCheCambiano([{ ...voci[0], importo_contrattuale: "" }], prec)).toEqual([true]);
    expect(vociCheCambiano([{ ...voci[0], importo_contrattuale: "4500" }], prec)).toEqual([true]);
  });

  it("certificato: ritenuta del precedente, acconti = quanto restava del precedente, netto che torna", () => {
    const c = certificatoNelModulo({ cumulativo: 7000, precedente: sal1().sal_certificati, giaMaturato: 4000 });
    // 7000 − 5% (350) − acconti 3800 = 2850
    expect([c.ritenuta_pct, c.ritenuta, c.acconti_precedenti, c.netto]).toEqual([5, 350, 3800, 2850]);
    const conDetrazioni = certificatoNelModulo({ cumulativo: 7000, precedente: sal1().sal_certificati, giaMaturato: 4000, ritenutaPct: 10, altreDetrazioni: 100, nota: "penale" });
    expect([conDetrazioni.ritenuta, conDetrazioni.altre_detrazioni, conDetrazioni.netto, conDetrazioni.altre_detrazioni_nota]).toEqual([700, 100, 2400, "penale"]);
  });
});

describe("Lotto C, il modulo", () => {
  it("apre il SAL n. 2 con la sua rata, la sola voce che cambia e il certificato già fatto", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    expect(await screen.findByText(/1 voce è uguale al SAL n\. 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SAL 2 ·/ }).className).toContain("border-primary");
    await waitFor(() => expect(screen.getByLabelText("Descrizione *", { selector: "#sal-desc-1" })).toHaveValue("Massetti"));
    expect(screen.queryByLabelText("Descrizione *", { selector: "#sal-desc-0" })).toBeNull();
    // 4000 + 50% di 6000 = 7000; ritenuta 5% = 350; acconti 3800 → 2850
    const cert = screen.getByLabelText("Certificato di pagamento", { selector: "dl" });
    expect(cert.textContent).toContain("2.850,00");
  });

  it("arrotonda il netto a 100 €: il resto è rinviato al prossimo certificato", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    await screen.findByText(/1 voce è uguale/);
    fireEvent.click(screen.getByRole("button", { name: "a 100 €" }));
    const cert = screen.getByLabelText("Certificato di pagamento", { selector: "dl" });
    expect(cert.textContent).toContain("Rinviato al prossimo certificato");
    expect(cert.textContent).toContain("2.800,00");
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salva bozza SAL" }));
    await waitFor(() => expect(stato.upsert).toHaveBeenCalledWith("sal_certificati", expect.objectContaining({ netto: 2800, rinviato: 50 })));
  });

  it("«Salva ed emetti»: bozza, certificato e emissione in un passaggio", async () => {
    disegna();
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: /Nuovo verbale/ }));
    await screen.findByText(/1 voce è uguale/);
    fireEvent.click(screen.getByRole("button", { name: "Controlla riepilogo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salva ed emetti" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", expect.objectContaining({ stato: "emesso" })));
    const salvato = stato.save.mock.calls[0][1];
    expect(salvato).toMatchObject({ number: 2, installmentId: "r2" });
    expect(salvato.lines.map((l: { descrizione: string }) => l.descrizione)).toEqual(["Demolizioni", "Massetti"]);
    expect(stato.upsert).toHaveBeenCalledWith("sal_certificati", expect.objectContaining({ sal_id: "nuovo-sal", netto: 2850, acconti_precedenti: 3800 }));
  });
});
