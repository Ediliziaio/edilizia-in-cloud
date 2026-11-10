import { act, renderHook, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const m = vi.hoisted(() => ({
  inserti: [] as Array<Record<string, unknown>>,
  tabelle: [] as string[],
  ricevi: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda" } }),
}));
vi.mock("@/lib/orders/riceviResiduoOda", () => ({
  riceviResiduoOda: m.ricevi,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "utente" } } }) },
    from: (tabella: string) => {
      m.tabelle.push(tabella);
      let payload: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        limit: () => chain,
        insert: (p: Record<string, unknown>) => {
          payload = p;
          if (tabella === "ddt_ricezione") m.inserti.push(p);
          return chain;
        },
        single: async () => ({
          data:
            tabella === "ddt_ricezione"
              ? { id: "ddt", ...payload }
              : { id: "magazzino" },
          error: null,
        }),
        maybeSingle: async () => ({ data: { id: "magazzino" }, error: null }),
        then: (resolve: (r: unknown) => void) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import { useDDTRicezioneMutations } from "@/hooks/useDDTRicezione";
beforeEach(() => {
  m.inserti = [];
  m.tabelle = [];
  m.ricevi
    .mockReset()
    .mockResolvedValue({ righe: 1, completo: true, senzaRighe: false });
});
afterEach(cleanup);
function hook() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return renderHook(() => useDDTRicezioneMutations(null), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
const dati = {
  numero_ddt: "SIM",
  data_ricezione: "2026-11-10",
  quantita_ricevuta: 2,
  stato: "ricevuto" as const,
  silenzioso: true,
  purchase_order_id: "oda",
  order_id: "commessa",
};
it("una consegna diretta in cantiere non cerca magazzini e non riceve il residuo dell’OdA", async () => {
  const { result } = hook();
  await act(async () => {
    await result.current.createDDT.mutateAsync({
      ...dati,
      destinazione: "cantiere",
      warehouse_id: "vecchio-magazzino",
    });
  });
  expect(m.ricevi).not.toHaveBeenCalled();
  expect(m.tabelle).not.toContain("warehouses");
  expect(m.inserti[0]).toMatchObject({
    warehouse_id: null,
    order_id: "commessa",
    purchase_order_id: "oda",
    quantita_ricevuta: 2,
    stato: "ricevuto",
    destinazione: "cantiere",
  });
});
it("il solo collegamento documentale conserva le quantità lette senza ricevere l’intero ordine", async () => {
  const { result } = hook();
  await act(async () => {
    await result.current.createDDT.mutateAsync({
      ...dati,
      destinazione: "magazzino",
      warehouse_id: "magazzino",
      soloDocumento: true,
    });
  });
  expect(m.ricevi).not.toHaveBeenCalled();
  expect(m.inserti[0]).toMatchObject({
    quantita_ricevuta: 2,
    stato: "ricevuto",
  });
});
it("il percorso esplicito di ricezione completa in magazzino continua a registrare il residuo", async () => {
  const { result } = hook();
  await act(async () => {
    await result.current.createDDT.mutateAsync({
      ...dati,
      destinazione: "magazzino",
      warehouse_id: "magazzino",
    });
  });
  expect(m.ricevi).toHaveBeenCalledWith(
    expect.objectContaining({ odaId: "oda", warehouseId: "magazzino" }),
  );
  expect(m.inserti[0]).toMatchObject({ quantita_ricevuta: 0, stato: "atteso" });
});
