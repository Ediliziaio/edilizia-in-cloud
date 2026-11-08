import { describe, it, expect } from "vitest";
import { resolveEffectiveCompanyId } from "../../../supabase/functions/_shared/effectiveCompany";

type Row = Record<string, unknown>;
function client(tables: Record<string, Row[]>) {
  return { from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { rows = rows.filter(r => r[key] === value); return builder; },
      gt(key: string, value: string) { rows = rows.filter(r => String(r[key]) > value); return builder; },
      order() { return builder; },
      limit(n: number) { rows = rows.slice(0,n); return builder; },
      async maybeSingle() { return { data: rows[0] ?? null }; },
    };
    return builder;
  } };
}
describe("Lettura listini nella società selezionata", () => {
  it("risolve l'azienda aperta dal superadmin senza azienda primaria", async () => {
    expect(await resolveEffectiveCompanyId(client({ active_impersonations: [{ admin_user_id: "admin", target_company_id: "scavolo", expires_at: "2099-01-01" }] }), "admin")).toBe("scavolo");
  });
  it("usa la seconda società di un utente con accesso attivo", async () => {
    expect(await resolveEffectiveCompanyId(client({ profiles: [{ id: "elisanna", company_id: "prima" }], active_company_selection: [{ user_id: "elisanna", company_id: "seconda" }], multi_company_access: [{ user_id: "elisanna", company_id: "seconda", status: "active", expires_at: null }] }), "elisanna")).toBe("seconda");
  });
  it.each(["revoked", "expired"])("non usa un accesso %s", async status => {
    expect(await resolveEffectiveCompanyId(client({ profiles: [{ id: "user", company_id: "prima" }], active_company_selection: [{ user_id: "user", company_id: "seconda" }], multi_company_access: [{ user_id: "user", company_id: "seconda", status: status === "expired" ? "active" : status, expires_at: status === "expired" ? "2000-01-01" : null }] }), "user")).toBe("prima");
  });
});
