// src/test/logic/commesseLettureLeggere.test.ts
/**
 * Commesse più leggere sul database (23/10/2026): le funzioni delle regole in
 * plpgsql e i dettagli dell'elenco commesse in una lettura sola, coi permessi
 * di chi guarda e il piano preparato una volta per connessione.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

describe("i dettagli dell'elenco commesse", () => {
  const sql = leggi("supabase/migrations/20281023224500_elenco_commesse_dettagli_in_una_lettura.sql");
  it("legge con i permessi di chi guarda, solo per gli utenti, piano preparato una volta", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set plan_cache_mode = force_generic_plan");
    expect(sql).toContain("revoke all on function public.elenco_commesse_dettagli(uuid[]) from public, anon;");
    expect(sql).toContain("grant execute on function public.elenco_commesse_dettagli(uuid[]) to authenticated;");
  });
  it("la pagina usa la lettura unica, e il lavoro di campo la aggiorna", () => {
    const pagina = leggi("src/pages/azienda/OrdersList.tsx");
    expect(pagina).toContain('rpc("elenco_commesse_dettagli"');
    expect(pagina).not.toMatch(/from\("order_salespeople"\)\s*\.select\("order_id, commission_amount/);
    expect(leggi("src/lib/orders/refreshWorkQueries.ts")).toContain('"elenco-commesse-dettagli"');
  });
  it("il grafico dell'andamento si scarica solo quando è aperto", () => {
    expect(leggi("src/pages/azienda/OrdersList.tsx")).toContain("enabled: !!effectiveCompany?.id && !isMobile && analisiAperta && orderPerms.canViewOrderAmounts,");
  });
});

describe("le funzioni delle regole", () => {
  const sql = leggi("supabase/migrations/20281012200000_funzioni_delle_regole_in_plpgsql.sql");
  it("si convertono solo se il corpo è quello censito, in plpgsql", () => {
    expect(sql).toContain("cambiata dopo il censimento del 12/10/2026");
    expect(sql.match(/LANGUAGE plpgsql/g)?.length).toBe(10);
  });
});
