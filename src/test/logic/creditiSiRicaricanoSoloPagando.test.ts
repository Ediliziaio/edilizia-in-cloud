/**
 * I crediti si ricaricano solo pagando, o dal super admin (26/09/2026).
 *
 * Provato in una transazione annullata: prima uno staff qualsiasi si
 * ricaricava il pool dei crediti (topup_pool), alzava a mano il saldo SMS e
 * creava un portafoglio SMS da 100.000; dopo 42501, 0 righe e la RLS che
 * rifiuta, e il saldo si legge come prima. La funzione del server
 * topup-credits, che ricarica senza pagamento, lasciava passare chiunque fosse
 * dell'azienda: ora solo il super admin. La prova ha trovato anche un bug: la
 * ricarica dei crediti email falliva sempre (calls_blocked su una tabella che
 * ha sends_blocked).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");
const senzaCommenti = (s: string) => s.replace(/--.*$/gm, "");

const chiusura = senzaCommenti(leggi("supabase/migrations/20280926080000_crediti_si_ricaricano_solo_pagando.sql"));
const elenco = [...chiusura.slice(chiusura.indexOf("array["), chiusura.indexOf("];")).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

describe("migrazione crediti_si_ricaricano_solo_pagando", () => {
  it("chiude le ricariche e le altre funzioni senza chiamanti dalle pagine", () => {
    expect(chiusura).toMatch(/set local lock_timeout = '3s';/);
    expect(elenco).toHaveLength(11);
    for (const f of ["topup_pool", "topup_service_credits", "adjust_credits_atomic", "adjust_render_credits_atomic", "purchase_extra_render_credit"]) {
      expect(elenco, f).toContain(f);
    }
    expect(chiusura).toContain("execute format('revoke all on function %s from public, anon, authenticated', f.firma);");
    expect(chiusura).toContain("execute format('grant execute on function %s to service_role', f.firma);");
    expect(chiusura).toContain("if n <> cardinality(elenco) then");
  });

  it("il portafoglio SMS lo scrive solo il servizio", () => {
    expect(chiusura).toContain("drop policy if exists sms_wallet_insert on public.sms_wallet;");
    expect(chiusura).toContain("drop policy if exists sms_wallet_update on public.sms_wallet;");
    expect(chiusura).not.toMatch(/create policy [a-z_]+ on public\.sms_wallet/);
  });
});

describe("migrazione ricarica_email_sblocco_colonna_giusta", () => {
  const correzione = senzaCommenti(leggi("supabase/migrations/20280926081500_ricarica_email_sblocco_colonna_giusta.sql"));
  it("lo sblocco con sends_blocked vale anche per l'email, e si ferma se il punto non c'è", () => {
    expect(correzione).toContain("vecchio constant text := 'IF v_table = ''whatsapp_credits'' THEN';");
    expect(correzione).toContain("nuovo constant text := 'IF v_table IN (''whatsapp_credits'', ''email_credits'') THEN';");
    expect(correzione).toContain("if v_volte <> 1 then");
  });
});

describe("topup-credits: la ricarica senza pagamento è del super admin", () => {
  const funzione = leggi("supabase/functions/topup-credits/index.ts");
  it("chi non è super admin riceve 403, anche se è dell'azienda", () => {
    expect(funzione).toMatch(/if \(!isSuperAdmin\) \{\s*return json\(\{ error: "Non autorizzato: la ricarica manuale è riservata allo staff di piattaforma" \}, 403\);/);
    expect(funzione).not.toContain("callerProfile.company_id !== companyId");
  });
});

describe("la pagina dei crediti degli agenti", () => {
  const pagina = leggi("src/components/agenti/CreditiTab.tsx");
  it("la ricarica manuale la vede solo il super admin; gli altri vanno al pagamento", () => {
    expect(pagina).toContain('const isSuperAdmin = role === "super_admin";');
    expect(pagina).toMatch(/\{!isSuperAdmin \? \(/);
    expect(pagina).toContain('<Link to="/azienda/impostazioni/crediti">');
    expect(pagina).toContain('service: "ai_agents"');
  });

  it("la ricarica automatica non dice «salvate» se il database non ha salvato", () => {
    expect(pagina).toContain('.select("company_id");');
    expect(pagina).toContain("if (!salvate || (salvate as unknown[]).length === 0) {");
  });
});

describe("nessuna pagina chiama le funzioni chiuse", () => {
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
  it("il browser non le può eseguire", () => {
    expect(chiamate).toEqual([]);
  });
});
