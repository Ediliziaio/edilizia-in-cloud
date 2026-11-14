import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contratto della migrazione che impedisce a commessa_salva di azzerare
// importi e rate quando chi salva non ha «Venduto e importi».
const sql = readFileSync(
  process.env.MIGRAZIONE_GUARDIA_IMPORTI ??
    "supabase/migrations/20290317130000_commessa_salva_guardia_importi.sql",
  "utf8",
);
const corpo = sql.replace(/--[^\n]*/g, "");

describe("commessa_salva: guardia sugli importi", () => {
  it("la guardia legge i diritti veri e le colonne protette di orders", () => {
    expect(corpo).toMatch(/private\.office_company_rights\(p_company\)/);
    expect(corpo).toMatch(/from private\.office_projection_fields f\s+where f\.table_name = 'orders'/);
  });

  it("senza importi, un piano rate si rifiuta con 42501", () => {
    expect(corpo).toMatch(/p_rate is not null and not coalesce\(\(v_diritti->>'amounts'\)::boolean, false\)/);
    expect(corpo).toMatch(/Venduto e importi[\s\S]*errcode = '42501'/);
  });

  it("un valore uguale a quello salvato passa, uno diverso no", () => {
    expect(corpo).toMatch(/is not distinct from \(v_prima->v_campo\.column_name\)/);
  });

  it("i pagamenti vogliono anche gli importi, come il trigger delle viste", () => {
    expect(corpo).toMatch(/right_name <> 'payments' or coalesce\(\(v_diritti->>'amounts'\)::boolean, false\)/);
  });

  it("service role e chiamate senza utente non sono toccati", () => {
    expect(corpo).toMatch(/auth\.role\(\), ''\) = 'service_role' or auth\.uid\(\) is null then\s+return;/);
  });

  it("la guardia entra in commessa_salva dopo il permesso, in modo idempotente", () => {
    expect(corpo).toContain("perform public.assert_permesso(''can_edit_orders'', ''salvare una commessa'');");
    expect(corpo).toContain("perform private.commessa_guardia_importi(v_company, p_commessa, p_campi, p_rate);");
    expect(corpo).toMatch(/if position\(v_riga in v_def\) > 0 then\s+return;/);
    expect(corpo).toMatch(/ancora non trovata/);
  });

  it("la funzione nuova non è eseguibile da fuori", () => {
    expect(corpo).toMatch(/revoke all on function private\.commessa_guardia_importi\(uuid, uuid, jsonb, jsonb\) from public, anon, authenticated/);
    expect(corpo).toMatch(/set local lock_timeout = '3s'/);
  });
});
