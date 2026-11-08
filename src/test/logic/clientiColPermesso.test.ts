/**
 * Elenco clienti col permesso, nel database (08/11/2026).
 *
 * Provato sul database con utenti veri: il commerciale che ha solo i contatti del CRM riceve 42501; chi segue
 * le commesse o ha la sezione Clienti vede l'elenco intero; con «Solo i propri» restano i clienti assegnati.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const codice = readFileSync(resolve(process.cwd(), "supabase/migrations/20281231150000_clienti_col_permesso.sql"), "utf8").replace(/--.*$/gm, "");
const blocco = (nome: string): string => codice.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`))![1];

describe("migrazione clienti_col_permesso", () => {
  it("non aspetta i lock e le funzioni nuove non le chiama nessuno da fuori", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("revoke all on function public.puo_vedere_clienti(uuid) from public, anon, authenticated;");
    expect(codice).toContain("revoke all on function public.clienti_solo_assegnati(uuid) from public, anon, authenticated;");
  });

  it("i clienti sono di chi segue le commesse o ha la sezione Clienti, mai di un cliente esterno", () => {
    const regola = blocco("puo_vedere_clienti");
    expect(regola).toContain("array['can_view_customers', 'can_view_orders']");
    expect(regola).toContain("not public.utente_e_cliente_esterno()");
    expect(regola).not.toContain("can_view_marketing_contacts");
  });

  it("il limite di «Solo i propri» si calcola sull'azienda chiesta e l'amministratore non lo subisce", () => {
    const limite = blocco("clienti_solo_assegnati");
    expect(limite).toContain("sp.company_id = p_company_id");
    expect(limite).toContain("public.e_amministratore_di(p_company_id)");
  });

  it.each(["get_customers_paginated", "get_customer_stats"])("%s controlla il permesso e applica il limite", (nome) => {
    const funzione = blocco(nome);
    expect(funzione).toContain("public.puo_vedere_clienti(p_company_id)");
    expect(funzione).toContain("v_assegnati := public.clienti_solo_assegnati(p_company_id)");
    expect(funzione).toContain("v_assegnati IS NULL OR p.id = ANY(v_assegnati)");
  });
});
