/**
 * Le funzioni del server che lavorano con la chiave di servizio chiedono il
 * permesso dell'azienda giusta (26/09/2026).
 *
 * Trovato nell'audit dei permessi: le funzioni che installano listino e
 * pacchetti, che indicizzano il catalogo e che mandano le campagne SMS
 * guardavano solo che l'utente fosse dell'azienda, e contavano anche un
 * accesso multi-azienda sospeso o scaduto; quelle delle bozze serramenti con
 * l'AI e delle sedi facevano passare chiunque fosse amministratore di
 * un'azienda qualsiasi. Ora passano tutte da verificaPermessoAzienda
 * (_shared/permessoAzienda.ts), la stessa regola delle policy.
 *
 * Il test legge il codice invece di chiamarlo: le funzioni importano da
 * esm.sh e nei test quegli import non si risolvono (come in
 * verificaAccessoAzienda.test.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const FUNZIONI = join(ROOT, "supabase/functions");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("verificaPermessoAzienda", () => {
  const codice = leggi("supabase/functions/_shared/permessoAzienda.ts");
  const passi = [
    'r.role === "super_admin"',
    "await verifyCompanyAccess(admin, userId, companyId);",
    '.select("is_blocked")',
    'admin.rpc("has_permission_for_company"',
    "throw new Error(`Non autorizzato: serve il permesso per ${cosa}`);",
  ];

  it("in quest'ordine: super admin, accesso all'azienda, utente bloccato, permesso", () => {
    const posizioni = passi.map((p) => codice.indexOf(p));
    for (const [i, pos] of posizioni.entries()) expect(pos, passi[i]).toBeGreaterThan(-1);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
  });

  it("l'accesso all'azienda è quello di companyAuth (stato e scadenza), non una copia", () => {
    expect(codice).toContain('import { verifyCompanyAccess } from "./companyAuth.ts";');
    expect(codice).not.toContain("multi_company_access");
    expect(codice).toContain("if (!error && data === true) return;");
  });
});

describe("chi usa verificaPermessoAzienda, e con quale permesso", () => {
  const CASI: Array<[string, string]> = [
    ["installa-template-vertical", `verificaPermessoAzienda(admin, userId, companyId, ["can_edit_settings_pricing"], "modificare il listino")`],
    ["installa-bundle-template", `admin, userId, companyId, ["can_edit_settings_bundle", "can_edit_settings_pricing"], "modificare i pacchetti",`],
    ["genera-embeddings-catalogo", `verificaPermessoAzienda(admin, userId, companyId, ["can_edit_settings_pricing"], "modificare il listino")`],
    ["invia-sms", `verificaPermessoAzienda(supabase, userData.user.id, company_id, ["can_view_sms_marketing"], "le campagne SMS")`],
    ["sr-ai-preventivo-draft", `supabaseAdmin, userId, companyId, ["can_edit_marketing_opportunities", "can_edit_marketing"], "modificare i preventivi",`],
    ["gestisci-sede", `verificaPermessoAzienda(supabase, userId, companyId, ['can_edit_settings', 'can_edit_settings_orders'], 'modificare le sedi')`],
  ];

  it.each(CASI)("%s", (nome, chiamata) => {
    const codice = leggi(`supabase/functions/${nome}/index.ts`);
    expect(codice).toMatch(/import \{ verificaPermessoAzienda \} from ["']\.\.\/_shared\/permessoAzienda\.ts["']/);
    expect(codice).toContain(chiamata);
    // Nessuna copia locale del controllo, e nessun «amministratore di un'azienda qualsiasi».
    expect(codice).not.toMatch(/async function verifyAccess\(/);
    expect(codice).not.toContain("multi_company_access");
    expect(codice).not.toMatch(/roles?(Names)?\.(includes|has)\(["']company_admin["']\)/);
  });
});

describe("chi legge un accesso multi-azienda per decidere guarda lo stato", () => {
  // Letture che non decidono i diritti di chi chiama, col motivo.
  const ECCEZIONI: Record<string, string> = {
    // Controlla che l'utente DA ELIMINARE, o chi riceve i suoi dati, sia
    // dell'azienda: i diritti di chi chiama li legge più su, con lo stato.
    "supabase/functions/delete-company-user/index.ts": "utente da eliminare e destinatario",
  };

  const letture: Array<{ file: string; riga: number; testo: string }> = [];
  const gira = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) { gira(p); continue; }
      if (!nome.endsWith(".ts")) continue;
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/\.from\(\s*["']multi_company_access["']\s*\)/g)) {
        const resto = s.slice(m.index! + m[0].length, m.index! + m[0].length + 700);
        const fine = [resto.indexOf(";"), resto.indexOf("\n    ])")].filter((x) => x >= 0);
        const istruzione = resto.slice(0, fine.length ? Math.min(...fine) : 700);
        if (/\.select\(/.test(istruzione) && /\.eq\(\s*["']user_id["']/.test(istruzione)) {
          letture.push({ file: relative(ROOT, p), riga: s.slice(0, m.index).split("\n").length, testo: istruzione });
        }
      }
    }
  };
  gira(FUNZIONI);

  it("le letture ci sono (il test non gira a vuoto)", () => {
    expect(letture.length).toBeGreaterThanOrEqual(8);
  });

  it("ognuna filtra lo stato, tranne le eccezioni scritte col motivo", () => {
    const senzaStato = letture
      .filter((l) => !/status/.test(l.testo))
      .filter((l) => !ECCEZIONI[l.file])
      .map((l) => `${l.file}:${l.riga}`);
    expect(senzaStato).toEqual([]);
  });
});

describe("migrazione fv_sync_una_famiglia_solo_interna", () => {
  const codice = leggi("supabase/migrations/20280926063000_fv_sync_una_famiglia_solo_interna.sql").replace(/--.*$/gm, "");

  it("toglie l'esecuzione a ogni utente e la lascia al servizio", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("revoke all on function public.fv_sync_one_family(uuid) from public, anon, authenticated;");
    expect(codice).toContain("grant execute on function public.fv_sync_one_family(uuid) to service_role;");
  });
});
