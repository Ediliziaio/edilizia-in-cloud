/**
 * Le funzioni SECURITY DEFINER interne le esegue solo il servizio (26/09/2026).
 *
 * 65 funzioni che scrivono senza nessun controllo su chi le chiama erano
 * eseguibili da ogni utente autenticato: crediti di qualsiasi azienda
 * (pool_ricarica, pool_rispecchia…), sospensione delle aziende
 * (enforce_company_lifecycle), base di conoscenza di Silvio, statistiche dei
 * referral, notifiche con link a chiunque. Provato in una transazione
 * annullata: prima uno staff arrivava a scrivere i crediti di un'altra
 * azienda, dopo 42501; i cron (postgres) le eseguono ancora.
 *
 * Nessuna pagina le chiama: le usano le funzioni del server con la chiave di
 * servizio, i cron e altre funzioni SECURITY DEFINER. Questo test tiene fermo
 * che resti così: se una pagina comincia a chiamarne una, la funzione ha
 * bisogno di un controllo suo prima di tornare aperta.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const codice = readFileSync(join(ROOT, "supabase/migrations/20280926073000_funzioni_interne_solo_al_servizio.sql"), "utf8")
  .replace(/--.*$/gm, "");
const elenco = [...codice.slice(codice.indexOf("array["), codice.indexOf("];")).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

describe("migrazione funzioni_interne_solo_al_servizio", () => {
  it("non aspetta i lock e si ferma se un nome non c'è", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("if n <> cardinality(elenco) then");
  });

  it("65 funzioni, nessuna ripetuta", () => {
    expect(elenco).toHaveLength(65);
    expect(new Set(elenco).size).toBe(65);
  });

  it("toglie l'esecuzione a utenti e anonimi, la lascia al servizio", () => {
    expect(codice).toContain("execute format('revoke all on function %s from public, anon, authenticated', f.firma);");
    expect(codice).toContain("execute format('grant execute on function %s to service_role', f.firma);");
  });

  it("le più delicate sono dentro", () => {
    for (const f of ["pool_ricarica", "pool_consuma", "pool_rispecchia", "add_email_credits_with_log",
      "add_whatsapp_credits_with_log", "enforce_company_lifecycle", "brain_upsert_kb_chunk",
      "brain_soft_delete_kb_chunks", "campo_notifica", "take_pre_migration_snapshot"]) {
      expect(elenco, f).toContain(f);
    }
  });
});

describe("nessuna pagina chiama una funzione interna", () => {
  const chiamate: string[] = [];
  const gira = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) {
        if (nome === "test" || p.includes(join("integrations", "supabase"))) continue;
        gira(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(nome)) continue;
      const s = readFileSync(p, "utf8");
      for (const f of elenco) {
        if (new RegExp(`rpc\\(\\s*["'\`]${f}["'\`]`).test(s)) chiamate.push(`${relative(ROOT, p)} → ${f}`);
      }
    }
  };
  gira(join(ROOT, "src"));

  it("il browser non le può eseguire: nessuna chiamata da src/", () => {
    expect(chiamate).toEqual([]);
  });
});
