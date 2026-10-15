import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261015112550_quote_items_superadmin_company_scope.sql", "utf8");
describe("Quote item superadmin scope", () => {
  it("keeps RLS and the invoker RPC instead of bypassing authorization", () => {
    expect(sql).not.toMatch(/disable row level security|security definer/i);
    expect(sql).toContain("to authenticated");
    expect(sql.match(/q.company_id = quote_items.company_id/g)).toHaveLength(5);
    expect(sql.match(/check_staff_visibility/g)).toHaveLength(4);
    expect(sql.match(/utente_e_cliente_esterno/g)).toHaveLength(5);
  });
  it("restricts normal users to their company and existing quote-edit permission", () => {
    expect(sql.match(/company_id = \(select public.get_my_company_id\(\)\)/g)).toHaveLength(6);
    expect(sql.match(/aziende_con_permesso\('can_edit_preventivi'\)/g)).toHaveLength(4);
    expect(sql).toContain("public.e_amministratore_di(public.get_my_company_id())");
  });
});
