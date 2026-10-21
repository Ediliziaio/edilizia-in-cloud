import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  company: "company" as string | null,
  user: "me" as string | null,
  calendar: true,
  orders: true,
  loading: false,
  admin: false,
  team: false,
  restricted: false,
  options: [] as {
    queryKey: unknown[];
    enabled: boolean;
    queryFn: (context: { signal: AbortSignal }) => Promise<{ id: string }[]>;
  }[],
  calls: [] as { table: string; method: string; args: unknown[] }[],
  count: 1101,
  failPage: false,
  cached: [] as { id: string }[],
  records: null as Record<string, Record<string, unknown>[]> | null,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: (typeof state.options)[number]) => {
    state.options.push(q);
    return { ...q, data: state.cached };
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: state.company ? { id: state.company } : null,
    user: state.user ? { id: state.user } : null,
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: state.loading,
    canViewCalendar: state.calendar,
    canViewOrders: state.orders,
    isAdmin: state.admin,
    canViewAllTeamCalendar: state.team,
    onlyAssigned: state.restricted,
  }),
}));
vi.mock("@/lib/orders/archivedOrderScope", () => ({
  loadArchivedOrderIds: async () => [] as string[],
  excludeArchivedOrders: (q: unknown) => q,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // calendario_impegni_riservati: gli impegni dei colleghi per chi non vede il CRM.
    rpc: (name: string, args: unknown) => {
      state.calls.push({ table: name, method: "rpc", args: [args] });
      const r: Record<string, unknown> = {
        abortSignal: () => r,
        then: (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
      };
      return r;
    },
    from: (table: string) => {
      let range = [0, 249];
      const filters: { method: string; args: unknown[] }[] = [];
      const b: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "is",
        "not",
        "or",
        "gte",
        "lte",
        "order",
        "range",
        "abortSignal",
        "overrideTypes",
      ])
        b[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args });
          if (method === "range") range = args as number[];
          filters.push({ method, args });
          return b;
        };
      b.then = (ok: (value: unknown) => unknown) => {
        let rows: Record<string, unknown>[] =
          state.records?.[table] ??
          Array.from(
            { length: state.count },
            (_, i): Record<string, unknown> => ({
              id: `${table}-${i}`,
              work_start_date: null,
              work_end_date: null,
              expected_date: null,
              order_employees: [],
              order_external_teams: [],
            }),
          );
        if (state.records)
          for (const f of filters) {
            const [column, value] = f.args as [string, unknown];
            if (f.method === "eq")
              rows = rows.filter((r) => r[column] === value);
            if (f.method === "is")
              rows = rows.filter((r) => (r[column] ?? null) === value);
            if (f.method === "in")
              rows = rows.filter((r) =>
                (value as unknown[]).includes(r[column]),
              );
            if (f.method === "or" && column.startsWith("assigned_to.eq.")) {
              const user = column.split("assigned_to.eq.")[1].split(",")[0];
              rows = rows.filter(
                (r) => r.assigned_to === user || r.capomastro_user_id === user,
              );
            }
            if (f.method === "or" && !column.startsWith("assigned_to.eq.")) {
              const dates = column.match(/\d{4}-\d{2}-\d{2}/g)!;
              const from = [...dates].sort()[0],
                to = [...dates].sort().at(-1)!;
              rows = rows.filter((r) => {
                const start = String(
                    r[
                      table === "order_work_phases"
                        ? "start_date"
                        : "work_start_date"
                    ] ?? "",
                  ),
                  end = String(
                    r[
                      table === "order_work_phases"
                        ? "end_date"
                        : "work_end_date"
                    ] ?? start,
                  );
                return (
                  (!!start && start <= to && end >= from) ||
                  [r.expected_date, r.warehouse_arrival_date].some(
                    (d) => d && String(d) >= from && String(d) <= to,
                  )
                );
              });
            }
          }
        return Promise.resolve({
          data: rows.slice(range[0], range[1] + 1),
          error:
            state.failPage && range[0] >= 250
              ? { message: "Lettura interrotta" }
              : null,
        }).then(ok);
      };
      return b;
    },
  },
}));
import { useWorkCalendarData } from "@/hooks/useWorkCalendarData";
const context = () => ({ signal: new AbortController().signal });
const call = (table: string, method: string, args: unknown[]) =>
  expect(state.calls).toContainEqual({ table, method, args });
beforeEach(() => {
  state.company = "company";
  state.user = "me";
  state.calendar = true;
  state.orders = true;
  state.loading = false;
  state.admin = false;
  state.team = false;
  state.restricted = false;
  state.options = [];
  state.calls = [];
  state.count = 1101;
  state.failPage = false;
  state.cached = [];
  state.records = null;
});
describe("Letture complete del calendario e visibilità", () => {
  it("commesse, appuntamenti e non pianificati leggono oltre mille righe con ordinamento stabile", async () => {
    state.team = true;
    useWorkCalendarData("2026-09-28", "2026-11-01", "team");
    for (const q of state.options)
      expect(await q.queryFn(context())).toHaveLength(1101);
    call("orders", "eq", ["company_id", "company"]);
    call("appointments", "eq", ["company_id", "company"]);
    call("orders", "range", [1000, 1249]);
    call("appointments", "range", [1000, 1249]);
    expect(state.calls.some((c) => c.method === "limit")).toBe(false);
  });
  it("gli appuntamenti restano personali senza permesso team, anche senza only_assigned", async () => {
    useWorkCalendarData("2026-10-01", "2026-10-31");
    await state.options[1].queryFn(context());
    call("appointments", "eq", ["assigned_to", "me"]);
  });
  it.each(["admin", "team"] as const)(
    "%s può leggere gli appuntamenti del team autorizzato",
    async (permission) => {
      state[permission] = true;
      useWorkCalendarData("2026-10-01", "2026-10-31", "team");
      await state.options[1].queryFn(context());
      expect(
        state.calls.some(
          (c) => c.method === "eq" && c.args[0] === "assigned_to",
        ),
      ).toBe(false);
    },
  );
  it("only_assigned resta restrittivo anche se è acceso il calendario team", async () => {
    state.team = true;
    state.restricted = true;
    useWorkCalendarData("2026-10-01", "2026-10-31", "team");
    await state.options[1].queryFn(context());
    call("appointments", "eq", ["assigned_to", "me"]);
  });
  it("la cache separa utenti, aziende e scope personale/team", () => {
    useWorkCalendarData("2026-10-01", "2026-10-31");
    const keys = state.options.map((q) => q.queryKey);
    state.options = [];
    state.user = "other";
    useWorkCalendarData("2026-10-01", "2026-10-31");
    state.options.forEach((q, i) => expect(q.queryKey).not.toEqual(keys[i]));
    state.options = [];
    state.user = "me";
    state.team = true;
    useWorkCalendarData("2026-10-01", "2026-10-31", "team");
    expect(state.options[1].queryKey).not.toEqual(keys[1]);
  });
  it("commesse senza date hanno una lettura separata, libera dal filtro del mese", async () => {
    state.team = true;
    useWorkCalendarData("2026-10-01", "2026-10-31", "team");
    await state.options[2].queryFn(context());
    call("orders", "is", ["expected_date", null]);
    call("orders", "is", ["work_start_date", null]);
    expect(
      state.calls.some((c) => ["or", "gte", "lte"].includes(c.method)),
    ).toBe(false);
  });
  it("le query delle risorse comprendono le fasi e le squadre commessa canoniche", async () => {
    useWorkCalendarData("2026-10-01", "2026-10-31");
    await state.options[0].queryFn(context());
    const selection = state.calls.find(
      (c) =>
        c.method === "select" && String(c.args[0]).includes("order_employees("),
    )?.args[0] as string;
    expect(selection).toContain("squadre_commesse(phase_id,dal,al");
    expect(selection).toContain("order_employees_phase_id_fkey");
    call("orders", "is", ["deleted_at", null]);
  });
  it.each(["company", "user", "calendar", "loading"] as const)(
    "non legge dati se %s manca/non è pronto",
    async (condition) => {
      if (condition === "company" || condition === "user")
        state[condition] = null;
      else if (condition === "loading") state.loading = true;
      else state.calendar = false;
      useWorkCalendarData("2026-10-01", "2026-10-31");
      expect(state.options.every((q) => !q.enabled)).toBe(true);
      await expect(state.options[0].queryFn(context())).rejects.toThrow();
      expect(state.calls).toEqual([]);
    },
  );
  it("non avere accesso alle commesse non impedisce di consultare i propri appuntamenti", () => {
    state.orders = false;
    useWorkCalendarData("2026-10-01", "2026-10-31");
    expect(state.options.map((q) => q.enabled)).toEqual([false, true, false]);
  });
  it("revocare il permesso sulle commesse nasconde subito i dati già cached", () => {
    state.cached = [{ id: "private" }];
    state.orders = false;
    const result = useWorkCalendarData("2026-10-01", "2026-10-31");
    expect(result.orders.data).toBeUndefined();
    expect(result.unplanned.data).toBeUndefined();
    expect(result.appointments.data).toEqual([{ id: "private" }]);
  });
  it("senza accesso al calendario non si presentano neppure i vecchi appuntamenti cached", () => {
    state.cached = [{ id: "private" }];
    state.calendar = false;
    const result = useWorkCalendarData("2026-10-01", "2026-10-31");
    expect(result.appointments.data).toBeUndefined();
    expect(result.orders.data).toBeUndefined();
  });
  it("il calendario personale resta personale anche per un amministratore", async () => {
    state.admin = true;
    state.records = {
      orders: [
        {
          id: "mine",
          company_id: "company",
          assigned_to: "me",
          work_start_date: "2026-10-14",
          work_end_date: "2026-10-15",
        },
        {
          id: "colleague",
          company_id: "company",
          assigned_to: "other",
          work_start_date: "2026-10-14",
          work_end_date: "2026-10-15",
        },
      ],
      order_campo_assignments: [],
      order_work_phases: [],
      appointments: [],
    };
    const result = useWorkCalendarData("2026-10-01", "2026-10-31");
    expect(result.scope).toBe("personal");
    expect(result.teamAppointments).toBe(false);
    expect(
      (await state.options[0].queryFn(context())).map((o) => o.id),
    ).toEqual(["mine"]);
    await state.options[1].queryFn(context());
    call("appointments", "eq", ["assigned_to", "me"]);
    call("order_campo_assignments", "eq", ["user_id", "me"]);
  });
  it("include le commesse personali assegnate tramite Campo e squadre, senza quelle dei colleghi", async () => {
    state.records = {
      orders: [
        {
          id: "campo",
          company_id: "company",
          work_start_date: "2026-10-14",
          work_end_date: "2026-10-15",
        },
        {
          id: "other",
          company_id: "company",
          work_start_date: "2026-10-14",
          work_end_date: "2026-10-15",
        },
      ],
      order_campo_assignments: [
        { id: "link", company_id: "company", user_id: "me", order_id: "campo" },
        {
          id: "other-link",
          company_id: "company",
          user_id: "other",
          order_id: "other",
        },
      ],
      order_work_phases: [],
    };
    useWorkCalendarData("2026-10-01", "2026-10-31", "personal");
    expect(
      (await state.options[0].queryFn(context())).map((o) => o.id),
    ).toEqual(["campo"]);
  });
  it("un utente senza permesso team non può allargare lo scope richiesto", () => {
    const result = useWorkCalendarData("2026-10-01", "2026-10-31", "team");
    expect(result.scope).toBe("personal");
    expect(result.canViewTeam).toBe(false);
  });
  it("carica una lavorazione nel periodo anche se le date generali della commessa sono altrove", async () => {
    state.team = true;
    state.records = {
      orders: [
        {
          id: "outside",
          company_id: "company",
          work_start_date: "2026-11-01",
          work_end_date: "2026-11-30",
          order_work_phases: [
            {
              id: "phase",
              name: "Posa",
              start_date: "2026-10-14",
              end_date: "2026-10-15",
              position: 0,
              status: "da_iniziare",
            },
          ],
        },
      ],
      order_work_phases: [
        {
          id: "phase",
          company_id: "company",
          order_id: "outside",
          start_date: "2026-10-14",
          end_date: "2026-10-15",
        },
      ],
    };
    useWorkCalendarData("2026-10-01", "2026-10-31", "team");
    const rows = await state.options[0].queryFn(context());
    expect(rows.map((o) => o.id)).toEqual(["outside"]);
  });
  it("un errore a metà non produce un calendario parziale presentato come completo", async () => {
    state.failPage = true;
    useWorkCalendarData("2026-10-01", "2026-10-31");
    await expect(state.options[0].queryFn(context())).rejects.toThrow(
      "Lettura interrotta",
    );
  });
});
