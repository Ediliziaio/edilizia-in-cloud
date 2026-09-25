/**
 * Numeri delle dashboard col permesso della loro categoria (26/09/2026).
 *
 * Provato in una transazione annullata e poi sul database: un venditore
 * leggeva via API fatturato, saldo di cassa, lead e commesse con get_metric
 * (che controllava solo l'azienda). Dopo: 42501 per ogni categoria di cui non
 * ha il permesso; chi ha il Cruscotto (la pagina /dashboards lo chiede già) e
 * l'amministratore vedono tutto come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const codice = leggi("supabase/migrations/20280926053000_metriche_col_permesso.sql").replace(/--.*$/gm, "");
const funzione = codice.match(/create or replace function public\.puo_vedere_metrica[\s\S]*?\$function\$([\s\S]*?)\$function\$/)![1];

describe("migrazione metriche_col_permesso", () => {
  it("non aspetta i lock e la funzione non la chiama un anonimo", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("revoke all on function public.puo_vedere_metrica(uuid, text) from public, anon;");
  });

  it("il Cruscotto apre tutte le categorie; mai a un cliente o a un bloccato", () => {
    expect(funzione).toContain("array['can_view_cruscotto']");
    expect(funzione).toContain("not public.utente_bloccato()");
    expect(funzione).toContain("not public.utente_e_cliente_esterno()");
  });

  it.each([
    ["finanza", "can_view_billing"],
    ["tesoreria", "can_view_tesoreria"],
    ["ordini", "can_view_orders"],
    ["clienti", "can_view_customers"],
    ["marketing", "can_view_marketing_dashboard"],
    ["magazzino", "can_view_warehouse"],
    ["calendar", "can_view_calendar"],
  ])("la categoria %s si apre con %s", (categoria, permesso) => {
    const ramo = funzione.match(new RegExp(`when '${categoria}' then array\\[([^\\]]*)\\]`));
    expect(ramo, categoria).not.toBeNull();
    expect(ramo![1]).toContain(`'${permesso}'`);
  });

  it("una categoria nuova la vede solo chi ha il Cruscotto", () => {
    expect(funzione).toContain("else array[]::text[]");
  });

  it("get_metric riceve il controllo dopo quello del ruolo, una volta sola", () => {
    expect(codice).toContain("IF NOT public.puo_vedere_metrica(v_company_id, v_catalog.category) THEN");
    expect(codice).toMatch(/if position\('puo_vedere_metrica\(' in v_def\) > 0 then\s+return;/);
    expect(codice).toMatch(/if v_volte <> 1 then/);
  });
});

describe("nell'app la stessa regola", () => {
  it("le metriche le usa solo il costruttore di dashboard, dietro il Cruscotto", () => {
    expect(leggi("src/lib/dashboardBuilder/api.ts")).toContain('rpc("get_metric"');
    expect(leggi("src/routes/companyRoutes.tsx")).toMatch(/path="dashboards[^"]*" element=\{withCompanyPermission\("canViewCruscotto"/);
  });
});
