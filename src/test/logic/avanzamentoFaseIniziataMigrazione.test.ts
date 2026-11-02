import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20281107140000_fase_lavorata_parte.sql", "utf8");

describe("una fase lavorata e approvata parte", () => {
  it("anche con percentuale zero", () => {
    expect(sql).toContain("when nuova>0 or f.status='da_iniziare' then 'in_corso'");
    expect(sql).toContain("or f.status='da_iniziare'");
  });
  it("anche con le sottofasi, senza toccarne la percentuale", () => {
    expect(sql).toContain("set status='in_corso', updated_at=now() where id=f.id and status='da_iniziare'");
  });
  it("conserva il resto: fine lavori, non scende, date reali delle sottofasi", () => {
    for (const x of ["coalesce(new.lavoro_completato, false)", "nuova:=greatest(", "fatta_il = ((new.data_lavoro::timestamp", "giorni_lavorati = s.giorni_lavorati + 1", "Una fase dichiarata non appartiene alla commessa"]) expect(sql).toContain(x);
  });
});
