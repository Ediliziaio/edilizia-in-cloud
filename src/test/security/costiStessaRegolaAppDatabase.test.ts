/**
 * I costi: l'app e il database decidono con la stessa regola (12/11/2026).
 *
 * L'app mostrava «Nuova uscita» a chi gestisce gli acquisti (canViewCosts = can_view_costs OR
 * can_manage_purchasing), il database accettava solo can_view_costs: due persone d'ufficio di
 * un'impresa compilavano, premevano Salva e non succedeva niente (403). Se una delle due regole
 * cambia, questo test lo dice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("Chi vede e registra i costi", () => {
  it("per l'app: il permesso Costi oppure Gestione acquisti", () => {
    expect(leggi("src/hooks/usePermissions.ts")).toMatch(/canViewCosts:\s*g\("can_view_costs"\) \|\| g\("can_manage_purchasing"\)/);
  });

  it("per il database: la stessa regola, in lettura e in tutte le scritture", () => {
    const sql = leggi("supabase/migrations/20290315100000_costi_anche_a_chi_gestisce_acquisti.sql");
    const regola = "public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')";
    for (const nome of ["legge", "inserisce", "modifica", "elimina"]) {
      const da = sql.indexOf(`create policy "Permesso costi: ${nome}"`);
      expect(da, nome).toBeGreaterThan(-1);
      const blocco = sql.slice(da, sql.indexOf(";", da));
      expect(blocco, nome).toContain(regola);
    }
  });

  it("chi è in sola lettura resta fuori dalle scritture", () => {
    const sql = leggi("supabase/migrations/20290315100000_costi_anche_a_chi_gestisce_acquisti.sql");
    for (const nome of ["inserisce", "modifica", "elimina"]) {
      const da = sql.indexOf(`create policy "Permesso costi: ${nome}"`);
      expect(sql.slice(da, sql.indexOf(";", da)), nome).toContain("not public.utente_sola_lettura(company_id)");
    }
  });
});
