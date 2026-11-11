// Rimanenze finali al 31/12 nella contabilità generale (11/11/2026): conti scelti una volta, proposta, registrazione.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>, mancanti: [] as string[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.then = (r: (x: unknown) => unknown) => Promise.resolve({ data: [
      { id: "c-lav", codice: "1518000100", descrizione: "LAVORI IN CORSO", natura: "attivo" },
      { id: "c-var", codice: "5530000500", descrizione: "VARIAZIONE LAVORI IN CORSO", natura: "ricavo" },
    ], error: null }).then(r);
    return q;
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    m.rpc.push({ fn, args });
    if (fn === "contabilita_rimanenze") {
      return { data: {
        lavori: { iniziali: 11127.5, finali: args.p_anteprima ? null : args.p_lavori, proposta: 118922.5 },
        materiali: { iniziali: 0, finali: args.p_anteprima ? null : args.p_materiali, proposta: 0 },
        registrata: !args.p_anteprima, conti_mancanti: m.mancanti,
      }, error: null as null };
    }
    return { data: null, error: null as null };
  },
} }));

import { RimanenzeFineAnno } from "@/components/contabilita/RimanenzeFineAnno";

const disegna = (chiuso = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RimanenzeFineAnno companyId="az" anno={2026} chiuso={chiuso} />
  </QueryClientProvider>,
);
beforeEach(() => { m.rpc = []; m.mancanti = []; });
afterEach(cleanup);

it("propone i lavori in corso dalle commesse e li registra al 31/12", async () => {
  disegna();
  const lavori = await screen.findByLabelText("Rimanenze finali: Lavori in corso su ordinazione") as HTMLInputElement;
  expect(lavori.value).toBe("118922.5");
  expect(screen.getByText("11.127,50 €")).toBeTruthy();
  fireEvent.change(lavori, { target: { value: "100.000,00" } });
  fireEvent.click(screen.getByRole("button", { name: "Registra le rimanenze" }));
  // Dopo la registrazione l'anteprima si rilegge: si guarda la chiamata che registra.
  await waitFor(() => expect(m.rpc.find((c) => c.args.p_anteprima === false)?.args).toEqual(expect.objectContaining({ p_company: "az", p_anno: 2026, p_lavori: 100000, p_materiali: 0 })));
});

it("senza i conti chiede quali usare e non registra", async () => {
  m.mancanti = ["04.02", "20.03"];
  disegna();
  expect(await screen.findByText(/Indica quali conti del tuo piano usare/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra le rimanenze" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("combobox", { name: /Conto per: Rimanenze di lavori in corso/ })).toBeTruthy();
});

it("a esercizio chiuso non si cambia niente", async () => {
  disegna(true);
  const lavori = await screen.findByLabelText("Rimanenze finali: Lavori in corso su ordinazione") as HTMLInputElement;
  expect(lavori.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Registra le rimanenze" })).toHaveProperty("disabled", true);
});
