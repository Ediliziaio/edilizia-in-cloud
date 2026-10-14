// src/test/ui/salTabRata.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Installment } from "@/lib/orderUtils";

const stato = vi.hoisted(() => ({
  sal: [] as Array<Record<string, unknown>>, salMatura: "emesso" as string,
  update: vi.fn(), sostituisci: vi.fn(), conferma: vi.fn(),
  canEdit:true,readError:false,save:vi.fn(),
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
        Promise.resolve({ data: tabella === "sal_records" ? stato.sal : [], error: stato.readError?new Error("rete non disponibile"):null }).then(ok, ko),
    };
    for (const metodo of ["select", "eq", "order"]) lettura[metodo] = () => lettura;
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

const sal = (numero_sal: number, statoSal: string, importo_totale: number, installment_id: string | null = null) => ({
  id: `s${numero_sal}`, numero_sal, data_emissione: `2026-10-0${numero_sal}`, stato: statoSal, importo_totale, note: null as string | null, installment_id,
  sal_voci: [{ id: `v${numero_sal}`, descrizione: "Opere", importo_contrattuale: 20000, percentuale_avanzamento: importo_totale/200, importo_sal: importo_totale, note: null as string | null }],
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
  stato.canEdit=true;stato.readError=false;stato.save.mockResolvedValue({id:"draft"});
  stato.conferma.mockResolvedValue(true);
});
afterEach(cleanup);

describe("SAL = rata: i SAL che il piano aspetta", () => {
  it("elenca le rate «al SAL n°» senza verbale, con il loro importo", async () => {
    disegna();
    expect(await screen.findByText("SAL da emettere")).toBeInTheDocument();
    expect(screen.getByText(/SAL n\. 1/)).toBeInTheDocument();
    expect(screen.getByText(/SAL n\. 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Prepara SAL" })).toHaveLength(2);
  });

  it("«Emetti» apre il verbale già legato alla rata, col numero che la rata aspetta", async () => {
    stato.sal = [sal(1, "emesso", 10000, "r1")];
    disegna();
    // il SAL 1 c'è già: resta da emettere solo il 2
    await screen.findByText("SAL da emettere");
    expect(screen.getAllByRole("button", { name: "Prepara SAL" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Prepara SAL" }));
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
  it("una bozza si emette dopo conferma; un emesso si segna approvato; poi niente", async () => {
    stato.sal = [sal(1, "bozza", 7000)];
    disegna([]);
    await screen.findByText("SAL #1");
    fireEvent.click(screen.getByRole("button", { name: "Emetti" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", expect.objectContaining({ stato: "emesso" })));
    cleanup();
    stato.sal=[sal(3,"approvato",9000),sal(2,"emesso",8000),sal(1,"approvato",7000)];
    disegna([]);await screen.findByText("SAL #3");
    fireEvent.click(screen.getByRole("button", { name: "Segna approvato" }));
    await waitFor(() => expect(stato.update).toHaveBeenCalledWith("sal_records", { stato: "approvato" }));
    expect(screen.getAllByRole("button", { name: /Emetti|Segna approvato/ })).toHaveLength(1);
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

describe("SAL: controlli operativi e bozza",()=>{
  it("uno storico non disponibile non viene trattato come elenco vuoto",async()=>{
    stato.readError=true;disegna([]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Storico SAL non disponibile");
    expect(screen.queryByRole("button",{name:"Crea verbale"})).not.toBeInTheDocument();
  });
  it("lettura sola non offre scrittura, eliminazione o link cliente",async()=>{
    stato.canEdit=false;stato.sal=[sal(2,"emesso",10000),sal(1,"bozza",5000)];disegna([]);
    await screen.findByText("SAL #2");
    for(const name of ["Nuovo verbale","Emetti","Segna approvato","Elimina SAL","Prepara link cliente"])
      expect(screen.queryByRole("button",{name})).not.toBeInTheDocument();
  });
  it("una bozza vecchia non altera retroattivamente i SAL successivi",async()=>{
    stato.sal=[sal(2,"emesso",10000),sal(1,"bozza",5000)];disegna([]);
    expect(await screen.findByRole("button",{name:"Emetti"})).toBeDisabled();
    expect(screen.getByText(/Non emettere questa bozza retroattivamente/)).toBeInTheDocument();
    expect(stato.update).not.toHaveBeenCalled();
  });
  it("percentuali non valide bloccano il riepilogo senza salvare",async()=>{
    disegna([]);fireEvent.click(await screen.findByRole("button",{name:"Crea verbale"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Descrizione *"}),{target:{value:"Opere"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Importo contrattuale netto (€)"}),{target:{value:"1000,00"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Avanzamento cumulativo (%)"}),{target:{value:"120"}});
    fireEvent.click(screen.getByRole("button",{name:"Controlla riepilogo"}));
    expect(await screen.findByText(/l'avanzamento deve essere tra 0 e 100%/)).toBeInTheDocument();
    expect(stato.save).not.toHaveBeenCalled();
  });
  it("un errore di salvataggio conserva il modulo e non dichiara successo",async()=>{
    stato.save.mockRejectedValue(new Error("Le voci non sono state salvate"));
    disegna([]);fireEvent.click(await screen.findByRole("button",{name:"Crea verbale"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Descrizione *"}),{target:{value:"Opere"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Importo contrattuale netto (€)"}),{target:{value:"1000,00"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Avanzamento cumulativo (%)"}),{target:{value:"50"}});
    fireEvent.click(screen.getByRole("button",{name:"Controlla riepilogo"}));
    fireEvent.click(screen.getByRole("button",{name:"Salva bozza SAL"}));
    expect(await screen.findByText("Le voci non sono state salvate")).toBeInTheDocument();
    expect(screen.getByRole("textbox",{name:"Descrizione *"})).toHaveValue("Opere");
    expect(stato.save).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({lines:[expect.objectContaining({importo_contrattuale:"1000,00",percentuale_avanzamento:"50"})]}));
  });
});
