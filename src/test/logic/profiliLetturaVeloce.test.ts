/**
 * La lettura dei profili: stessi profili, in pochi millisecondi (26/09/2026).
 *
 * Misurato prima e dopo, con gli stessi numeri di profili visti per sei tipi
 * di utente: da circa un secondo (1.065 ms per uno staff) a 30-90 ms. La
 * policy chiamava can_view_company_people(company_id) per ogni riga della
 * tabella; ora le aziende si calcolano una volta per lettura.
 *
 * Tiene fermo che nessuno rimetta una chiamata per riga dove basta un elenco.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const codice = readFileSync(resolve(process.cwd(), "supabase/migrations/20280926060000_profili_lettura_veloce.sql"), "utf8")
  .replace(/--.*$/gm, "");
const regola = codice.match(/create policy profiles_lettura_authenticated on public\.profiles\s+for select([\s\S]*?\);)\n/)![1];

describe("migrazione profili_lettura_veloce", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it("le aziende in cui si vedono le persone si calcolano una volta, non per riga", () => {
    expect(regola).toContain("company_id in (select unnest(public.aziende_dove_vedo_persone()))");
    // can_view_company_people resta solo dentro la sottoquery sugli accessi multi-azienda.
    expect(regola.match(/public\.can_view_company_people\(/g) ?? []).toHaveLength(1);
    expect(regola).toContain("public.can_view_company_people(mca.company_id)");
    expect(regola).not.toContain("public.can_view_company_people(company_id)");
  });

  it("aziende_dove_vedo_persone copre gli stessi casi di can_view_company_people", () => {
    const f = codice.match(/create or replace function public\.aziende_dove_vedo_persone[\s\S]*?\$function\$([\s\S]*?)\$function\$/)![1];
    expect(f).toContain("public.has_role(auth.uid(), 'company_admin'::public.app_role)");
    expect(f).toContain("mca.status = 'active'");
    expect(f).toContain("mca.expires_at is null or mca.expires_at > now()");
    expect(f).toContain("mca.access_role = 'company_admin'");
    expect(f).toContain("coalesce(sp.can_view_settings_people, false)");
    expect(f).toContain("coalesce(sp.can_view_users, false)");
    expect(codice).toContain("revoke all on function public.aziende_dove_vedo_persone() from public, anon;");
  });

  it("nel ramo dei clienti il controllo che costa meno viene prima (ma la regola resta quella)", () => {
    const permessi = regola.indexOf("public.aziende_con_uno_dei_permessi(");
    const cliente = regola.indexOf("not public.profilo_solo_cliente(id)");
    const commessa = regola.indexOf("public.cliente_di_una_mia_commessa(id)");
    expect(permessi).toBeGreaterThan(0);
    expect(permessi).toBeLessThan(cliente);
    expect(cliente).toBeLessThan(commessa);
  });
});
