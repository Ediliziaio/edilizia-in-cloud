/**
 * Chiusure dal censimento delle edge function (26/09/2026).
 *
 * Sei segnalazioni, verificate una per una leggendo il codice su origin/main
 * (e, per il database, le RPC delle entità sono risultate già a posto):
 *   1. generate-survey-pdf: legge col service role, senza controllo sull'azienda
 *      del sopralluogo → qualunque utente otteneva il PDF di un altro con l'id.
 *   2. email-ai-l3-batch (verify_jwt=false): bastava un JWT valido qualunque per
 *      riclassificare le email di qualunque azienda.
 *   3a. meta-ads-sync-insights: con profilo senza azienda, body.company_id
 *       passava senza controllo (sync di un'azienda qualsiasi).
 *   3b. semantic-search-global: NON è un buco — le RPC search_entities_semantic
 *       (membro o super) e kb_test_query_multilang (solo super) controllano
 *       l'accesso nel database; qui nessuna modifica.
 *   4. company-access-manage change_email: cambiava l'email di login di un utente
 *      raggiunto via accesso multi-azienda → presa dell'account della sua
 *      azienda d'origine.
 *   5. reset-customer-password: il divieto guardava solo il ruolo globale; l'admin
 *      di A resettava la password di un suo staff che è admin di C via multi-azienda.
 *   6. user_roles NON ha company_id: tre query filtravano per una colonna
 *      inesistente e fallivano in silenzio (feature morte).
 *
 * Le prove di comportamento (transazioni annullate) le fa l'agente
 * guardiano-accessi; qui si tiene fermo il codice, come gli altri test edge.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const FUNZIONI = join(ROOT, "supabase/functions");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

function tuttiISorgenti(): { file: string; testo: string }[] {
  const out: { file: string; testo: string }[] = [];
  const gira = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) gira(p);
      else if (nome.endsWith(".ts")) out.push({ file: p.slice(ROOT.length + 1), testo: readFileSync(p, "utf8") });
    }
  };
  gira(FUNZIONI);
  return out;
}

describe("1 · generate-survey-pdf: solo per l'azienda del sopralluogo", () => {
  const s = leggi("supabase/functions/generate-survey-pdf/index.ts");
  it("controlla l'accesso all'azienda prima di generare il report", () => {
    expect(s).toContain('import { requireCompanyAccess } from "../_shared/auth.ts";');
    expect(s).toContain("requireCompanyAccess(supabase, userId, survey.company_id");
    const check = s.indexOf("requireCompanyAccess(supabase, userId, survey.company_id");
    expect(check).toBeGreaterThan(-1);
    // prima di caricare l'anagrafica azienda e comporre l'HTML
    expect(check).toBeLessThan(s.indexOf('.from("companies")'));
  });
});

describe("2 · email-ai-l3-batch: cron/servizio o super_admin", () => {
  const s = leggi("supabase/functions/email-ai-l3-batch/index.ts");
  it("usa chiamataInternaValida e, a mano, pretende super_admin", () => {
    expect(s).toContain('import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";');
    expect(s).toContain("chiamataInternaValida(req)");
    expect(s).toContain('.eq("role", "super_admin")');
    expect(s).toMatch(/forbidden/);
  });
  it("via il vecchio controllo debole (un JWT valido qualunque)", () => {
    expect(s).not.toContain("const isCron = CRON_SECRET");
    expect(s).not.toContain('if (!u.user) return json({ error: "Invalid token" }');
  });
});

describe("3 · meta-ads-sync-insights e semantic-search-global", () => {
  it("meta: l'utente sincronizza solo un'azienda a cui ha accesso", () => {
    const s = leggi("supabase/functions/meta-ads-sync-insights/index.ts");
    expect(s).toContain("user_can_access_company");
    expect(s).toContain("const filterCompanyId = isServiceRole ? body.company_id : userCompanyId;");
    // niente più il ripiego a body.company_id per il profilo senza azienda
    expect(s).not.toContain("userCompanyId ?? body.company_id");
  });
  it("semantic-search-global resta invariata: la difesa è nelle RPC (search_in per company_id)", () => {
    const s = leggi("supabase/functions/semantic-search-global/index.ts");
    // passa il bearer dell'utente: le RPC applicano l'accesso (verificato sul DB)
    expect(s).toContain("search_entities_semantic");
    expect(s).toContain("kb_test_query_multilang");
  });
});

describe("4 · company-access-manage: l'email di login solo dall'azienda principale", () => {
  const s = leggi("supabase/functions/company-access-manage/index.ts");
  const blocco = s.slice(s.indexOf('action === "change_email"'), s.indexOf('action === "change_email"') + 1800);
  it("il cambio email chiede canManage sull'azienda d'origine del bersaglio", () => {
    expect(blocco).toContain("canManage(supabaseAdmin, userId, targetHome)");
    // non autorizza più via un accesso multi-azienda a QUESTA azienda
    expect(blocco).not.toContain("appartiene");
  });
});

describe("5 · reset-customer-password: non si tocca un admin multi-azienda", () => {
  const s = leggi("supabase/functions/reset-customer-password/index.ts");
  it("blocca il reset di chi amministra un'altra azienda via accesso multi-azienda", () => {
    expect(s).toContain("Cannot reset the password of a multi-company administrator");
    expect(s).toContain('.eq("access_role", "company_admin")');
  });
});

describe("6 · user_roles non ha company_id", () => {
  // La colonna non esiste (l'enum e lo schema lo confermano): filtrare per
  // azienda va fatto via profiles.company_id.
  // .eq("company_id") legato alla STESSA query su user_roles: nessun altro
  // .from( in mezzo (se no si aggancia a un'altra tabella e dà falsi positivi).
  const PATTERN = /from\(\s*["'`]user_roles["'`]\s*\)(?:(?!\.from\()[\s\S])*?\.eq\(\s*["'`]company_id["'`]/;

  it("nessuna edge function filtra user_roles per company_id", () => {
    const colpevoli = tuttiISorgenti().filter((f) => PATTERN.test(f.testo)).map((f) => f.file);
    expect(colpevoli, "user_roles non ha company_id: usare profiles.company_id").toEqual([]);
  });

  it("le tre funzioni corrette passano ora per profiles", () => {
    for (const fn of ["ai-proactive-proposals-daily", "batch-gps-positions", "bank-auto-reconcile"]) {
      const s = leggi(`supabase/functions/${fn}/index.ts`);
      expect(s, fn).toMatch(/from\(\s*["'`]profiles["'`]\s*\)[\s\S]{0,80}?\.eq\(\s*["'`]company_id["'`]/);
    }
  });

  it("il guardiano riconosce il pattern", () => {
    expect(PATTERN.test('.from("user_roles").select("user_id").eq("company_id", x)')).toBe(true);
    expect(PATTERN.test('.from("user_roles").select("user_id").eq("user_id", x)')).toBe(false);
  });
});
