// Una fattura a rate è una riga di Scadenzario per rata (09/11/2026): i controlli veri
// stanno sul database; qui si tiene ferma la forma della migrazione.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20290131100000_scadenze_fattura_per_rata.sql", "utf8");

describe("scadenze per rata", () => {
  it("una sola rata resta una riga, due o più si dividono", () => {
    expect(sql).toContain("IF v_quante >= 2 THEN");
    expect(sql).toContain("rata_numero, created_at");
  });
  it("gli incassi coprono dalla prima rata, gli storni tolgono dall'ultima", () => {
    expect(sql).toMatch(/scadenze_documento_incassa[\s\S]*order by coalesce\(rata_numero, 0\), due_date, id/);
    expect(sql).toMatch(/scadenze_documento_storna[\s\S]*order by coalesce\(rata_numero, 0\) desc/);
  });
  it("incasso e storno passano da lì, e le funzioni non sono esposte", () => {
    expect(sql).toContain("PERFORM public.scadenze_documento_incassa(p_company_id, p_documento_id, p_importo, p_data_movimento, v_pn_id)");
    expect(sql).toContain("PERFORM public.scadenze_documento_storna(p_company_id, v_documento_id, v_importo, p_movimento_id)");
    expect(sql).toMatch(/revoke all on function public\.scadenze_documento_incassa[^;]*from public, anon, authenticated/);
  });
  it("il totale torna sempre: l'ultima rata assorbe i centesimi", () => {
    expect(sql).toContain("CASE WHEN v_i = v_quante THEN v_resto");
  });
});
