import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20281113110000_rapportini_campi_totali.sql", "utf8");

describe("rapportini_campi_totali", () => {
  it("vale la RLS di chi chiede", () => {
    expect(sql).toMatch(/security invoker/);
    expect(sql).not.toMatch(/security definer/);
    expect(sql).toContain("revoke all on function public.rapportini_campi_totali(uuid) from public, anon");
  });
  it("somma i numeri e conta i sì, e un valore sporco non fa fallire", () => {
    expect(sql).toContain("jsonb_typeof(v->'valore') = 'number'");
    expect(sql).toContain("jsonb_typeof(v->'valore') = 'boolean'");
    expect(sql).toContain("(v->>'valore')::numeric");
  });
  it("separa approvati e da approvare, ed esclude bozze e respinti", () => {
    expect(sql).toMatch(/approvati/);
    expect(sql).toMatch(/da_approvare/);
    expect(sql).toContain("r.stato in ('inviato', 'approvato')");
  });
  it("raggruppa per chiave, non per testo, con l'etichetta più recente", () => {
    expect(sql).toMatch(/group by v->>'chiave'/);
    expect(sql).toMatch(/array_agg\(v->>'etichetta' order by data_lavoro desc/);
  });
});
