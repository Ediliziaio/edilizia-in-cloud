import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const roles = vi.hoisted(() => vi.fn());
vi.mock("../../../supabase/functions/_shared/amministraAzienda", () => ({ ruoliNellAzienda: roles }));
import { resolveIdentity } from "../../../supabase/functions/whatsapp-ai-processor/identity";
beforeEach(() => roles.mockReset().mockResolvedValue(["employee"]));
const employee = { id: "employee", user_id: "user", phone: "+393331234567", phone_whatsapp: null as string | null, first_name: "Test", last_name: "Fixture" };
function db(employees: unknown[], profiles: unknown[], error = false) {
  return { from: (table: string) => {
    const result = { data: table === "employees" ? employees : profiles, error: error ? { message: "offline" } : null };
    const q = { select: () => q, eq: () => q, not: () => q, then: (done: (value: unknown) => void) => Promise.resolve(result).then(done) };
    return q;
  } } as unknown as SupabaseClient;
}
describe("Identity ambiguity and revocation", () => {
  it("does not choose one of two employees sharing the phone", async () => {
    expect((await resolveIdentity(db([employee, { ...employee, id: "other" }], []), "393331234567", "company")).matched).toBe(false);
    expect(roles).not.toHaveBeenCalled();
  });
  it("does not grant worker rights to a revoked or blocked account", async () => {
    roles.mockResolvedValue([]);
    expect((await resolveIdentity(db([employee], []), "393331234567", "company")).role_grants).toEqual([]);
  });
  it("rejects conflicting ownership in employee and profile records", async () => {
    expect((await resolveIdentity(db([employee], [{ id: "other-user", phone: employee.phone }]), "393331234567", "company")).matched).toBe(false);
  });
  it("recognizes an active worker and keeps employee and account IDs distinct", async () => {
    expect(await resolveIdentity(db([employee], [{ id: "user", phone: employee.phone }]), "393331234567", "company"))
      .toMatchObject({ matched: true, kind: "operaio", user_id: "user", employee_id: "employee" });
  });
  it("does not fall through to customer routing after database failure", async () => {
    await expect(resolveIdentity(db([], [], true), "393331234567", "company")).rejects.toThrow("lookup_unavailable");
  });
});
