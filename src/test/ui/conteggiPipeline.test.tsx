import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useConteggiPipeline } from "@/hooks/useConteggiPipeline";
import type { OrderWithDetails } from "@/lib/orderUtils";
import { invalidateOfficeWorkspace } from "@/lib/orders/officeWorkspace";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";

const db = vi.hoisted(() => ({ filtra: vi.fn(), ordini: vi.fn(), leggi: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (tabella: string) => {
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => { db.filtra(tabella, ...args); return query; },
      in: (...args: unknown[]) => { db.ordini(tabella, ...args); return query; },
      order: () => query,
      range: () => ({ abortSignal: () => db.leggi(tabella) }),
    };
    return query;
  } },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("conta fasi e task d’ufficio per commessa e aggiorna entrambi dopo le modifiche", async () => {
  const ordini = [{ id: "bagno" }, { id: "appartamento" }] as OrderWithDetails[];
  const fasi = [
    { order_id: "appartamento", status: "completata", percentuale: 0 },
    { order_id: "appartamento", status: "in_corso", percentuale: 100 },
    { order_id: "appartamento", status: "in_corso", percentuale: 50 },
  ];
  const task = [
    { order_id: "appartamento", status: "completata" },
    { order_id: "appartamento", status: "in_attesa" },
  ];
  db.leggi.mockImplementation(async tabella => ({ data: tabella === "tasks" ? task : fasi, error: null }));
  const client = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useConteggiPipeline("azienda", ordini, true), { wrapper });
  expect(result.current).toBe(ordini);
  await waitFor(() => expect(result.current[1]).toMatchObject({
    fasiPipeline: { total: 3, done: 2 },
    taskUfficioPipeline: { total: 2, done: 1 },
  }));
  expect(result.current[0]).toMatchObject({
    fasiPipeline: { total: 0, done: 0 },
    taskUfficioPipeline: { total: 0, done: 0 },
  });
  expect(db.filtra).toHaveBeenCalledWith("order_work_phases", "company_id", "azienda");
  expect(db.filtra).toHaveBeenCalledWith("tasks", "company_id", "azienda");
  expect(db.filtra).toHaveBeenCalledWith("tasks", "activity_scope", "ufficio");
  expect(db.ordini).toHaveBeenCalledWith("tasks", "order_id", ["appartamento", "bagno"]);

  fasi[2].status = "completata";
  task[1].status = "completata";
  act(() => {
    refreshWorkQueries(client, "appartamento", "azienda", { leggero: true });
    invalidateOfficeWorkspace(client, "appartamento");
  });
  await waitFor(() => expect(result.current[1]).toMatchObject({
    fasiPipeline: { total: 3, done: 3 },
    taskUfficioPipeline: { total: 2, done: 2 },
  }));
  client.clear();
});
