import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  company: "company" as string | null,
  user: "me" as string | null,
  calendar: true,
  orders: true,
  payments: true,
  people: true,
  team: true,
  restricted: false,
  assigned: false,
  loading: false,
  cached: undefined as unknown,
  unassignedPunches: false,
  options: [] as {
    enabled: boolean;
    queryKey: unknown[];
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  }[],
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: state.company ? { id: state.company } : null,
    user: state.user ? { id: state.user } : null,
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCalendar: state.calendar,
    canViewOrders: state.orders,
    canViewScadenzario: state.payments,
    canViewPersone: state.people,
    isAdmin: state.team,
    canViewAllTeamCalendar: state.team,
    onlyAssigned: state.restricted,
    isLoading: state.loading,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: (typeof state.options)[number]) => {
    state.options.push(q);
    return { ...q, data: state.cached };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      let select = "";
      const result = (): { error: null; data: unknown } => ({
        error: null,
        data:
          table === "orders"
            ? select.startsWith("id,")
              ? {
                  id: "order",
                  assigned_to: state.assigned ? "me" : "other",
                  capomastro_user_id: null as string | null,
                }
              : {
                  total_amount: 1000,
                  vat_rate: 22,
                  financing_cost: 0,
                  payment_type: null,
                }
            : table === "company_pagamenti_settings"
              ? { sal_matura_quando: "emesso" }
              : table === "campo_timbrature" && state.unassignedPunches
                ? [
                    {
                      id: "null-user-punch",
                      user_id: null as string | null,
                      timestamp_evento: "2026-09-25T07:00:00Z",
                    },
                  ]
                : [],
      });
      for (const method of [
        "select",
        "eq",
        "is",
        "in",
        "gte",
        "lt",
        "limit",
        "order",
        "range",
        "abortSignal",
        "overrideTypes",
      ]) {
        b[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args });
          if (method === "select") select = String(args[0]);
          return b;
        };
      }
      b.maybeSingle = () => b;
      b.single = () => b;
      b.then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return b;
    },
  },
}));
import {
  useCalendarOrderFinance,
  useCalendarOrderPresence,
} from "@/hooks/useCalendarOrderDetails";
const run = () =>
  state.options.at(-1)!.queryFn({ signal: new AbortController().signal });
beforeEach(() => {
  Object.assign(state, {
    company: "company",
    user: "me",
    calendar: true,
    orders: true,
    payments: true,
    people: true,
    team: true,
    restricted: false,
    assigned: false,
    loading: false,
    cached: undefined,
    unassignedPunches: false,
    options: [],
    calls: [],
  });
});
describe("Dettagli calendario: permessi, account e commessa", () => {
  it("senza accesso agli incassi non legge tabelle finanziarie e nasconde dati in cache", async () => {
    state.payments = false;
    state.cached = { collected: 1234 };
    const q = useCalendarOrderFinance("order");
    expect(q.allowed).toBe(false);
    expect(q.data).toBeUndefined();
    await expect(run()).rejects.toThrow("Incassi non accessibili");
    expect(state.calls).toEqual([]);
  });
  it("il ruolo limitato alle proprie commesse deve avere un'assegnazione prima di leggere SAL o rate", async () => {
    state.restricted = true;
    useCalendarOrderFinance("order");
    await expect(run()).rejects.toThrow("Commessa non assegnata");
    expect(
      state.calls.some(
        (c) => c.table === "sal_records" || c.table === "v_rate_commessa_stato",
      ),
    ).toBe(false);
  });
  it("le letture finanziarie sono circoscritte ad azienda, utente e ordine", async () => {
    state.restricted = true;
    state.assigned = true;
    useCalendarOrderFinance("order");
    await run();
    expect(state.options.at(-1)!.queryKey).toEqual([
      "calendar-order-finance-v1",
      "company",
      "me",
      "order",
      true,
    ]);
    for (const table of [
      "sal_records",
      "v_rate_commessa_stato",
      "ordini_variazione",
      "orders",
    ])
      expect(
        state.calls.some(
          (c) =>
            c.table === table &&
            c.method === "eq" &&
            c.args[0] === "company_id" &&
            c.args[1] === "company",
        ),
      ).toBe(true);
    expect(
      state.calls.some(
        (c) =>
          c.table === "order_installments" &&
          c.method === "eq" &&
          c.args[0] === "order.company_id",
      ),
    ).toBe(true);
  });
  it("anche l'amministratore nel calendario personale vede soltanto le proprie timbrature", async () => {
    const q = useCalendarOrderPresence("order", "2026-09-29", "personal");
    expect(q.team).toBe(false);
    await run();
    expect(
      state.calls.some(
        (c) =>
          c.table === "campo_timbrature" &&
          c.method === "in" &&
          c.args[0] === "user_id" &&
          JSON.stringify(c.args[1]) === '["me"]',
      ),
    ).toBe(true);
    expect(
      state.calls.some(
        (c) =>
          c.table === "campo_timbrature" &&
          c.method === "eq" &&
          c.args[0] === "order_id",
      ),
    ).toBe(false);
  });
  it("senza accesso alle persone la vista team delle presenze resta personale", () => {
    state.people = false;
    expect(useCalendarOrderPresence("order", "2026-09-29", "team").team).toBe(
      false,
    );
  });
  it("logout o permessi in caricamento bloccano i dettagli e i valori già memorizzati", async () => {
    state.user = null;
    state.cached = [{ name: "Privato" }];
    const q = useCalendarOrderPresence("order", "2026-09-29", "team");
    expect(q.allowed).toBe(false);
    expect(q.data).toBeUndefined();
    await expect(run()).rejects.toThrow("Presenze non accessibili");
    expect(state.calls).toEqual([]);
  });
  it("le timbrature con utente cancellato vengono segnalate senza inviare UUID null al database", async () => {
    state.unassignedPunches = true;
    useCalendarOrderPresence("order", "2026-09-25", "team");
    const result = await run();
    expect(result).toEqual({ people: [], unassignedCount: 1 });
    expect(
      state.calls.some((c) => c.method === "in" && c.args[0] === "user_id"),
    ).toBe(false);
  });
});
