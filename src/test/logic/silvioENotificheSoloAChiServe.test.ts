/**
 * Silvio e notifiche: solo a chi serve (26/09/2026).
 *
 * Undici funzioni SECURITY DEFINER che mandano o decidono (rispondere a
 * un'email, comporre e inviare un messaggio, salvare una regola decisionale,
 * lanciare un'automazione…) le eseguiva dal browser qualsiasi membro
 * dell'azienda; ora solo il servizio. create_notification toglie i link che
 * non sono un percorso dell'app e, chiamata direttamente da un utente, avvisa
 * solo chi è dell'azienda.
 *
 * Provato in una transazione annullata: prima uno staff salvava una regola di
 * Silvio e lanciava un'automazione, dopo 42501 (il servizio le esegue ancora);
 * una notifica con https://… o //… partiva col link, dopo senza; una a un
 * utente di un'altra azienda partiva, dopo si salta; colleghi, super admin e
 * servizio come prima.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const codice = readFileSync(join(ROOT, "supabase/migrations/20280926091500_silvio_e_notifiche_solo_a_chi_serve.sql"), "utf8")
  .replace(/^\s*--.*$/gm, "");
const elenco = [...codice.slice(codice.indexOf("array["), codice.indexOf("];")).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

const sorgenti = (dir: string, fuori: (p: string) => boolean): string[] =>
  readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    if (fuori(p)) return [];
    if (statSync(p).isDirectory()) return sorgenti(p, fuori);
    return /\.(ts|tsx)$/.test(nome) ? [p] : [];
  });
const pagine = sorgenti(join(ROOT, "src"), (p) => p.includes(join("src", "test")) || p.includes(join("integrations", "supabase")));
const server = sorgenti(join(ROOT, "supabase", "functions"), () => false);

describe("migrazione silvio_e_notifiche_solo_a_chi_serve", () => {
  it("non aspetta i lock e si ferma se un nome non c'è", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toContain("if n <> cardinality(elenco) then");
  });

  it("undici funzioni, le stesse della prova", () => {
    expect([...elenco].sort()).toEqual([
      "execute_automation", "silvio_brief_promote_alert", "silvio_decision_log_propose", "silvio_outbound_enqueue",
      "silvio_tool_approve_proposal_with_edits", "silvio_tool_componi_e_invia_messaggio",
      "silvio_tool_enqueue_creativita", "silvio_tool_genera_documento_router", "silvio_tool_rispondi_a_email",
      "silvio_tool_salva_regola_decisionale", "silvio_tool_undo_executed_action",
    ]);
  });

  it("toglie l'esecuzione a utenti e anonimi, la lascia al servizio", () => {
    expect(codice).toContain("execute format('revoke all on function %s from public, anon, authenticated', f.firma);");
    expect(codice).toContain("execute format('grant execute on function %s to service_role', f.firma);");
  });

  it("create_notification: il controllo entra dopo quello sull'utente che non esiste", () => {
    expect(codice).toContain("'public.create_notification(uuid,uuid,text,text,text,text,uuid,text)', 'collegamento dell''app',");
    expect(codice).toContain("$ancora$  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN\n    RETURN NULL;\n  END IF;\n$ancora$");
  });

  it("un link che non è un percorso dell'app si toglie, la notifica parte lo stesso", () => {
    expect(codice).toContain("IF p_action_url IS NOT NULL AND p_action_url !~ '^/([^/\\\\]|$)' THEN\n    p_action_url := NULL;\n  END IF;");
  });

  it("chiamata da un utente avvisa solo chi è dell'azienda; trigger e servizio come prima", () => {
    const controllo = codice.slice(codice.indexOf("IF pg_trigger_depth() = 0"), codice.indexOf("$aggiunta$);"));
    expect(controllo).toContain("IF pg_trigger_depth() = 0 AND NOT public.is_platform_staff()");
    expect(controllo).toContain("WHERE pr.id = p_user_id AND pr.company_id = p_company_id");
    expect(controllo).toContain("m.status = 'active'");
    expect(controllo).toContain("(m.expires_at IS NULL OR m.expires_at > now())");
    expect(controllo).toContain("aca.status = 'active'");
    expect(controllo).toContain("afm.user_id = p_user_id AND afm.status = 'active'");
    expect(controllo).toContain("ur.role = 'super_admin'");
    expect(controllo).toMatch(/THEN\n\s+RETURN NULL;\n\s+END IF;\n$/);
  });
});

describe("il resto dell'app dice la stessa cosa", () => {
  it("nessuna pagina chiama le undici funzioni: il browser non le può eseguire", () => {
    const chiamate = pagine.flatMap((p) => {
      const s = readFileSync(p, "utf8");
      return elenco.filter((f) => new RegExp(`rpc\\(\\s*["'\`]${f}["'\`]`).test(s)).map((f) => `${relative(ROOT, p)} → ${f}`);
    });
    expect(chiamate).toEqual([]);
  });

  it("chi crea una notifica passa un percorso dell'app", () => {
    const link: string[] = [];
    for (const p of [...pagine, ...server]) {
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/rpc\(\s*["'`]create_notification["'`]\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
        const url = m[1].match(/p_action_url:\s*([^,\n]+)/);
        if (url) link.push(`${relative(ROOT, p)} → ${url[1].trim()}`);
      }
    }
    expect(link.length).toBeGreaterThanOrEqual(8);
    for (const l of link) expect(l, l).toMatch(/→ (["'`]\/[^/\\]|null|undefined)/);
  });
});
