// Ratei e risconti al 31/12 nella contabilità generale (11/11/2026): elenco, quota a giorni, registrazione, conti mancanti.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  cancellati: [] as string[],
  mancanti: [] as string[],
  daAggiornare: false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    let id = "";
    for (const k of ["select", "order", "delete", "insert"]) q[k] = () => q;
    q.eq = (col: string, v: string) => { if (col === "id") id = v; return q; };
    q.then = (r: (x: unknown) => unknown) => {
      if (id) m.cancellati.push(id);
      return Promise.resolve({ data: [{ id: "c-ass", codice: "5530000160", descrizione: "ASSICURAZIONI", natura: "costo" }], error: null }).then(r);
    };
    return q;
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    m.rpc.push({ fn, args });
    return { data: {
      voci: [{ id: "v1", tipo: "risconto_attivo", descrizione: "Assicurazione furgone", conto: "5530000160 ASSICURAZIONI",
        importo: 1200, dal: "2026-10-01", al: "2027-09-30", quota: 897.53 }],
      totale: 897.53, registrata: true, da_aggiornare: m.daAggiornare && Boolean(args.p_anteprima), conti_mancanti: m.mancanti,
    }, error: null as null };
  },
} }));

import { RateiRiscontiFineAnno, leggiEsitoRateiRisconti } from "@/components/contabilita/RateiRiscontiFineAnno";

const disegna = (chiuso = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RateiRiscontiFineAnno companyId="az" anno={2026} chiuso={chiuso} />
  </QueryClientProvider>,
);
beforeEach(() => { m.rpc = []; m.cancellati = []; m.mancanti = []; m.daAggiornare = false; });
afterEach(cleanup);

it("mostra la voce con la quota calcolata e registra al 31/12", async () => {
  disegna();
  expect(await screen.findByText("Assicurazione furgone")).toBeTruthy();
  expect(screen.getByText("01/10/2026 – 30/09/2027")).toBeTruthy();
  expect(screen.getByText("897,53 €")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra ratei e risconti" }));
  await waitFor(() => expect(m.rpc.find((c) => c.args.p_anteprima === false)?.args).toEqual({ p_company: "az", p_anno: 2026, p_anteprima: false }));
});

it("toglie una voce dell'azienda", async () => {
  disegna();
  fireEvent.click(await screen.findByRole("button", { name: "Togli Assicurazione furgone" }));
  await waitFor(() => expect(m.cancellati).toEqual(["v1"]));
});

it("senza il conto dei risconti attivi chiede quale usare e non registra", async () => {
  m.mancanti = ["07.02"];
  disegna();
  expect(await screen.findByText(/Indica quali conti del tuo piano usare/)).toBeTruthy();
  expect(screen.getByRole("combobox", { name: /Conto per: Risconti attivi/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra ratei e risconti" })).toHaveProperty("disabled", true);
});

it("a esercizio chiuso non si aggiunge né si toglie niente", async () => {
  disegna(true);
  expect(await screen.findByText("Assicurazione furgone")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Aggiungi" })).toBeNull();
  expect(screen.getByRole("button", { name: "Togli Assicurazione furgone" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Registra ratei e risconti" })).toHaveProperty("disabled", true);
});

it("dice quando l'elenco è cambiato dopo la registrazione", async () => {
  m.daAggiornare = true;
  disegna();
  expect(await screen.findByText(/Da aggiornare: l'elenco è cambiato/)).toBeTruthy();
});

it("legge una risposta incompleta senza rompersi", () => {
  expect(leggiEsitoRateiRisconti(null)).toEqual({ voci: [], totale: 0, registrata: false, da_aggiornare: false, conti_mancanti: [] });
  expect(leggiEsitoRateiRisconti({ voci: [{ tipo: "boh", quota: "12.5" }] }).voci[0]).toEqual(expect.objectContaining({ tipo: "risconto_attivo", quota: 12.5 }));
});
