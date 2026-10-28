import { describe, expect, it } from "vitest";
import {
  readAutomationCustomField,
  resolveAutomationCustomConfig,
  writeAutomationCustomField,
} from "../../../supabase/functions/_shared/automationCustomFields";
import { authorizeAutomationTrigger } from "../../../supabase/functions/_shared/automationTriggerAccess";
import {
  customFieldId,
  customFilterType,
} from "../../../supabase/functions/_shared/automationFieldContract";
const A = "11111111-1111-4111-8111-111111111111",
  R = "33333333-3333-4333-8333-333333333333",
  F = "44444444-4444-4444-8444-444444444444",
  FLOW = "66666666-6666-4666-8666-666666666666";
type Call = { table: string; steps: any[][] };
function fixture(
  options: {
    def?: Record<string, any> | null;
    value?: unknown;
    parent?: boolean;
    ack?: boolean;
    readError?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  let stored = options.value ?? "0";
  const def: Record<string, any> | null = options.def === null ? null : {
    id: F,
    company_id: A,
    object_type: "contact",
    name: "Budget",
    field_type: "number",
    options: [],
    ...options.def,
  };
  const db = {
    calls,
    setValue: (v: unknown) => {
      stored = v;
    },
    rpc: async (
      name: string,
      args: any,
    ): Promise<{ data: string | null; error: null }> => {
      calls.push({ table: name, steps: [["rpc", args]] });
      return { data: options.ack === false ? null : F, error: null };
    },
    from(table: string) {
      const steps: any[][] = [];
      const chain: any = new Proxy({}, {
        get(_, key) {
          if (key === "then") {
            return (ok: any) => {
              calls.push({ table, steps });
              const valueTable = table.endsWith("field_values");
              return Promise.resolve({
                data: table === "marketing_custom_fields"
                  ? def
                  : valueTable
                  ? { value: stored }
                  : options.parent === false
                  ? null
                  : { id: R, company_id: A },
                error: options.readError ? { message: "read failed" } : null,
              }).then(ok);
            };
          }
          return (...args: any[]) => {
            steps.push([key, ...args]);
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return db;
}
const queue = {
  entity_type: "contact",
  enrollment_id: FLOW,
  context_json: { payload: {} },
};
describe("custom field contract in worker", () => {
  it.each([
    ["currency", "number"],
    ["percent", "number"],
    ["checkbox", "boolean"],
    ["multiselect", "tags"],
    ["radio", "select"],
  ])(
    "type %s → %s",
    (type, expected) => expect(customFilterType(type)).toBe(expected),
  );
  it("uses stable destinations only", () => {
    expect(customFieldId(`cf:${F}`)).toBe(F);
    expect(customFieldId("cf:bad")).toBeNull();
  });
  it.each([["number", "0", "0"], ["checkbox", "false", false], [
    "multiselect",
    '["A"]',
    ["A"],
  ]])("reads typed %s", async (type, value, expected) => {
    const db = fixture({ def: { field_type: type }, value });
    expect(await readAutomationCustomField(db, A, R, queue, F)).toEqual(
      expected,
    );
    expect(db.calls[0].steps).toContainEqual(["eq", "company_id", A]);
  });
  it.each([{ def: null }, { def: { company_id: "other" } }, { parent: false }, {
    readError: true,
  }])("rejects unavailable context %j", async (options) => {
    const db = fixture(options);
    await expect(writeAutomationCustomField(db, A, R, queue, "contacts", F, 0))
      .rejects.toThrow();
    expect(db.calls.some((c) => c.table === "automation_write_custom_field"))
      .toBe(false);
  });
  it.each([["number", 0, "0"], ["checkbox", false, "false"], [
    "number",
    "12,50",
    "12.5",
  ], ["multiselect", ["A"], '["A"]']])(
    "writes %s atomically without losing %j",
    async (type, value, expected) => {
      const db = fixture({ def: { field_type: type, options: ["A"] } });
      expect(
        (await writeAutomationCustomField(
          db,
          A,
          R,
          queue,
          "contacts",
          F,
          value,
        )).success,
      ).toBe(true);
      expect(db.calls.at(-1)?.steps[0][1]).toMatchObject({
        p_company: A,
        p_entity_id: R,
        p_field_id: F,
        p_value: expected,
        p_enrollment_id: FLOW,
      });
    },
  );
  it.each([
    ["percent", 101],
    ["number", "oops"],
    ["select", "X"],
    ["multiselect", ["X"]],
    ["date", "2026-02-30"],
    ["file", "file.pdf"],
  ])("rejects invalid %s before any write", async (type, value) => {
    const db = fixture({ def: { field_type: type, options: ["A"] } });
    await expect(
      writeAutomationCustomField(db, A, R, queue, "contacts", F, value),
    ).rejects.toThrow();
    expect(db.calls.some((c) => c.table === "automation_write_custom_field"))
      .toBe(false);
  });
  it("requires acknowledgement and checks selected object", async () => {
    await expect(
      writeAutomationCustomField(
        fixture({ ack: false }),
        A,
        R,
        queue,
        "contacts",
        F,
        0,
      ),
    ).rejects.toThrow(/confermato/);
    await expect(
      writeAutomationCustomField(fixture(), A, R, queue, "orders", F, 0),
    ).rejects.toThrow(/entità/);
  });
  it("hydrates from current storage, not the old event, and caches per action", async () => {
    const db = fixture();
    const token = `{{contact.custom_${F.replaceAll("-", "")}}}`;
    expect(
      await resolveAutomationCustomConfig(
        db,
        { title: token, nested: [token] },
        A,
        R,
        queue,
      ),
    ).toEqual({ title: "0", nested: ["0"] });
    expect(db.calls.filter((c) => c.table === "marketing_contact_field_values"))
      .toHaveLength(1);
    db.setValue("20");
    expect(
      (await resolveAutomationCustomConfig(db, { title: token }, A, R, queue))
        .title,
    ).toBe("20");
  });
  it("fails explicitly when a required custom variable is absent", async () => {
    await expect(
      resolveAutomationCustomConfig(
        fixture({ value: "" }),
        { text: `{{custom_field.${F}}}` },
        A,
        R,
        queue,
      ),
    ).rejects.toThrow(/Manca/);
  });
  it("preserves literal replacement characters and rejects a wrong prefix", async () => {
    const db = fixture({ def: { field_type: "text" }, value: "$& $1" });
    expect(
      (await resolveAutomationCustomConfig(
        db,
        { text: `{{custom_field.${F}}}` },
        A,
        R,
        queue,
      )).text,
    ).toBe("$& $1");
    await expect(
      resolveAutomationCustomConfig(
        db,
        { text: `{{order.custom_${F.replaceAll("-", "")}}}` },
        A,
        R,
        queue,
      ),
    ).rejects.toThrow(/altro oggetto/);
  });
});
describe("manual trigger authorization, no network or writes", () => {
  const body = {
    company_id: A,
    flow_id: FLOW,
    entity_id: R,
    entity_type: "contact",
    trigger_event: "contatto_creato",
    payload: {
      email: "fake",
      arretrato: true,
      legacy_events: ["payment_received"],
    },
  };
  function access(
    patch: {
      permission?: boolean;
      readonly?: boolean;
      blocked?: boolean;
      missing?: boolean;
      rpcError?: boolean;
    } = {},
  ) {
    const reads: Call[] = [];
    const userDb = {
      rpc: async (name: string) => ({
        data: name === "utente_bloccato"
          ? patch.blocked ?? false
          : patch.readonly ?? false,
        error: patch.rpcError ? { message: "fail" } : null,
      }),
      from(table: string) {
        const steps: any[][] = [];
        const q: any = new Proxy({}, {
          get(_, k) {
            if (k === "then") {
              return (ok: any) => {
                reads.push({ table, steps });
                return Promise.resolve({
                  data: patch.missing
                    ? null
                    : table === "automation_flows"
                    ? { id: FLOW }
                    : { id: R, email: "real@example.invalid" },
                  error: null,
                }).then(ok);
              };
            }
            if (!["select", "eq", "is", "maybeSingle"].includes(String(k))) {
              throw Error("WRITE FORBIDDEN");
            }
            return (...a: any[]) => {
              steps.push([k, ...a]);
              return q;
            };
          },
        });
        return q;
      },
    };
    const admin = {
      rpc: async (): Promise<{ data: boolean; error: null }> => ({
        data: patch.permission ?? true,
        error: null,
      }),
    };
    return { admin, userDb, reads };
  }
  it.each([{ permission: false }, { readonly: true }, { blocked: true }, {
    missing: true,
  }, { rpcError: true }])("denies %j", async (patch) => {
    const { admin, userDb } = access(patch);
    await expect(authorizeAutomationTrigger(admin, userDb, "user", body))
      .rejects.toMatchObject({ status: 403 });
  });
  it.each([{ trigger_event: "payment_received" }, { entity_type: "invoice" }, {
    flow_id: "",
  }])("denies forged event/context %j", async (patch) => {
    const { admin, userDb } = access();
    await expect(
      authorizeAutomationTrigger(admin, userDb, "user", { ...body, ...patch }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("scopes to the published flow and rebuilds event data under caller RLS", async () => {
    const { admin, userDb, reads } = access();
    const result = await authorizeAutomationTrigger(
      admin,
      userDb,
      "user",
      body,
    );
    expect(result.manual_flow_id).toBe(FLOW);
    expect(result.payload.email).toBe("real@example.invalid");
    expect(result.payload.arretrato).toBeUndefined();
    expect(result.payload.legacy_events).toBeUndefined();
    expect(reads[0].steps).toContainEqual(["eq", "status", "published"]);
    expect(reads[1].steps).toContainEqual(["eq", "company_id", A]);
  });
});
