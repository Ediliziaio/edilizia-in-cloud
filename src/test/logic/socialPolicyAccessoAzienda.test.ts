/**
 * Post, file e pagine social: chi entra nell'azienda (24/09/2026).
 *
 * Le policy di social_posts, social_media_items e social_accounts aprivano
 * l'azienda a chiunque avesse una riga in multi_company_access, anche sospesa,
 * solo invitata o scaduta; e su post e file non escludevano il cliente esterno.
 * Provato su una copia annullata: leggevano, modificavano, cancellavano e
 * creavano. Ora il criterio è quello di user_can_access_company.
 *
 * Tiene fermo, per ognuna delle tre policy:
 *   · FOR ALL TO authenticated, rilanciabile (DROP POLICY IF EXISTS prima);
 *   · accesso multi-azienda solo attivo e non scaduto;
 *   · mai il cliente esterno, in lettura come in scrittura (WITH CHECK uguale
 *     a USING: prima social_accounts lo lasciava creare pagine);
 *   · profilo e super admin come in user_can_access_company;
 *   · le funzioni tra (SELECT …): una chiamata per richiesta, non per riga;
 *   · la RESTRICTIVE blocco_utente_bloccato non si tocca.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrazione = (() => {
  const cartella = resolve(process.cwd(), "supabase/migrations");
  const nome = readdirSync(cartella).find((f) => f.endsWith("_social_policy_accesso_attivo_e_clienti_esterni.sql"));
  return nome ? readFileSync(resolve(cartella, nome), "utf8") : "";
})();

// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = migrazione.replace(/--.*$/gm, "");

const POLICY = [
  { tabella: "social_posts", nome: "social_posts_company_access" },
  { tabella: "social_media_items", nome: "social_media_items_company_access" },
  { tabella: "social_accounts", nome: "social_accounts_company_access" },
];

const spazi = (testo: string) => testo.replace(/\s+/g, " ").trim();

function policy(nome: string, tabella: string) {
  const inizio = codice.indexOf(`CREATE POLICY ${nome} ON public.${tabella}`);
  const blocco = inizio >= 0 ? codice.slice(inizio, codice.indexOf(";", inizio)) : "";
  const using = blocco.indexOf("USING (");
  const check = blocco.indexOf("WITH CHECK (");
  return {
    blocco,
    using: using >= 0 && check > using ? spazi(blocco.slice(using + "USING".length, check)) : "",
    check: check >= 0 ? spazi(blocco.slice(check + "WITH CHECK".length)) : "",
  };
}

describe("policy social: stesso criterio di user_can_access_company", () => {
  it("la migrazione c'è e non aspetta i lock all'infinito", () => {
    expect(migrazione).not.toBe("");
    expect(codice).toContain("SET LOCAL lock_timeout = '3s';");
  });

  it.each(POLICY)("$nome è rilanciabile e vale per tutto, solo per chi ha fatto accesso", ({ nome, tabella }) => {
    const drop = codice.indexOf(`DROP POLICY IF EXISTS ${nome} ON public.${tabella};`);
    const create = codice.indexOf(`CREATE POLICY ${nome} ON public.${tabella}`);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
    expect(spazi(policy(nome, tabella).blocco)).toContain("AS PERMISSIVE FOR ALL TO authenticated USING (");
  });

  it.each(POLICY)("$nome: in scrittura vale lo stesso che in lettura", ({ nome, tabella }) => {
    const { using, check } = policy(nome, tabella);
    expect(using).not.toBe("");
    expect(check).toBe(using);
  });

  it.each(POLICY)("$nome: multi-azienda solo attivo e non scaduto, mai il cliente esterno", ({ nome, tabella }) => {
    const { using } = policy(nome, tabella);
    expect(using).toContain(
      "company_id IN ( SELECT m.company_id FROM public.multi_company_access m" +
        " WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active'" +
        " AND (m.expires_at IS NULL OR m.expires_at > now()) )",
    );
    expect(using).toContain("company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))");
    expect(using).toContain("(SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))");
    expect(using).toMatch(/\) AND NOT \(SELECT public\.utente_e_cliente_esterno\(\)\) \)$/);
  });

  it("nessun accesso multi-azienda senza stato e scadenza, nessuna funzione chiamata per riga", () => {
    const accessi = codice.match(/FROM public\.multi_company_access m/g) ?? [];
    expect(accessi).toHaveLength(6);
    expect(codice.match(/AND m\.status = 'active'/g) ?? []).toHaveLength(6);
    expect(codice.match(/AND \(m\.expires_at IS NULL OR m\.expires_at > now\(\)\)/g) ?? []).toHaveLength(6);

    // user_can_access_company(company_id) prende la colonna: girerebbe una volta per riga.
    expect(codice).not.toContain("user_can_access_company");
    const nude = codice.match(/(?<!\(SELECT )public\.(get_user_company_id|has_role|utente_e_cliente_esterno)\(/g);
    expect(nude).toBeNull();
    expect(codice).not.toMatch(/(?<!\(SELECT )auth\.uid\(\)/);
  });

  it("la RESTRICTIVE sull'utente bloccato resta com'è", () => {
    expect(codice).not.toMatch(/POLICY (IF EXISTS )?blocco_utente_bloccato/);
    expect(codice).not.toContain("AS RESTRICTIVE");
    expect(codice.match(/CREATE POLICY/g) ?? []).toHaveLength(3);
  });
});
