// «Nuovo documento» non apre una bozza in più se ce n'è una iniziata e senza
// cliente (02/10/2026, Renova: FPR 73 abbandonata, Claudio Bertoli partito da 74).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20281002110000_nuova_fattura_riprende_bozza_iniziata.sql", "utf8");

describe("documento_crea riprende la bozza iniziata", () => {
  it("solo se la richiesta è vuota (tipo e data, niente righe, cliente o ordine)", () => {
    expect(sql).toContain("(p_dati - 'tipo' - 'data_emissione') = '{}'::jsonb");
  });
  it("sceglie una bozza dello stesso tipo, azienda e anno, non cancellata e senza cliente", () => {
    for (const cond of [
      "d.company_id = p_company_id", "d.tipo = v_tipo", "d.stato = 'bozza'", "d.deleted_at is null",
      "d.anagrafica_id is null", "d.anno = extract(year from v_oggi)::integer",
    ]) expect(sql).toContain(cond);
    expect(sql).toMatch(/order by d\.numero_progressivo\s+limit 1\s+for update skip locked/);
  });
  it("lo dice a chi chiama, e solo per i documenti fiscali", () => {
    expect(sql).toContain("'riutilizzata', true");
    expect(sql.indexOf("if v_tipo = any (c_fiscali) then")).toBeLessThan(sql.indexOf("'riutilizzata', true"));
  });
  it("tiene i permessi di prima", () => {
    expect(sql).toMatch(/revoke all on function public\.documento_crea\(uuid, jsonb\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.documento_crea\(uuid, jsonb\) to authenticated;/);
    expect(sql).toContain("user_can_access_company(p_company_id)");
    expect(sql).toContain("puo_gestire_documento_fiscale(p_company_id, v_tipo)");
  });
});
