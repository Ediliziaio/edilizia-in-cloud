/**
 * Personale col permesso «Personale & HR» (26/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: uno staff senza
 * «Personale & HR» leggeva le 895 giornate lavorate di tutti, 8 candidati e 5
 * profili attitudinali, modificava le sedi e aggiungeva festività. Dopo:
 * niente di tutto questo (le sedi le legge ancora: servono alla timbratura);
 * chi ha il permesso e l'amministratore come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280926051500_personale_col_permesso.sql"), "utf8");
const codice = sql.replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+)([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const PERMESSO = "public.aziende_con_permesso('can_view_persone')";

describe("migrazione personale_col_permesso", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it.each([
    ["hr_candidati", "hr_candidati_admin"],
    ["hr_candidati_colloqui", "hr_candidati_colloqui_admin"],
    ["hr_candidatura_forms", "hr_candidatura_forms_admin"],
    ["hr_selezione_fasi", "hr_selezione_fasi_admin"],
    ["hr_documenti", "hr_documenti_admin"],
    ["hr_giornate", "hr_giornate_hr"],
    ["hr_festivita", "hr_festivita_scrittura"],
    ["hr_sedi", "hr_sedi_scrittura"],
  ])("%s: si legge e si scrive solo con «Personale & HR» (in USING e in WITH CHECK)", (tabella, nome) => {
    const p = policy(tabella, nome);
    expect(p.comando).toBe("all");
    expect(p.testo.split(PERMESSO).length - 1).toBe(2);
    expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
    // Il vecchio lasciapassare «basta il ruolo company_staff» non c'è più.
    expect(p.testo).not.toContain("company_staff");
  });

  it("via le regole «stessa azienda» su giornate, festività, sedi e onboarding", () => {
    for (const [tabella, vecchia] of [
      ["hr_giornate", "hr_giornate_own_company"],
      ["hr_festivita", "hr_festivita_own_company"],
      ["hr_sedi", "hr_sedi_own_company"],
      ["hr_onboarding_steps", "hr_steps_company"],
    ]) {
      expect(codice).toContain(`drop policy if exists ${vecchia} on public.${tabella};`);
      expect(codice).not.toMatch(new RegExp(`create policy ${vecchia} `));
    }
  });

  it.each([["hr_festivita", "hr_festivita_lettura"], ["hr_sedi", "hr_sedi_lettura"]])(
    "%s: la leggono tutti gli interni (calendario, timbratura)",
    (tabella, nome) => {
      const p = policy(tabella, nome);
      expect(p.comando).toBe("select");
      expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
      expect(p.testo).not.toContain("can_view_persone");
    },
  );

  it("onboarding: la persona vede i suoi passi, l'HR quelli dell'azienda", () => {
    const p = policy("hr_onboarding_steps", "hr_steps_lettura");
    expect(p.comando).toBe("select");
    expect(p.testo).toContain("e.user_id = (select auth.uid())");
    expect(p.testo).toContain(PERMESSO);
  });

  it("profili attitudinali: hr_talent_company_allowed chiede «Personale & HR», mai a un cliente", () => {
    const f = codice.match(/create or replace function public\.hr_talent_company_allowed[\s\S]*?\$function\$([\s\S]*?)\$function\$/)![1];
    expect(f).toContain("p_company_id = ANY (public.aziende_con_permesso('can_view_persone'))");
    expect(f).toContain("NOT public.utente_bloccato()");
    expect(f).toContain("NOT public.utente_e_cliente_esterno()");
    expect(f).toContain("public.is_super_admin(auth.uid())");
  });
});
