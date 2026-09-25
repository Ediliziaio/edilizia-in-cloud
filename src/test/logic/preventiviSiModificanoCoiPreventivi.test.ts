/**
 * Preventivi, righe e venditori: si modificano col permesso dei Preventivi
 * (26/09/2026).
 *
 * Provato in una transazione annullata: prima uno staff senza i Preventivi, o
 * con le sole Commesse, vedeva e modificava tutte le 121 righe (i prezzi) dei
 * preventivi della sua azienda; dopo 0. Chi ha i Preventivi e l'amministratore
 * come prima (121 righe, 45 preventivi), e l'editor salva le righe con
 * save_quote_items_atomic come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const codice = readFileSync(resolve(process.cwd(), "supabase/migrations/20280926084500_preventivi_si_modificano_coi_preventivi.sql"), "utf8")
  .replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const m = codice.match(new RegExp(`create policy ${nome} on public\\.${tabella}\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const MODIFICABILE = "q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))";

describe("migrazione preventivi_si_modificano_coi_preventivi", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("via le regole vecchie delle Commesse sui preventivi (la lettura resta)", () => {
    expect(codice).toContain("drop policy if exists q_ins on public.quotes;");
    expect(codice).toContain("drop policy if exists q_upd on public.quotes;");
    expect(codice).not.toContain("drop policy if exists q_sel on public.quotes;");
  });

  it("le righe si leggono se si vede il preventivo", () => {
    const p = policy("quote_items", "qi_sel");
    expect(p.comando).toBe("select");
    expect(p.testo).toContain("exists (select 1 from public.quotes q where q.id = quote_items.quote_id)");
  });

  it.each([
    ["qi_ins", "insert", 1],
    ["qi_upd", "update", 2],
    ["qi_del", "delete", 1],
  ] as const)("%s: si scrive solo se il preventivo è modificabile", (nome, comando, volte) => {
    const p = policy("quote_items", nome);
    expect(p.comando).toBe(comando);
    expect(p.testo.split(MODIFICABILE).length - 1, nome).toBe(volte);
    expect(p.testo.match(/public\.check_staff_visibility\(\(select auth\.uid\(\)\), q\.assigned_to\)/g) ?? []).toHaveLength(volte);
  });

  it("chi prende la provvigione sul preventivo si legge soltanto", () => {
    expect(codice).toContain("drop policy if exists quote_salespeople_company_access on public.quote_salespeople;");
    expect(policy("quote_salespeople", "quote_salespeople_lettura").comando).toBe("select");
    expect(codice).not.toMatch(/create policy [a-z_]+ on public\.quote_salespeople\s+for (all|insert|update|delete)/);
  });
});
