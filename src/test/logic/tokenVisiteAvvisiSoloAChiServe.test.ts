/**
 * Token del portale e dei SAL, visite mediche, token di opt-in e avvisi di
 * cassa: solo a chi serve (25/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: uno staff senza
 * permessi leggeva token del portale, visite mediche e token di opt-in, e
 * vedeva (e chiudeva per tutti) gli 8 allarmi di cassa della sua azienda.
 * Dopo: zero; l'amministratore e chi ha Tesoreria o Previsionale vedono come
 * prima, i promemoria degli appuntamenti restano a tutti gli interni.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20280926031500_token_visite_avvisi_solo_a_chi_serve.sql"),
  "utf8",
);
const codice = sql.replace(/--.*$/gm, "");

const policy = (tabella: string, nome: string) => {
  const nomeSql = /\s/.test(nome) ? `"${nome}"` : nome;
  const m = codice.match(new RegExp(`create policy ${nomeSql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} on public\\.${tabella}\\s+for (\\w+)([\\s\\S]*?\\);)\\n`));
  expect(m, `${tabella} / ${nome}`).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

describe("migrazione token_visite_avvisi_solo_a_chi_serve", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it.each([
    ["portale_clienti_tokens", "portale_tokens_company", "portale_tokens_amministratore"],
    ["sal_signature_tokens", "sal_signature_tokens_tenant", "sal_signature_tokens_amministratore"],
    ["employee_visite_mediche", "visite_company", "visite_mediche_amministratore"],
  ])("%s: via la regola «stessa azienda», resta l'amministratore", (tabella, vecchia, nuova) => {
    expect(codice).toContain(`drop policy if exists ${vecchia} on public.${tabella};`);
    const p = policy(tabella, nuova);
    expect(p.comando).toBe("all");
    expect(p.testo.match(/public\.can_manage_company_people\(company_id\)/g)).toHaveLength(2);
    expect(p.testo).not.toMatch(/get_my_company_id/);
  });

  it("email_optin_tokens: via la regola che apriva a chiunque avesse il profilo nell'azienda", () => {
    expect(codice).toContain(`drop policy if exists "company_admin access" on public.email_optin_tokens;`);
    expect(codice).not.toMatch(/create policy [^\n]* on public\.email_optin_tokens/);
  });

  it.each([
    ["Company users view own notifications", "select"],
    ["Company users update own notifications", "update"],
  ])("avvisi (%s): promemoria agli interni, allarmi di cassa solo con Tesoreria o Previsionale", (nome, comando) => {
    const p = policy("lifecycle_notifications", nome);
    expect(p.comando).toBe(comando);
    expect(p.testo).toContain("not (select public.utente_e_cliente_esterno())");
    expect(p.testo).toContain("notification_type = 'appointment_reminder'");
    expect(p.testo).toContain("public.can_manage_company_people(company_id)");
    expect(p.testo).toMatch(/notification_type = 'cash_flow_alert'\s+and \(company_id in \(select unnest\(public\.aziende_con_permesso\('can_view_tesoreria'\)\)\)\s+or company_id in \(select unnest\(public\.aziende_con_permesso\('can_view_forecast'\)\)\)\)/);
  });
});
