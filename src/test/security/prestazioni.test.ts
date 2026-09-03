/**
 * Ondata 1 — prova permanente delle prestazioni.
 *
 * Le verifiche statiche difendono la *forma* delle correzioni: sono quelle che
 * si perdono per prime quando qualcuno "semplifica" una policy.
 *
 * La sonda dal vivo (opt-in, con SUPABASE_URL + SUPABASE_ANON_KEY +
 * EIC_TEST_EMAIL + EIC_TEST_PASSWORD) misura le richieste vere contro
 * l'ambiente e pretende che nessuna superi i 300 ms — il cancello del briefing.
 * È una misura end-to-end, quindi include la rete: le soglie sono generose
 * rispetto ai millisecondi visti sul database.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const migrazione = (frammento: string): string => {
  const nome = readdirSync(DIR).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(DIR, nome), "utf8");
};

const indici   = migrazione("indici_ricerca_contatti_e_attivita");
const ricerca  = migrazione("ricerca_contatti_veloce");
const initplan = migrazione("policy_promuovi_initplan");
const attivita = migrazione("activity_log_una_policy");

describe("1.3 · gli indici che mancavano", () => {
  it("i trigram coprono tutte le colonne su cui si cerca", () => {
    for (const c of ["first_name", "last_name", "email", "phone"]) {
      expect(indici, `manca il trigram su ${c}`).toMatch(
        new RegExp(`idx_mc_trgm_${c}[\\s\\S]*?gin \\(${c} gin_trgm_ops\\)`),
      );
    }
    // "mario rossi" sta a cavallo di due colonne
    expect(indici).toMatch(/idx_mc_trgm_nome_completo/);
  });

  it("company_activity_log ha l'indice composto, non due separati", () => {
    expect(indici).toMatch(/idx_activity_log_company_created[\s\S]*?\(company_id, created_at DESC\)/);
  });

  it("dopo aver creato gli indici si aggiornano le statistiche", () => {
    expect(indici).toMatch(/ANALYZE public\.marketing_contacts/);
    expect(indici).toMatch(/ANALYZE public\.company_activity_log/);
  });
});

describe("1.1 · la ricerca contatti aggira la barriera, non i permessi", () => {
  it("la funzione è SECURITY DEFINER, e il perché è scritto", () => {
    expect(ricerca).toMatch(/STABLE SECURITY DEFINER/);
    expect(ricerca).toMatch(/leakproof/);
  });

  it("il confine aziendale è applicato dentro, non lasciato alla RLS", () => {
    const corpo = ricerca.split("FUNCTION public.marketing_contacts_cerca(")[1];
    expect(corpo).toMatch(/v_aziende := public\.mc_aziende_visibili\(\)/);
    expect(corpo).toMatch(/v_aziende IS NULL OR mc\.company_id = ANY\(v_aziende\)/);
    // chi non ha sessione non passa
    expect(corpo).toMatch(/IF v_uid IS NULL THEN[\s\S]*?42501/);
  });

  it("chiedere l'azienda di un altro dà lo stesso errore di una inesistente", () => {
    const corpo = ricerca.split("FUNCTION public.marketing_contacts_cerca(")[1];
    expect(corpo).toMatch(/NOT \(p_company_id = ANY\(v_aziende\)\)[\s\S]*?Accesso negato/);
  });

  it("la restrizione «solo assegnati» resta applicata", () => {
    expect(ricerca).toMatch(/v_solo\s*:=\s*public\.solo_assegnati_attivo\(\)/);
    expect(ricerca).toMatch(/NOT v_solo OR mc\.assigned_to = v_uid/);
  });

  it("il limite di pagina è imposto dal server, non dal chiamante", () => {
    expect(ricerca).toMatch(/least\(greatest\(coalesce\(p_limit, 50\), 1\), 500\)/);
  });

  it("mc_aziende_visibili replica le policy, non le allarga", () => {
    const corpo = ricerca.split("FUNCTION public.mc_aziende_visibili()")[1];
    expect(corpo).toMatch(/can_view_marketing_contacts/);
    expect(corpo).toMatch(/can_view_orders/);
    expect(corpo).toMatch(/can_edit_marketing_contacts/);
    expect(corpo).toMatch(/multi_company_access/);
    expect(corpo).toMatch(/company_admin/);
    // super admin: nessun limite, non "array vuoto"
    expect(corpo).toMatch(/super_admin[\s\S]*?RETURN NULL/);
  });
});

describe("1.2 · le funzioni di autorizzazione una volta, non per riga", () => {
  it("lo strumento riscrive solo argomenti indipendenti dalla riga", () => {
    // il pattern esige `( SELECT auth.uid() AS uid)` o un letterale:
    // una chiamata con colonne non combacia e resta intatta
    expect(initplan).toMatch(/SELECT auth\\\.uid\\\(\\\) AS uid/);
    expect(initplan).toMatch(/can_see_order\(id, assigned_to/);   // citata come esempio da NON toccare
    expect(initplan).toMatch(/legge colonne/);
  });

  it("preserva permissività, operazione e ruoli della policy originale", () => {
    expect(initplan).toMatch(/PERMISSIVE.*RESTRICTIVE/s);
    expect(initplan).toMatch(/WHEN 'r' THEN 'SELECT'/);
    expect(initplan).toMatch(/0 = ANY\(r\.polroles\) THEN 'PUBLIC'/);
    expect(initplan).toMatch(/WITH CHECK/);
  });

  it("c'è una copia delle definizioni precedenti, e non è leggibile dai client", () => {
    expect(initplan).toMatch(/zz_policy_backup/);
    expect(initplan).toMatch(/REVOKE ALL ON TABLE public\.zz_policy_backup FROM PUBLIC, anon, authenticated/);
  });

  it("company_activity_log passa da tre policy a una, con lo stesso significato", () => {
    expect(attivita).toMatch(/DROP POLICY IF EXISTS "Company admins can view their activity logs"/);
    expect(attivita).toMatch(/DROP POLICY IF EXISTS "Staff can view activity logs if permitted"/);
    expect(attivita).toMatch(/DROP POLICY IF EXISTS "Super admins can view all activity logs"/);
    expect(attivita).toMatch(/CREATE POLICY company_activity_log_lettura/);
    // super_admin OR (azienda AND (admin OR permesso))
    expect(attivita).toMatch(/has_role\(auth\.uid\(\), 'super_admin'[\s\S]*?OR \([\s\S]*?company_id = \(SELECT public\.get_user_company_id/);
  });

  it("ogni chiamata nella policy nuova è avvolta in (SELECT …)", () => {
    const corpo = attivita.split("CREATE POLICY company_activity_log_lettura")[1];
    const chiamateNude = [...corpo.matchAll(/(?<!SELECT )\bpublic\.(has_role|has_permission|get_user_company_id)\(/g)];
    expect(chiamateNude.map((m) => m[0])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.EIC_TEST_EMAIL ?? "";
const PASSWORD = process.env.EIC_TEST_PASSWORD ?? "";
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE.length > 40 && Boolean(EMAIL && PASSWORD);

// Soglia end-to-end: include rete e PostgREST, quindi è più larga dei
// millisecondi misurati sul database. Il cancello del briefing è 300 ms.
const SOGLIA_MS = 300;

describe.runIf(ATTIVA)("1 · nessuna richiesta oltre i 300 ms", () => {
  it("le richieste calde stanno tutte sotto soglia", { timeout: 180_000 }, async () => {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const tok = (await r.json()).access_token as string;
    expect(tok).toBeTruthy();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

    const misura = async (nome: string, esegui: () => Promise<Response>) => {
      await esegui();                       // scaldata
      const tempi: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        const risposta = await esegui();
        tempi.push(performance.now() - t0);
        expect(risposta.status, `${nome} ha risposto ${risposta.status}`).toBeLessThan(300);
      }
      return { nome, ms: Math.min(...tempi) };
    };

    const get = (path: string) => () => fetch(`${URL_BASE}/rest/v1/${path}`, { headers: h });
    const rpc = (nome: string, body: unknown) => () =>
      fetch(`${URL_BASE}/rest/v1/rpc/${nome}`, { method: "POST", headers: h, body: JSON.stringify(body) });

    const esiti = [
      await misura("ricerca contatti", rpc("marketing_contacts_cerca", { p_query: "ross", p_limit: 50 })),
      await misura("elenco contatti", rpc("marketing_contacts_cerca", { p_limit: 50 })),
      await misura("commesse", get("orders?select=id,order_code,created_at&order=created_at.desc&limit=50")),
      await misura("ticket", get("tickets?select=id,created_at&order=created_at.desc&limit=50")),
      await misura("attività", get("tasks?select=id,created_at&order=created_at.desc&limit=50")),
      await misura("preventivi", get("quotes?select=id,created_at&order=created_at.desc&limit=50")),
      await misura("documenti fiscali", get("documenti_fiscali?select=id,numero&order=created_at.desc&limit=50")),
      await misura("registro attività", get("company_activity_log?select=id,action,created_at&order=created_at.desc&limit=50")),
    ];

    const oltre = esiti.filter((e) => e.ms > SOGLIA_MS);
    expect(
      oltre,
      `oltre i ${SOGLIA_MS} ms:\n${oltre.map((e) => `  ${e.nome}: ${e.ms.toFixed(0)} ms`).join("\n")}\n` +
        `tutte:\n${esiti.map((e) => `  ${e.nome}: ${e.ms.toFixed(0)} ms`).join("\n")}`,
    ).toEqual([]);
  });

  it("la ricerca contatti non risponde a chi non ha sessione", async () => {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/marketing_contacts_cerca`, {
      method: "POST",
      headers: { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_query: "a" }),
    });
    expect([401, 403]).toContain(r.status);
  }, 30_000);
});

describe.runIf(!ATTIVA)("1 · misura end-to-end", () => {
  it("saltata: servono SUPABASE_URL, SUPABASE_ANON_KEY, EIC_TEST_EMAIL, EIC_TEST_PASSWORD", () => {
    expect(ATTIVA).toBe(false);
  });
});
