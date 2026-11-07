import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useManualTreasury } from "@/hooks/useManualTreasury";

const db = vi.hoisted(() => ({ writes: [] as Array<{ method: string; value: unknown }>, error: null as Error | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = {
    select: () => q, eq: () => q, order: () => q, in: () => q,
    insert: (value: unknown) => { db.writes.push({ method: "insert", value }); return q; },
    update: (value: unknown) => { db.writes.push({ method: "update", value }); return q; },
    then: (resolve: (value: { data: never[]; error: Error | null }) => unknown) => Promise.resolve({ data: [] as never[], error: db.error }).then(resolve),
  }; return q;
} } }));
beforeEach(() => { db.writes = []; db.error = null; });
afterEach(cleanup);
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return renderHook(useManualTreasury, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
const tx = { account_id: "cassa", booking_date: "2026-11-05", description: "Prova", amount: 1, counterparty_name: " Cliente " };
it.each([1, -1])("scrive i campi sorgente per un movimento di %s euro", async (amount) => {
  const { result } = open();
  await act(async () => { await result.current.upsertTx.mutateAsync({ ...tx, amount }); });
  expect(db.writes[0].value).toMatchObject({ creditor_name: amount < 0 ? "Cliente" : null, debtor_name: amount >= 0 ? "Cliente" : null });
  expect(db.writes[0].value).not.toHaveProperty("counterparty_name");
});
it("azzera la controparte del verso precedente quando aggiorna il movimento", async () => {
  const { result } = open();
  await act(async () => { await result.current.upsertTx.mutateAsync({ ...tx, id: "esistente", amount: -1 }); });
  expect(db.writes[0]).toMatchObject({ method: "update", value: { creditor_name: "Cliente", debtor_name: null } });
  expect(db.writes[0].value).not.toHaveProperty("counterparty_name");
});
it("importa entrate e uscite senza scrivere colonne generate", async () => {
  const { result } = open();
  await act(async () => { await result.current.bulkInsert.mutateAsync({ account_id: "cassa", source: "import_csv", rows: [tx, { ...tx, amount: -1 }] }); });
  expect(db.writes[0].value).toEqual([
    expect.objectContaining({ debtor_name: "Cliente", creditor_name: null }),
    expect.objectContaining({ debtor_name: null, creditor_name: "Cliente" }),
  ]);
  for (const row of db.writes[0].value as object[]) expect(row).not.toHaveProperty("counterparty_name");
});
it("non sovrascrive il saldo se la lettura dei movimenti fallisce", async () => {
  const { result } = open(); db.error = new Error("Lettura fallita");
  await act(async () => { await expect(result.current.updateAccount.mutateAsync({ id: "cassa", opening_balance: 10 })).rejects.toThrow("Lettura fallita"); });
  expect(db.writes).toEqual([]);
});
