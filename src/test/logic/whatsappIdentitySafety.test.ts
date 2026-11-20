import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const roles = vi.hoisted(() => vi.fn());
vi.mock("../../../supabase/functions/_shared/amministraAzienda", () => ({ ruoliNellAzienda: roles }));
import { resolveIdentity } from "../../../supabase/functions/whatsapp-ai-processor/identity";
beforeEach(() => roles.mockReset().mockResolvedValue(["employee"]));
const employee = { id: "employee", user_id: "user", phone: "+393331234567", phone_whatsapp: null as string | null, first_name: "Test", last_name: "Fixture" };
type IdentityRow = { id: string; phone?: string | null; is_active?: boolean };
function db(employees: IdentityRow[], profiles: IdentityRow[], error = false, solaLettura = false) {
  return { from: (table: string) => {
    const rows = table === "employees" ? employees : profiles;
    const errore = error ? { message: "offline" } : null;
    let limite = rows.length;
    let dopo = "";
    const q = {
      select: () => q, eq: () => q, not: () => q, order: () => q,
      limit: (n: number) => { limite = n; return q; },
      gt: (_colonna: string, id: string) => { dopo = id; return q; },
      maybeSingle: async () => ({ error: errore, data: solaLettura ? { sola_lettura: true } : null }),
      then: (done: (value: unknown) => void) => Promise.resolve({ data: rows.filter(r => r.id > dopo).slice(0, limite), error: errore }).then(done),
    };
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
  it("accepts Italian local and international spellings without matching a foreign number with the same suffix", async () => {
    for (const phone of ["333 1234567", "0039 (333) 123-4567", "+39 333 123 4567"]) {
      expect((await resolveIdentity(db([{ ...employee, phone }], []), "393331234567", "company")).matched).toBe(true);
    }
    expect((await resolveIdentity(db([employee], []), "443331234567", "company")).matched).toBe(false);
  });
  it("checks for duplicate owners across result pages", async () => {
    const righe = Array.from({ length: 250 }, (_, i) => ({ ...employee, id: String(i).padStart(4, "0"), phone: i ? null : employee.phone }));
    expect(await resolveIdentity(db([...righe, { ...employee, id: "0250" }], []), "393331234567", "company"))
      .toMatchObject({ matched: false, negata: true });
  });
  it("does not treat an inactive employee as an authorized profile or customer", async () => {
    expect(await resolveIdentity(db([{ ...employee, is_active: false }], [{ id: "user", phone: employee.phone }]), "393331234567", "company"))
      .toMatchObject({ matched: false, negata: true, role_grants: [] });
  });
  it("does not grant writes to a read-only user", async () => {
    const identity = await resolveIdentity(db([employee], [], false, true), "393331234567", "company");
    expect(identity.solaLettura).toBe(true);
    expect(identity.role_grants).not.toContain("rapportino.write");
    expect(identity.role_grants).not.toContain("ddt.write");
  });
  it("does not fall through to customer routing after database failure", async () => {
    await expect(resolveIdentity(db([], [], true), "393331234567", "company")).rejects.toThrow("lookup_unavailable");
  });
});
