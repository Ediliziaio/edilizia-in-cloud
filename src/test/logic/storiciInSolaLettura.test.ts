/**
 * Storici in sola lettura, ticket solo nella propria azienda (26/09/2026).
 *
 * Provato in una transazione annullata: prima uno staff riscriveva 50 righe
 * dello storico dei crediti AI e 50 dello storico delle fasi delle
 * opportunità (da cui escono i report di vendita), e apriva un ticket in
 * un'altra azienda; dopo 0 righe, 0 righe e 42501. Le letture sono le stesse
 * (332 e 50 righe), e il ticket nella propria azienda si apre come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const codice = readFileSync(resolve(process.cwd(), "supabase/migrations/20280926083000_storici_in_sola_lettura.sql"), "utf8")
  .replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

describe("migrazione storici_in_sola_lettura", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("lo storico dei crediti AI si legge soltanto: lo scrivono le funzioni dei crediti", () => {
    expect(codice).toContain("drop policy if exists credit_transactions_company on public.ai_credit_transactions;");
    expect(policy("ai_credit_transactions", "credit_transactions_lettura").comando).toBe("select");
    expect(codice).not.toMatch(/create policy [a-z_]+ on public\.ai_credit_transactions\s+for (all|insert|update|delete)/);
  });

  it("lo storico delle fasi si legge soltanto: lo scrive il trigger", () => {
    expect(codice).toContain('drop policy if exists "mosh company members" on public.marketing_opportunity_stage_history;');
    expect(policy("marketing_opportunity_stage_history", "mosh_lettura").comando).toBe("select");
    expect(codice).not.toMatch(/create policy [a-z_]+ on public\.marketing_opportunity_stage_history\s+for (all|insert|update|delete)/);
  });

  it("un ticket si apre solo nell'azienda in cui si lavora", () => {
    const p = policy("tickets", "tickets_campo_insert");
    expect(p.comando).toBe("insert");
    expect(p.testo).toContain("company_id = (select public.get_my_company_id())");
    expect(p.testo).toContain("(created_by = (select auth.uid())) or (customer_id = (select auth.uid()))");
  });
});
