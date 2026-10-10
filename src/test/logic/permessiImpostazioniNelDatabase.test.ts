/**
 * Permessi delle Impostazioni nel database (audit del 09/10/2026): la ricarica automatica, il White-Label, le colonne di
 * piattaforma di companies, le sedi, il catalogo render, i finanziamenti, i modelli di sopralluogo, la scheda fiscale, le
 * letture «admin» e le impostazioni dei preventivi si cambiano col permesso giusto, non con «sono dell'azienda».
 *
 * Questo test legge le migrazioni (tutti i file con «permessi_impostazioni_nel_database» nel nome, uno per sezione; non
 * «permessi_impostazioni_granulari», che è una migrazione di luglio) e tiene ferme le regole che contano. Tiene fermo anche
 * il lato codice: le pagine dell'azienda non scrivono le colonne che il database riserva alla piattaforma, le sedi si
 * scrivono solo con gestisci-sede, il portale clienti non scrive nelle tabelle interne.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = process.cwd();
const leggi = (percorso: string) => readFileSync(resolve(RADICE, percorso), "utf8");

const FILE = readdirSync(resolve(RADICE, "supabase/migrations"))
  .filter((f) => f.includes("permessi_impostazioni_nel_database") && f.endsWith(".sql"))
  .sort();
const codice = FILE.map((f) => leggi(join("supabase/migrations", f)).replace(/--.*$/gm, "")).join("\n");
// una riga sola, spazi singoli: le regole si cercano senza badare a come vanno a capo
const t = codice.replace(/\s+/g, " ");

/** L'istruzione `create policy <nome> on <tabella> …;` (le policy non contengono ';'). */
function policy(nome: string, tabella: string): string {
  const m = t.match(new RegExp(`create policy ${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} on ${tabella.replace(/\./g, "\\.")} (.*?);`));
  expect(m, `policy ${nome} su ${tabella}`).not.toBeNull();
  return m![1];
}

/** Il corpo di `create or replace function public.<nome>(…) … as $f$ … $f$;` */
function funzione(nome: string): string {
  const m = t.match(new RegExp(`create or replace function public\\.${nome}\\(.*? as \\$f\\$ (.*?) \\$f\\$;`));
  expect(m, `funzione ${nome}`).not.toBeNull();
  return m![1];
}

/** Elenco di stringhe di un `nome constant text[] := array[ 'a', 'b' ];` */
function elenco(nome: string): string[] {
  const m = t.match(new RegExp(`${nome} constant text\\[\\] := array\\[(.*?)\\];`));
  expect(m, `elenco ${nome}`).not.toBeNull();
  return [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}

const conta = (testo: string, pezzo: string) => testo.split(pezzo).length - 1;

describe("come sono scritte le migrazioni", () => {
  it("ci sono, e ognuna aspetta al massimo 3 secondi i lock", () => {
    expect(FILE.length).toBeGreaterThan(0);
    for (const f of FILE) {
      expect(leggi(join("supabase/migrations", f)), f).toMatch(/set local lock_timeout = '3s';/);
    }
  });

  it("si possono rifare: ogni policy e ogni trigger che si crea viene prima tolto con IF EXISTS", () => {
    for (const m of t.matchAll(/create policy ("[^"]+"|\w+) on ([\w.]+) /g)) {
      expect(t, `${m[1]} su ${m[2]}`).toContain(`drop policy if exists ${m[1]} on ${m[2]};`);
    }
    for (const m of t.matchAll(/create trigger (\w+) .*? on ([\w.]+) /g)) {
      expect(t, `${m[1]} su ${m[2]}`).toContain(`drop trigger if exists ${m[1]} on ${m[2]};`);
    }
  });

  it("nessuna policy chiede più il permesso aggregato can_edit_settings", () => {
    expect(t).not.toMatch(/aziende_con_(uno_dei_)?permess[a-z]*\([^)]*'can_edit_settings'/);
    expect(t).not.toMatch(/has_permission\([^)]*'can_edit_settings'\)/);
  });

  it("le funzioni SECURITY DEFINER nuove fissano il search_path", () => {
    for (const m of t.matchAll(/create or replace function (public\.\w+)\((.*?)\) (returns \w+(?: \w+)*?) (?:language \w+ )?(?:stable )?(security definer)? ?set search_path/g)) {
      expect(m[0]).toContain("search_path");
    }
    for (const nome of ["can_edit_render_storage_object", "utente_e_amministratore_di", "toggle_survey_template", "clone_survey_template"]) {
      expect(t, nome).toMatch(new RegExp(`create or replace function public\\.${nome}\\(.*?security definer set search_path`));
    }
  });
});

describe("1. company_auto_topup: la carta la addebita chi ha la fatturazione, con un tetto", () => {
  const scrittura = policy("auto_topup_scrittura", "public.company_auto_topup");

  it("importo e soglia hanno un tetto nel database (5-1.000 €, come la ricarica manuale)", () => {
    expect(t).toContain("alter table public.company_auto_topup drop constraint if exists company_auto_topup_importi_ragionevoli;");
    expect(t).toMatch(/add constraint company_auto_topup_importi_ragionevoli check \(topup_amount_eur between 5 and 1000 and threshold_eur between 0 and 1000\)/);
    expect(leggi("src/components/credits/RechargeDialog.tsx")).toMatch(/1000|1\.000/);
  });

  it("via la policy «tutti i miei colleghi»", () => {
    expect(t).toContain('drop policy if exists "Authenticated users can manage own company auto topup" on public.company_auto_topup;');
  });

  it("scrive l'amministratore o chi ha «Fatturazione», il super admin; mai il cliente del portale, né in USING né in WITH CHECK", () => {
    expect(scrittura).toMatch(/^for all to authenticated using/);
    expect(conta(scrittura, "public.aziende_con_permesso('can_view_billing')")).toBe(2);
    expect(conta(scrittura, "not (select public.utente_e_cliente_esterno())")).toBe(2);
    expect(conta(scrittura, "'super_admin'::public.app_role")).toBe(2);
  });

  it("il browser scrive solo i cinque campi della scheda; carta e tentativi sono del server", () => {
    const campi = "company_id, wallet_type, enabled, threshold_eur, topup_amount_eur";
    expect(t).toContain(`grant insert (${campi}) on table public.company_auto_topup to authenticated;`);
    expect(t).toContain(`grant update (${campi}) on table public.company_auto_topup to authenticated;`);
    expect(t).toContain("revoke insert, update, delete, truncate, references, trigger on table public.company_auto_topup from authenticated;");
    expect(t).toContain("revoke all on table public.company_auto_topup from anon;");
    const concessioni = [...t.matchAll(/grant (?:insert|update) \(([^)]*)\) on table public\.company_auto_topup/g)].map((m) => m[1]).join(",");
    for (const colonna of ["stripe_payment_method_id", "failure_count", "retries_exhausted_at", "next_attempt_at", "last_topup_at", "last_failure_at", "last_failure_reason", "first_failure_at", "payment_method"]) {
      expect(concessioni, colonna).not.toContain(colonna);
    }
  });

  it("la scheda della ricarica automatica scrive esattamente quei cinque campi (altrimenti il salvataggio si romperebbe)", () => {
    const scheda = leggi("src/components/credits/UnifiedAutoTopupCard.tsx");
    const dopoUpsert = scheda.slice(scheda.indexOf(".upsert("), scheda.indexOf("onConflict"));
    for (const campo of ["company_id", "enabled", "threshold_eur", "topup_amount_eur", "wallet_type"]) {
      expect(scheda).toContain(campo);
    }
    for (const campo of ["stripe_payment_method_id", "failure_count", "next_attempt_at", "retries_exhausted_at"]) {
      expect(dopoUpsert, campo).not.toContain(campo);
    }
  });
});

describe("2. company_branding: il piano White-Label e il dominio proprio non si scrivono dal browser", () => {
  const corpo = funzione("company_branding_campi_piano");

  it("lasciano passare il server, le funzioni del database e il super admin; il browser no", () => {
    expect(corpo).toContain("if current_user not in ('authenticated', 'anon') then return new;");
    expect(corpo).toContain("if public.has_role(auth.uid(), 'super_admin'::public.app_role) then return new;");
  });

  it("tier, dominio, cname, verificato e data sono tutti sotto guardia (UPDATE) e una riga nuova nasce a «none»", () => {
    for (const colonna of ["whitelabel_tier", "custom_domain", "custom_domain_cname", "custom_domain_verified", "custom_domain_verified_at"]) {
      expect(corpo, colonna).toContain(`new.${colonna} is distinct from old.${colonna}`);
    }
    expect(corpo).toContain("new.whitelabel_tier := 'none';");
    expect(corpo).toContain("new.custom_domain_verified := false;");
    expect(corpo).toContain("errcode = '42501'");
    expect(t).toMatch(/create trigger trg_company_branding_campi_piano before insert or update on public\.company_branding for each row/);
  });

  it("un dominio non può appartenere a due aziende", () => {
    expect(t).toContain("create unique index if not exists company_branding_custom_domain_unico on public.company_branding (lower(custom_domain)) where custom_domain is not null;");
  });

  it("le funzioni del server che scrivono il dominio passano da qui (service role): il browser non le scrive", () => {
    for (const f of ["provision-custom-domain", "verify-custom-domain", "remove-custom-domain"]) {
      expect(leggi(`supabase/functions/${f}/index.ts`), f).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
    // La pagina Marchio scrive colori, nome, sottodominio e file, non il piano.
    const marchio = leggi("src/pages/azienda/settings/SettingsBranding.tsx");
    for (const scrittura of marchio.matchAll(/\.upsert\(\s*\{([\s\S]*?)\}\s+as never/g)) {
      expect(scrittura[1]).not.toMatch(/\b(whitelabel_tier|custom_domain|custom_domain_verified|custom_domain_cname)\b/);
    }
  });
});

describe("4. companies: una regola per modificare, e le colonne di piattaforma protette", () => {
  const regola = policy("companies_aggiorna_propria", "public.companies");
  const corpo = funzione("companies_campi_protetti");
  const piattaforma = elenco("solo_piattaforma");
  const amministratore = elenco("solo_amministratore");

  it("si modifica con «Profilo» in modifica o da amministratore, non con l'aggregato", () => {
    expect(t).toContain('drop policy if exists "Company admins can update their own company" on public.companies;');
    expect(regola).toMatch(/^for update to authenticated using/);
    expect(conta(regola, "public.aziende_con_permesso('can_edit_settings_profile')")).toBe(2);
    // amministratore dell'azienda della riga via e_amministratore_di(id) (gestisce anche i multi-azienda; il guardiano
    // «di quale azienda» vieta has_role(…, 'company_admin') nudo nelle policy nuove)
    expect(conta(regola, "public.e_amministratore_di(id)")).toBe(2);
    expect(regola).not.toContain("'company_admin'");
    expect(regola).not.toContain("can_edit_settings'");
  });

  it("il browser non scrive piano, prova, crediti, Stripe, titolare, ciclo di vita e moduli a pagamento", () => {
    for (const colonna of [
      "subscription_plan_id", "status", "trial_ends_at", "billing_comped", "stripe_customer_id", "payment_method", "payment_notes",
      "ai_crediti", "ai_crediti_bonus", "ai_piano", "storage_override_mb", "render_monthly_override", "computo_ai_monthly_limit",
      "white_label_monthly_price", "is_platform_admin_company", "parent_company_id", "reseller_limit", "stripe_connect_account_id",
      "titolare_user_id", "deleted_at", "tesoreria_enabled", "fv_modulo_attivo", "name", "email", "sector",
    ]) {
      expect(piattaforma, colonna).toContain(colonna);
    }
    expect(corpo).toContain("if current_user not in ('authenticated', 'anon') then return new;");
    expect(corpo).toContain("if public.has_role(auth.uid(), 'super_admin'::public.app_role) then return new;");
    expect(corpo).toContain("if nuovo -> c is distinct from vecchio -> c then");
    expect(corpo).toContain("errcode = '42501'");
  });

  it("le regole di sicurezza le cambia solo un amministratore dell'azienda", () => {
    for (const colonna of ["enforce_2fa", "enforce_2fa_roles", "allowed_ips", "max_failed_attempts", "lockout_duration_minutes", "security_notifications", "password_min_length"]) {
      expect(amministratore, colonna).toContain(colonna);
    }
    expect(corpo).toContain("if not public.e_amministratore_di(new.id) then foreach c in array solo_amministratore loop");
  });

  it("il White-Label si accende solo se c'è il piano (spegnerlo si può: «Ripristina aspetto standard»)", () => {
    expect(corpo).toMatch(/new\.white_label_enabled is true and old\.white_label_enabled is not true and not exists \(select 1 from public\.company_branding b where b\.company_id = new\.id and b\.whitelabel_tier is not null and b\.whitelabel_tier <> 'none'\)/);
    expect(piattaforma).not.toContain("white_label_enabled");
    expect(piattaforma).not.toContain("customer_portal_enabled"); // ha già la sua guardia (trg_portale_clienti_decide_solo_super_admin)
  });

  it("nessuna colonna protetta è scritta dal lato azienda (pagine e hook fuori dalla console e dal server)", () => {
    const ESCLUSI = [/^src\/test\//, /^src\/integrations\//, /^src\/pages\/admin\//, /^src\/components\/admin\//, /^src\/hooks\/superadmin\//, /^src\/hooks\/useCompanyDetail\.ts$/];
    const SOLO_AMMINISTRATORE_IN = /^src\/components\/settings\/CompanySecuritySettings\.tsx$/;
    const scritture: Array<{ file: string; colonne: string[] }> = [];

    const visita = (cartella: string) => {
      for (const voce of readdirSync(resolve(RADICE, cartella))) {
        const percorso = `${cartella}/${voce}`;
        if (ESCLUSI.some((e) => e.test(percorso))) continue;
        if (statSync(resolve(RADICE, percorso)).isDirectory()) { visita(percorso); continue; }
        if (!/\.(ts|tsx)$/.test(voce)) continue;
        const testo = leggi(percorso);
        for (const m of testo.matchAll(/\.from\(\s*["']companies["']\s*(?:as never)?\s*\)\s*\.(update|upsert|insert)\(\s*\{/g)) {
          let profondita = 1;
          let i = m.index! + m[0].length;
          let corpoOggetto = "";
          while (i < testo.length && profondita > 0) {
            const c = testo[i];
            if (c === "{") profondita++;
            if (c === "}") profondita--;
            if (profondita > 0) corpoOggetto += profondita === 1 ? c : " ";
            i++;
          }
          const colonne = [...corpoOggetto.matchAll(/(?:^|[,\s])([a-z_][a-z0-9_]*)\s*(?::|,|$)/gi)].map((x) => x[1]);
          scritture.push({ file: percorso, colonne });
        }
      }
    };
    visita("src");
    expect(scritture.length, "il rilevatore deve trovare le scritture dell'azienda").toBeGreaterThan(5);

    for (const { file, colonne } of scritture) {
      for (const colonna of colonne) {
        expect(piattaforma, `${file} scrive ${colonna}, che il database riserva alla piattaforma`).not.toContain(colonna);
        if (!SOLO_AMMINISTRATORE_IN.test(file)) {
          expect(amministratore, `${file} scrive ${colonna}, che solo un amministratore può cambiare`).not.toContain(colonna);
        }
      }
    }
  });
  it("le colonne che il Profilo aziendale e il Marchio scrivono non sono tra quelle protette (la scansione qui sopra non vede i payload costruiti con lo spread)", () => {
    const piattaforma = elenco("solo_piattaforma");
    const amministratore = elenco("solo_amministratore");
    const profilo = leggi("src/components/settings/CompanyProfileForm.tsx").match(/const values = \{([\s\S]*?)\n  \};/);
    expect(profilo, "l'oggetto values del Profilo").not.toBeNull();
    const colonneProfilo = [...profilo![1].matchAll(/\b([a-z][a-z0-9_]*):/g)].map((x) => x[1]);
    expect(colonneProfilo).toContain("order_code_prefix");
    expect(colonneProfilo.length).toBeGreaterThan(10);
    const marchio = leggi("src/hooks/useBrandSettings.ts").match(/export interface BrandSettings \{([\s\S]*?)\n\}/);
    expect(marchio, "l'interfaccia BrandSettings").not.toBeNull();
    const colonneMarchio = [...marchio![1].matchAll(/^\s*([a-z][a-z0-9_]*)\??:/gm)].map((x) => x[1]);
    expect(colonneMarchio).toContain("brand_primary_color");
    for (const colonna of [...colonneProfilo, ...colonneMarchio.filter((x) => x !== "white_label_enabled")]) {
      expect(piattaforma, `${colonna} è scritta dal Profilo/Marchio`).not.toContain(colonna);
      expect(amministratore, `${colonna} è scritta dal Profilo/Marchio`).not.toContain(colonna);
    }
  });
});

describe("5. sedi e catalogo render si modificano col permesso", () => {
  it("sedi: leggono tutti gli interni (policy sedi_select resta), scrive «Ordini» in modifica, l'amministratore, il super admin", () => {
    for (const vecchia of ["sedi_insert", "sedi_update", "sedi_delete"]) {
      expect(t).toContain(`drop policy if exists ${vecchia} on public.sedi;`);
    }
    const p = policy("sedi_scrittura", "public.sedi");
    expect(p).toMatch(/^for all to authenticated using/);
    expect(conta(p, "public.aziende_con_permesso('can_edit_settings_orders')")).toBe(2);
    expect(conta(p, "not (select public.utente_e_cliente_esterno())")).toBe(2);
    expect(t).not.toContain("drop policy if exists sedi_select");
  });

  it("le sedi si scrivono solo con la funzione gestisci-sede (che controlla il permesso): nessuna pagina le scrive direttamente", () => {
    const visita = (cartella: string): string[] =>
      readdirSync(resolve(RADICE, cartella)).flatMap((voce) => {
        const percorso = `${cartella}/${voce}`;
        if (/^src\/(test|integrations)/.test(percorso)) return [];
        if (statSync(resolve(RADICE, percorso)).isDirectory()) return visita(percorso);
        return /\.(ts|tsx)$/.test(voce) ? [percorso] : [];
      });
    for (const file of visita("src")) {
      const testo = leggi(file);
      expect(testo, file).not.toMatch(/\.from\(\s*["']sedi["']\s*\)\s*\.(insert|update|upsert|delete)\(/);
    }
    expect(leggi("supabase/functions/gestisci-sede/index.ts")).toContain("verificaPermessoAzienda(supabase, userId, companyId, ['can_edit_settings', 'can_edit_settings_orders']");
  });

  it("catalogo render: legge ogni interno, scrive «Personalizzazione» in modifica; il cliente del portale non tocca nemmeno i file", () => {
    expect(t).toContain("drop policy if exists co_render_catalog_assets on public.render_catalog_assets;");
    const p = policy("render_catalogo_scrittura", "public.render_catalog_assets");
    expect(conta(p, "public.aziende_con_permesso('can_edit_settings_customization')")).toBe(2);
    expect(policy("render_catalogo_lettura", "public.render_catalog_assets")).not.toContain("aziende_con");
    expect(policy("render_catalogo_select", "storage.objects")).toContain("not (select public.utente_e_cliente_esterno())");
    for (const nome of ["render_catalogo_insert", "render_catalogo_update", "render_catalogo_delete"]) {
      expect(policy(nome, "storage.objects"), nome).toContain("public.can_edit_render_storage_object(name)");
    }
    const corpo = funzione("can_edit_render_storage_object");
    expect(corpo).toContain("not public.utente_e_cliente_esterno()");
    expect(corpo).toContain("public.aziende_con_permesso('can_edit_settings_customization')");
    expect(t).toContain("revoke all on function public.can_edit_render_storage_object(text) from public, anon;");
  });
});

describe("6. finanziamenti (eic_*): li legge ogni interno, li cambia chi ha «Finanziamenti» o «Listino e prezzi» in modifica", () => {
  const PERMESSO = "public.aziende_con_uno_dei_permessi(array[ 'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])";

  it.each([
    ["eic_finanziarie", "co_eic_finanziarie_all", "eic_finanziarie_lettura", "eic_finanziarie_scrittura"],
    ["eic_tabelle_finanziamento", "co_eic_tabelle_all", "eic_tabelle_lettura", "eic_tabelle_scrittura"],
    ["eic_tabelle_finanziamento_righe", "co_eic_righe_all", "eic_righe_lettura", "eic_righe_scrittura"],
  ])("%s: via la regola «sono interno», lettura aperta, scrittura col permesso in USING e in WITH CHECK", (tabella, vecchia, lettura, scrittura) => {
    expect(t).toContain(`drop policy if exists ${vecchia} on public.${tabella};`);
    const l = policy(lettura, `public.${tabella}`);
    expect(l).toMatch(/^for select to authenticated using/);
    expect(l).not.toContain("aziende_con");
    const s = policy(scrittura, `public.${tabella}`);
    expect(s).toMatch(/^for all to authenticated using/);
    expect(conta(s, PERMESSO)).toBe(2);
    expect(conta(s, "not (select public.utente_e_cliente_esterno())")).toBe(2);
    expect(conta(s, "'super_admin'::public.app_role")).toBe(2);
  });

  it("la riga della tabella deve stare nella tabella della stessa azienda (come prima)", () => {
    expect(policy("eic_righe_scrittura", "public.eic_tabelle_finanziamento_righe")).toContain(
      "exists (select 1 from public.eic_tabelle_finanziamento t where t.id = eic_tabelle_finanziamento_righe.tabella_id and t.company_id = (select public.get_effective_company_id()))",
    );
  });

  it("è la stessa regola della pagina (finanziamenti ∥ listino)", () => {
    expect(leggi("src/hooks/usePermissions.ts")).toContain('canEditSettingsFinanziamenti: g("can_edit_settings_finanziamenti") || g("can_edit_settings_pricing")');
  });
});

describe("7. modelli di sopralluogo: li cambia chi ha «Personalizzazione» in modifica", () => {
  for (const nome of ["toggle_survey_template", "clone_survey_template"]) {
    it(`${nome}: il permesso si controlla prima di scrivere`, () => {
      const corpo = funzione(nome);
      const controllo = corpo.indexOf("aziende_con_permesso('can_edit_settings_customization')");
      expect(controllo).toBeGreaterThan(-1);
      expect(corpo).toContain("public.has_role(auth.uid(), 'super_admin'::public.app_role)");
      expect(corpo.indexOf("insert into")).toBeGreaterThan(controllo);
      expect(corpo).toContain("errcode = '42501'");
    });
  }

  it("attivazioni e modelli propri: scrittura col permesso e mai del cliente del portale", () => {
    expect(t).toContain("drop policy if exists tpl_settings_modify on public.survey_template_settings;");
    expect(conta(policy("tpl_settings_scrittura", "public.survey_template_settings"), "public.aziende_con_permesso('can_edit_settings_customization')")).toBe(2);
    for (const nome of ["templates_insert_company", "templates_update_company", "templates_delete_company"]) {
      const p = policy(nome, "public.survey_templates");
      expect(p, nome).toContain("public.aziende_con_permesso('can_edit_settings_customization')");
      expect(p, nome).toContain("not (select public.utente_e_cliente_esterno())");
      expect(p, nome).toContain("is_system = false");
    }
  });

  it("le funzioni che scrivono i modelli sono quelle della pagina Sopralluoghi, e basta", () => {
    const api = leggi("src/lib/api/surveys.ts");
    for (const f of ["toggle_survey_template", "clone_survey_template"]) expect(api).toContain(f);
    const usi = ["toggleTemplateEnabled", "cloneTemplate", "createBlankTemplate", "updateTemplate", "deleteTemplate"];
    expect(usi.length).toBe(5);
  });
});

describe("8. billing-connect e la scheda fiscale", () => {
  it("la funzione d'appoggio dell'edge function non è chiamabile dal browser: solo il service role", () => {
    expect(t).toContain("revoke all on function public.utente_e_amministratore_di(uuid, uuid) from public, anon, authenticated;");
    expect(t).toContain("grant execute on function public.utente_e_amministratore_di(uuid, uuid) to service_role;");
    const corpo = funzione("utente_e_amministratore_di");
    expect(corpo).toContain("not coalesce(p.is_blocked, false)");
    expect(corpo).toContain("m.status = 'active'");
    expect(corpo).toContain("(m.expires_at is null or m.expires_at > now())");
  });

  it("anagrafica_azienda: legge ogni interno; cambia e cancella «Fatturazione» o l'amministratore; la crea anche chi emette un DDT", () => {
    expect(t).toContain("drop policy if exists company_isolation on public.anagrafica_azienda;");
    expect(policy("anagrafica_azienda_lettura", "public.anagrafica_azienda")).not.toContain("aziende_con");
    const modifica = policy("anagrafica_azienda_modifica", "public.anagrafica_azienda");
    expect(modifica).toMatch(/^for update to authenticated using/);
    expect(conta(modifica, "public.aziende_con_permesso('can_view_billing')")).toBe(2);
    expect(conta(modifica, "'super_admin'::public.app_role")).toBe(2);
    const cancella = policy("anagrafica_azienda_cancellazione", "public.anagrafica_azienda");
    expect(cancella).toMatch(/^for delete to authenticated using/);
    expect(conta(cancella, "public.aziende_con_permesso('can_view_billing')")).toBe(1);
    const inserisce = policy("anagrafica_azienda_inserimento", "public.anagrafica_azienda");
    expect(inserisce).toMatch(/^for insert to authenticated with check/);
    expect(inserisce).toContain("public.aziende_con_uno_dei_permessi(array[ 'can_view_billing', 'can_view_warehouse', 'can_edit_orders'])");
    for (const [nome, p] of [["modifica", modifica], ["cancellazione", cancella], ["inserimento", inserisce]] as const) {
      expect(p, nome).toContain("company_id = (select public.get_my_company_id())");
      expect(p, nome).toContain("not (select public.utente_e_cliente_esterno())");
    }
  });

  it("la scheda manca nella maggior parte delle aziende e nasce col primo documento: l'inserimento ricalca chi può emettere un DDT", () => {
    // il codice la crea al primo documento, anche per il DDT delle Commesse
    expect(leggi("src/hooks/useDocumentiFiscali.ts")).toMatch(/from\("anagrafica_azienda" as never\)\s*\.insert\(/);
    expect(leggi("src/components/orders/CreaDDTDialog.tsx")).toContain("useCreateDocumento");
    // la regola «chi emette un DDT» (ultima definizione nelle migrazioni) chiede magazzino o commesse in modifica
    const ultime = readdirSync(resolve(RADICE, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().reverse();
    let definizione = "";
    for (const f of ultime) {
      const testo = leggi(join("supabase/migrations", f)).replace(/--.*$/gm, "").replace(/\s+/g, " ");
      const m = testo.match(/create or replace function public\.puo_gestire_documento_fiscale\(.*? as \$function\$ (.*?) \$function\$;/);
      if (m) { definizione = m[1]; break; }
    }
    expect(definizione, "definizione di puo_gestire_documento_fiscale").not.toBe("");
    expect(definizione).toMatch(/_tipo = 'ddt' and \(_company_id = any \(public\.aziende_con_permesso\('can_view_warehouse'\)\) or _company_id = any \(public\.aziende_con_permesso\('can_edit_orders'\)\)\)/);
  });

  it("dal browser la scheda la scrivono solo le pagine di Fatturazione e la creazione del primo documento", () => {
    const visita = (cartella: string): string[] =>
      readdirSync(resolve(RADICE, cartella)).flatMap((voce) => {
        const percorso = `${cartella}/${voce}`;
        if (/^src\/(test|integrations)/.test(percorso)) return [];
        if (statSync(resolve(RADICE, percorso)).isDirectory()) return visita(percorso);
        return /\.(ts|tsx)$/.test(voce) && !/\.test\./.test(voce) ? [percorso] : [];
      });
    const scrivono = visita("src").filter((file) =>
      /\.from\(\s*["']anagrafica_azienda["']\s*(?:as never)?\s*\)\s*\.(insert|update|upsert|delete)\(/.test(leggi(file)));
    expect(scrivono.sort()).toEqual([
      "src/components/sdi-wizard/SDISetupWizard.tsx",
      "src/hooks/useDocumentiFiscali.ts",
      "src/pages/azienda/fatturazione/ImpostazioniFatturazione.tsx",
    ]);
  });
});

describe("9. persone e sicurezza", () => {
  it("provvigioni e beneficiari dei compensi: «Persone» in modifica, non l'aggregato", () => {
    for (const [nome, tabella] of [
      ["Staff can manage commission rules if permitted", "public.commission_rules"],
      ["Company staff can manage compensation beneficiaries", "public.compensation_beneficiaries"],
    ] as const) {
      const p = policy(`"${nome}"`, tabella);
      expect(conta(p, "'can_edit_settings_people'"), nome).toBe(2);
    }
  });

  it("sessioni e tentativi di accesso: li vede l'amministratore, chi ha «Utenti»/«Sicurezza», ognuno i propri", () => {
    const sessioni = policy("user_sessions_lettura", "public.user_sessions");
    expect(sessioni).toContain("user_id = (select auth.uid())");
    expect(sessioni).toContain("'can_view_users', 'can_view_settings_security'");
    expect(sessioni).toContain("not (select public.utente_e_cliente_esterno())");
    const tentativi = policy("login_attempts_lettura", "public.login_attempts");
    expect(tentativi).toContain("user_id = (select auth.uid())");
    expect(tentativi).toContain("public.aziende_con_permesso('can_view_settings_security')");
    expect(tentativi).toContain("not (select public.utente_e_cliente_esterno())");
    // l'app legge i tentativi solo con la chiave di servizio (get-security-report): nessuna lettura diretta dal browser
    expect(leggi("src/pages/azienda/settings/SettingsSecurityDashboard.tsx")).not.toMatch(/\.from\(\s*["']login_attempts["']/);
  });

  it("preventivo_impostazioni: con «Integrazioni» si cambia solo la firma", () => {
    const corpo = funzione("preventivo_impostazioni_colonne_firma");
    expect(corpo).toContain("if new.company_id = any (public.aziende_con_permesso('can_edit_settings_pricing')) then return new;");
    expect(corpo).toContain("(to_jsonb(new) - 'firma_digitale_abilitata' - 'firma_richiede_nome') is distinct from (to_jsonb(old) - 'firma_digitale_abilitata' - 'firma_richiede_nome')");
    expect(corpo).toContain("errcode = '42501'");
    expect(t).toContain("create trigger trg_preventivo_impostazioni_colonne_firma before update on public.preventivo_impostazioni");
    // Sull'UPDATE la pagina della firma scrive solo firma_digitale_abilitata; soglia_margine_visibile solo alla
    // prima creazione (INSERT: il trigger guarda solo l'UPDATE), come fa «Prezzo e margini».
    const firma = leggi("src/pages/azienda/settings/SettingsFirmaElettronica.tsx");
    expect(firma).toContain("firma_digitale_abilitata: firmaPreventivi,");
    expect(firma).toMatch(/preventivoSettings \? \{\} : \{ soglia_margine_visibile: null \}/);
  });
});

describe("10. una funzione di trigger non resta aperta ad anon", () => {
  it("matura_buono_pasto_da_giornata (trigger su hr_giornate) non ha EXECUTE per PUBLIC, anon e authenticated", () => {
    expect(t).toContain("revoke execute on function public.matura_buono_pasto_da_giornata() from public, anon, authenticated;");
    expect(t).not.toMatch(/grant execute on function public\.matura_buono_pasto_da_giornata/);
  });
});

describe("11. il cliente del portale non crea righe nelle tabelle interne", () => {
  // Le 34 tabelle interne su cui la policy RESTRICTIVE di INSERT vieta la creazione al cliente del portale. Una tabella nuova
  // con una policy FOR ALL che in WITH CHECK guarda solo l'azienda va aggiunta qui e in una migrazione.
  const ATTESE = [
    "render_facciata_sessions", "render_gallery", "render_pavimento_sessions", "render_pergole_sessions",
    "render_persiane_sessions", "render_piscine_sessions", "render_sessions", "render_stanza_sessions",
    "render_technical_sessions", "render_tetto_sessions", "rst_progetti", "rst_listino_voci",
    "bgn_template_pdf", "clm_template_pdf", "ele_template_pdf", "fv_template_pdf", "idr_template_pdf",
    "pav_template_pdf", "pis_template_pdf", "rst_template_pdf", "tet_template_pdf",
    "company_modulo_preferenze", "company_sales_profile", "fv_progetti", "warehouse_sections",
    "contratti_manutenzione", "impianti_cliente", "meta_ad_accounts", "meta_insights_cache",
    "portal_course_activity", "portal_course_assets", "portal_course_modules", "portal_courses", "reputation_public_links",
  ];
  const BLOCCO = /set local lock_timeout = '3s'; do \$b\$ declare t text; begin foreach t in array array\[(.*?)\] loop execute format\('drop policy if exists blocco_cliente_esterno_inserimento on public\.%I', t\); execute format\('create policy blocco_cliente_esterno_inserimento on public\.%I as restrictive for insert to authenticated with check \(not \(select public\.utente_e_cliente_esterno\(\)\)\)', t\); end loop; end \$b\$;/g;
  const blocchi = [...t.matchAll(BLOCCO)].map((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));

  it("una policy RESTRICTIVE di sola INSERT vieta la creazione al cliente esterno, su tutte le 34 tabelle, a lotti piccoli", () => {
    expect(blocchi.length).toBeGreaterThanOrEqual(2);
    for (const b of blocchi) expect(b.length, "tabelle per lotto").toBeLessThanOrEqual(20);
    expect([...blocchi.flat()].sort()).toEqual([...ATTESE].sort());
    expect(new Set(blocchi.flat()).size, "nessuna tabella due volte").toBe(ATTESE.length);
  });

  it("la policy si rifà (DROP IF EXISTS prima) e ogni lotto ha il suo lock_timeout", () => {
    // il blocco intero (lock_timeout + drop + create) è quello cercato dal'espressione sopra: se manca un pezzo, il lotto non si trova
    expect(t.split("blocco_cliente_esterno_inserimento").length - 1).toBeGreaterThanOrEqual(2 * blocchi.length);
    expect(t).not.toMatch(/create policy blocco_cliente_esterno_inserimento on public\.%I for /);
  });

  it("nessuna pagina del portale clienti scrive in queste tabelle (altrimenti la creazione dei clienti si romperebbe)", () => {
    const visita = (cartella: string): string[] =>
      readdirSync(resolve(RADICE, cartella)).flatMap((voce) => {
        const percorso = `${cartella}/${voce}`;
        if (statSync(resolve(RADICE, percorso)).isDirectory()) return visita(percorso);
        return /\.(ts|tsx)$/.test(voce) && !/\.test\./.test(voce) ? [percorso] : [];
      });
    const file = [...visita("src/pages/cliente"), ...visita("src/components/cliente")];
    expect(file.length, "i file del portale clienti").toBeGreaterThan(5);
    for (const f of file) {
      const testo = leggi(f);
      for (const tabella of ATTESE) {
        expect(testo, `${f} scrive ${tabella}`).not.toMatch(new RegExp(`\\.from\\(\\s*["']${tabella}["']\\s*(?:as never)?\\s*\\)\\s*\\.(insert|upsert|update|delete)\\(`));
      }
    }
  });
});
