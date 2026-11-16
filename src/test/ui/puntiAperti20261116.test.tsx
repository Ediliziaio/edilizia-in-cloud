// @vitest-environment jsdom
// Punti aperti del 16/11/2026: «Annulla costo» (con storno e ripristino), Costi → Utenze coi costi
// delle bollette scartate, soglie in Impostazioni → Automazioni, Contabilità → «Da verificare».
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const stato = vi.hoisted(() => ({
  chiamate: [] as Array<{ nome: string; args: unknown }>,
  rpc: {} as Record<string, unknown>,
  errori: {} as Record<string, { message: string; code?: string }>,
  righe: {} as Record<string, unknown[]>,
  upsert: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.upsert = async (v: unknown) => { stato.upsert.push(v); return { error: null as unknown }; };
      q.then = (ok: (v: unknown) => unknown) => ok({ data: stato.righe[t] ?? [], error: null });
      return q;
    },
    rpc: async (nome: string, args: unknown) => {
      stato.chiamate.push({ nome, args });
      if (stato.errori[nome]) return { data: null, error: stato.errori[nome] };
      return { data: (stato.rpc[nome] ?? null) as unknown, error: null as unknown };
    },
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false }) }));

import { AnnullaCostoDialog } from "@/components/costi/AnnullaCostoDialog";
import UtenzeTab from "@/components/costi/UtenzeTab";
import { SoglieCollegamentiCard } from "@/components/settings/automazioni/SoglieCollegamenti";
import { DaVerificareCard } from "@/components/contabilita/DaVerificareCard";

const avvolgi = (n: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{n}</MemoryRouter></QueryClientProvider>,
);
afterEach(() => { cleanup(); stato.chiamate = []; stato.rpc = {}; stato.errori = {}; stato.righe = {}; stato.upsert = []; });
const anteprima = (x: Record<string, unknown> = {}): Record<string, unknown> => ({
  annullato: false, annullato_il: null as string | null, annullato_motivo: null as string | null, importo: 335.4,
  ostacoli: [] as unknown[], scadenze_da_annullare: 1, rate_da_annullare: 1, ...x,
});

describe("Annulla costo", () => {
  it("dice cosa si annulla con lui, chiede il motivo e annulla", async () => {
    stato.rpc.costo_annullo_anteprima = anteprima();
    stato.rpc.costo_annulla = { scadenze_annullate: 1, rate_annullate: 1 };
    avvolgi(<AnnullaCostoDialog costId="c1" nome="Luce ottobre" open onOpenChange={() => {}} />);
    expect(await screen.findByText(/Si annulla anche la scadenza non pagata/)).toBeTruthy();
    const bottone = screen.getByRole("button", { name: /Annulla costo/ }) as HTMLButtonElement;
    expect(bottone.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Bolletta doppia" } });
    fireEvent.click(bottone);
    await waitFor(() => expect(stato.chiamate.find((c) => c.nome === "costo_annulla")?.args).toEqual({ p_costo: "c1", p_motivo: "Bolletta doppia" }));
  });

  it("con un pagamento si ferma, dice perché e propone lo storno", async () => {
    stato.rpc.costo_annullo_anteprima = anteprima({ ostacoli: [{ codice: "pagamento", rimedio: "storna_pagamento", testo: "Ci sono pagamenti registrati per 200,00 €: prima storna il pagamento." }] });
    avvolgi(<AnnullaCostoDialog costId="c1" open onOpenChange={() => {}} motivoIniziale="Doppia" />);
    expect(await screen.findByText(/Ci sono pagamenti registrati/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Annulla costo/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Storna il pagamento" }));
    await waitFor(() => expect(stato.chiamate.some((c) => c.nome === "storna_pagamenti_costo")).toBe(true));
  });

  it("con un bonifico collegato non c'è lo storno da qui", async () => {
    stato.rpc.costo_annullo_anteprima = anteprima({ ostacoli: [{ codice: "banca", rimedio: "tesoreria", testo: "Un movimento della banca è collegato a questo costo." }] });
    avvolgi(<AnnullaCostoDialog costId="c1" open onOpenChange={() => {}} />);
    expect(await screen.findByText(/Un movimento della banca/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Storna il pagamento" })).toBeNull();
  });

  it("un costo annullato si ripristina", async () => {
    stato.rpc.costo_annullo_anteprima = anteprima({ annullato: true, annullato_il: "2026-11-16T08:00:00Z", annullato_motivo: "Bolletta doppia" });
    avvolgi(<AnnullaCostoDialog costId="c1" open onOpenChange={() => {}} />);
    expect(await screen.findByText(/Motivo: Bolletta doppia/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ripristina/ }));
    await waitFor(() => expect(stato.chiamate.some((c) => c.nome === "costo_ripristina")).toBe(true));
  });
});

describe("Costi → Utenze: il costo della bolletta scartata", () => {
  it("compare finché non è annullato, col pulsante «Annulla costo» e il motivo già scritto", async () => {
    stato.righe = {
      utenze: [{ id: "u1", tipo: "luce", codice: "IT001E02621799", fornitore_nome: "Energia", indirizzo_fornitura: null, numero_contratto: null }],
      bollette: [
        { id: "b1", numero: "FT-9", data: "2026-10-05", stato: "scartata", costo_esito: "sospesa", fattura_ricevuta_id: "f1", avvisi: [{ codice: "scartata", testo: "Scartata", costo_id: "c9" }] },
        { id: "b2", numero: "FT-10", data: "2026-10-06", stato: "scartata", costo_esito: "sospesa", fattura_ricevuta_id: "f2", avvisi: [{ codice: "scartata", testo: "Scartata", costo_id: "c10" }] },
      ],
      company_costs: [{ id: "c9", name: "Luce ottobre", amount: 120, annullato_il: null }, { id: "c10", name: "Luce novembre", amount: 99, annullato_il: "2026-11-16" }],
    };
    stato.rpc.costo_annullo_anteprima = anteprima();
    avvolgi(<UtenzeTab />);
    expect(await screen.findByText(/costo «Luce ottobre»/)).toBeTruthy();
    expect(screen.queryByText(/costo «Luce novembre»/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annulla costo" }));
    expect(((await screen.findByLabelText("Motivo")) as HTMLTextAreaElement).value).toMatch(/scartata/);
  });
});

describe("Impostazioni → Automazioni: soglie", () => {
  it("mostra i valori, rifiuta quelli fuori dai limiti e salva", async () => {
    stato.rpc.azienda_soglie_automazioni = { banca_differenza_max: 1, acquisti_quantita_toll_perc: 0, acquisti_prezzo_toll_perc: 0.5, acquisti_prezzo_toll_cent: 2 };
    avvolgi(<SoglieCollegamentiCard companyId="az" puoModificare />);
    const banca = (await screen.findByLabelText("Banca: differenza ammessa")) as HTMLInputElement;
    expect(banca.value).toBe("1");
    expect(screen.getByText("Solo proposta")).toBeTruthy();
    fireEvent.change(banca, { target: { value: "80" } });
    expect(screen.getByText("Da 0 a 50.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salva le soglie" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(banca, { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva le soglie" }));
    await waitFor(() => expect(stato.upsert[0]).toMatchObject({ company_id: "az", banca_differenza_max: 2.5, acquisti_prezzo_toll_perc: 0.5 }));
  });

  it("chi non è amministratore vede e non cambia", async () => {
    stato.rpc.azienda_soglie_automazioni = {};
    avvolgi(<SoglieCollegamentiCard companyId="az" puoModificare={false} />);
    expect(((await screen.findByLabelText("Acquisti: prezzo")) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Salva le soglie" })).toBeNull();
  });
});

describe("Contabilità → Da verificare", () => {
  it("una riga per anomalia, un pulsante per documento", async () => {
    stato.rpc.cdg_da_verificare = [
      { chiave: "a", controllo: "documento_oltre_totale", ids: ["f1"], importo: 7333.37, descrizione: "Fattura 12: incassati…", cosa_fare: "Incassato il lordo", documenti: [{ tipo: "fattura_emessa", id: "f1", titolo: "Fattura 12", origine: "importata" }] },
      { chiave: "b", controllo: "scadenza_e_rata_sullo_stesso_costo", ids: ["c1"], importo: 335.4, descrizione: "Costo con…", cosa_fare: "Tenere un solo calendario", documenti: [{ tipo: "costo", id: "c1", titolo: "Costo «X»" }] },
    ];
    avvolgi(<DaVerificareCard companyId="az" />);
    expect(await screen.findByText("Da verificare (2)")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Apri la fattura/ }).getAttribute("href")).toBe("/azienda/documenti/importata/f1");
    expect(screen.getByRole("link", { name: /Apri il costo/ }).getAttribute("href")).toBe("/azienda/costi?costo=c1");
  });

  it("senza permesso o senza anomalie non c'è", async () => {
    stato.errori.cdg_da_verificare = { message: "no", code: "42501" };
    const { container } = avvolgi(<DaVerificareCard companyId="az" />);
    await waitFor(() => expect(stato.chiamate.length).toBe(1));
    expect(container.textContent).toBe("");
  });
});
