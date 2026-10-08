import { describe, expect, it } from "vitest";
import { verifiedActionPermission } from "../../../supabase/functions/_shared/silvioActionPermission";

const permission = {
  mode: "require_confirmation", risk_level: "yellow", allowed_roles: ["company_admin"],
  requires_company_admin: false, requires_strong_confirmation: false,
  daily_limit_reached: false, daily_executions: 0, max_daily_executions: null as number | null,
};

describe("legacy Silvio actions fail closed", () => {
  it("accepts the actual RPC contract", () => {
    expect(verifiedActionPermission(permission, null)).toEqual(permission);
  });
  it("never uses fallback permissions after an RPC error, even with cached data", () => {
    expect(() => verifiedActionPermission(permission, { message: "offline" })).toThrow("Nessuna azione eseguita");
  });
  it.each([null, undefined, [], "ok", {}, { ...permission, mode: "unknown" },
    { ...permission, allowed_roles: null }, { ...permission, allowed_roles: [1] },
    { ...permission, requires_company_admin: "false" }, { ...permission, risk_level: null },
    { ...permission, daily_executions: -1 }, { ...permission, max_daily_executions: Infinity },
    { ...permission, daily_limit_reached: undefined },
  ])("denies missing or malformed policy %#", (raw) => {
    expect(() => verifiedActionPermission(raw, null)).toThrow("verificare i permessi");
  });
  it("preserves an explicit empty role allowlist rather than restoring defaults", () => {
    expect(verifiedActionPermission({ ...permission, allowed_roles: [] }, null).allowed_roles).toEqual([]);
  });
  it("preserves a disabled action and zero daily allowance", () => {
    expect(verifiedActionPermission({ ...permission, mode: "disabled", max_daily_executions: 0, daily_limit_reached: true }, null))
      .toMatchObject({ mode: "disabled", max_daily_executions: 0, daily_limit_reached: true });
  });
  it("does not trust an inconsistent daily-limit flag", () => {
    expect(verifiedActionPermission({ ...permission, max_daily_executions: 2, daily_executions: 2 }, null).daily_limit_reached).toBe(true);
  });
});
