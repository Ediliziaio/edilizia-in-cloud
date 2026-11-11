// Imposte dell'esercizio in Fine anno (11/11/2026): acconti dagli F24, registrazione, conti mancanti.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ rpc: [] as Array<Record<string, unknown>>, mancanti: [] as string[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const q: Record<string, unknown> = {}; for (const k of ["select", "eq", "order"]) q[k] = () => q; q.then = (r: (x: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r); return q; },
  rpc: async (_fn: string, args: Record<string, unknown>) => {
    m.rpc.push(args);
    return { data: { ires: null as number | null, irap: null as number | null, acconti: 6500, acconti_usati: 0, da_versare: 0, a_credito: 6500,
      registrata: false, da_aggiornare: false, conti_mancanti: m.mancanti }, error: null as null };
  },
} }));

import { ImposteFineAnno } from "@/components/contabilita/ImposteFineAnno";

const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ImposteFineAnno companyId="az" anno={2026} chiuso={false} />
  </QueryClientProvider>,
);
beforeEach(() => { m.rpc = []; m.mancanti = []; });
afterEach(cleanup);

it("mostra gli acconti versati e registra IRES e IRAP scritte", async () => {
  disegna();
  expect(await screen.findByText("6.500,00 €")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra le imposte" })).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("IRES di competenza"), { target: { value: "9.000,00" } });
  fireEvent.change(screen.getByLabelText("IRAP di competenza"), { target: { value: "2000" } });
  expect(screen.getByText(/Saldo da versare: 4\.500,00 €/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra le imposte" }));
  await waitFor(() => expect(m.rpc.find((a) => a.p_anteprima === false)).toEqual({ p_company: "az", p_anno: 2026, p_anteprima: false, p_ires: 9000, p_irap: 2000 }));
});

it("senza i conti chiede quali usare e non registra", async () => {
  m.mancanti = ["50.01", "13.13"];
  disegna();
  expect(await screen.findByRole("combobox", { name: /Conto per: Imposte sul reddito/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("IRES di competenza"), { target: { value: "100" } });
  expect(screen.getByRole("button", { name: "Registra le imposte" })).toHaveProperty("disabled", true);
});
