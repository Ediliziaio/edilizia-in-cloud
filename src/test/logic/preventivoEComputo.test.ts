import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { righeVecchie } from "@/lib/quotes/preventivoEComputo";

const riga = (id: string, voce: string | null, quantity: number, unit_price = 10, discount_percent = 0) =>
  ({ id, name: id, quantity, unit_price, discount_percent, computo_voce_id: voce });

describe("il preventivo resta dietro al computo", () => {
  it("segnala solo le righe legate a una voce con quantità diversa, con la differenza in euro", () => {
    const v = righeVecchie(
      [riga("a", "v1", 10), riga("b", "v2", 5), riga("c", null, 3), riga("d", "v3", 4, 100, 10)],
      [{ id: "v1", quantita: 12, descrizione_breve: null }, { id: "v2", quantita: 5.001, descrizione_breve: null }, { id: "v3", quantita: 2, descrizione_breve: null }],
    );
    expect(v.map((x) => [x.riga.id, x.nuova, x.differenzaImporto])).toEqual([["a", 12, 20], ["d", 2, -180]]);
  });
  it("il salvataggio del builder e la copia portano computo_voce_id, e la migrazione lo accetta solo dalla stessa azienda", () => {
    const root = process.cwd();
    expect(readFileSync(join(root, "src/pages/azienda/marketing/QuoteBuilder.tsx"), "utf8")).toMatch(/computo_voce_id: it\.computo_voce_id \?\? null/);
    expect(readFileSync(join(root, "src/lib/quotes/duplicaPreventivo.ts"), "utf8")).toMatch(/computo_voce_id: r\.computo_voce_id \?\? null/);
    const sql = readFileSync(join(root, "supabase/migrations/20281105370000_preventivo_tiene_il_legame_col_computo.sql"), "utf8");
    expect(sql).toMatch(/v\.company_id = p_company_id/);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
  });
});
