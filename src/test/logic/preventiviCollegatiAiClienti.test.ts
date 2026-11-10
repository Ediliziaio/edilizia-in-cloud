/**
 * Preventivi collegati ai clienti (10/11/2026).
 *
 *  - 20290213160000: i preventivi già fatti si legano al profilo (quotes.customer_id) solo se l'abbinamento
 *    è certo e unico nella stessa azienda (P.IVA, codice fiscale, email non segnaposto).
 *  - 20290213170000: la scheda cliente legge anche customer_id = cliente, come la scheda committente.
 *
 * Il criterio è SQL: qui si controlla il testo delle migrazioni, che è quello che andrà in produzione.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (nome: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", nome), "utf8");
const collega = leggi("20290213160000_preventivi_collegati_ai_clienti.sql");
const scheda = leggi("20290213170000_scheda_cliente_preventivi_del_cliente.sql");
/** Il codice, senza i commenti: le regole devono stare nelle istruzioni, non solo nella spiegazione. */
const codice = (sql: string) => sql.split("\n").map((r) => r.replace(/--.*$/, "")).join("\n");

describe("collegare i preventivi già fatti", () => {
  const sql = codice(collega);

  it("un solo UPDATE, solo su customer_id ancora vuoto e su preventivi non cancellati", () => {
    expect(sql.match(/\bupdate\s+public\./gi)).toHaveLength(1);
    expect(sql).toMatch(/update public\.quotes q\s+set customer_id = t\.profilo_id\s+from tmp_preventivi_clienti t/);
    expect(sql).toMatch(/and q\.customer_id is null\s+and q\.deleted_at is null/);
    expect(sql).toMatch(/where q\.customer_id is null and q\.deleted_at is null/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("con le protezioni delle migrazioni che scrivono righe", () => {
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("set local statement_timeout = '60s';");
    // la modalità senza trigger dura solo per l'UPDATE
    const prima = sql.indexOf("set local session_replication_role = replica;");
    const update = sql.indexOf("update public.quotes q");
    const dopo = sql.indexOf("set local session_replication_role = origin;");
    expect(prima).toBeGreaterThan(-1);
    expect(prima).toBeLessThan(update);
    expect(dopo).toBeGreaterThan(update);
  });

  it("abbina per P.IVA, codice fiscale ed email, dal profilo e dalla sua anagrafica fiscale", () => {
    for (const r of [
      "'piva' as regola, c.vat_number", "'cf', c.fiscal_code", "'email', c.email",
      "'piva', a.partita_iva", "'cf', a.codice_fiscale", "'email', a.email",
      "'piva' as regola, q.client_vat_number", "'cf', q.client_fiscal_code", "'email', q.client_email",
    ]) expect(sql).toContain(r);
    expect(sql).toMatch(/join public\.anagrafiche_native a on a\.cliente_id = c\.id and a\.company_id = c\.company_id/);
  });

  it("solo nella stessa azienda, e solo profili cliente (non lo staff, non i cancellati)", () => {
    expect(sql).toMatch(/join norm_profilo pp on pp\.company_id = qp\.company_id and pp\.regola = qp\.regola and pp\.valore = qp\.valore/);
    expect(sql).toMatch(/and q\.company_id = t\.company_id/);
    expect(sql).toMatch(/p\.deleted_at is null/);
    expect(sql).toMatch(/ur\.role = 'customer'/);
    expect(sql).toMatch(/not exists \(select 1 from public\.user_roles ur where ur\.user_id = p\.id and ur\.role <> 'customer'\)/);
  });

  it("l'email come la legge scheda_cliente, mai il segnaposto di chi non l'ha data", () => {
    expect(sql.match(/lower\(btrim\(k\.v\)\)/g)).toHaveLength(2);
    expect(sql.match(/not like '%@no-email\.ediliziaincloud\.local'/g)).toHaveLength(2);
  });

  it("P.IVA e codice fiscale vuoti, tutti zero o malformati non abbinano", () => {
    expect(sql.match(/'\^IT\(\?=\[0-9\]\{11\}\$\)'/g)).toHaveLength(2);
    expect(sql.match(/n ~ '\^\[0-9\]\{11\}\$' and n !~ '\^0\+\$'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/\^\[A-Z\]\{6\}\[0-9LMNPQRSTUV\]\{2\}\[A-Z\]/g)).toHaveLength(2);
    expect(sql).toMatch(/where qp\.valore is not null and pp\.valore is not null/);
  });

  it("se più profili combaciano non collega niente; il contatto CRM di un altro profilo lo impedisce", () => {
    expect(sql).toMatch(/count\(distinct a\.profilo_id\) as profili/);
    expect(sql).toMatch(/where pp\.profili = 1/);
    expect(sql).toMatch(/where a\.regola <> 'contatto'/);
    expect(sql).toMatch(/c\.regola = 'contatto' and c\.profilo_id <> pp\.profilo_id/);
  });

  it("controlla da sé quello che il trigger della stessa azienda controllerebbe, e annulla tutto se non torna", () => {
    expect(sql).toMatch(/not exists \(select 1 from public\.profiles p where p\.id = q\.customer_id and p\.company_id = q\.company_id\)/);
    expect(sql).toMatch(/raise exception 'preventivi_collegati_ai_clienti:/);
  });
});

describe("scheda cliente: anche i preventivi legati al cliente", () => {
  const sql = codice(scheda);

  it("è la stessa funzione, con gli stessi permessi e lo stesso piano", () => {
    expect(sql).toContain("create or replace function public.scheda_cliente(p_customer_id uuid, p_company_id uuid)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set plan_cache_mode = force_generic_plan");
    expect(sql).toContain("revoke all on function public.scheda_cliente(uuid, uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.scheda_cliente(uuid, uuid) to authenticated;");
  });

  it("col contatto CRM: i suoi preventivi più i classici legati al cliente", () => {
    expect(sql).toMatch(/p\.contact_id = v_contatto\s+or \(p\.tipo = 'classico' and p\.id in \(/);
    expect(sql).toMatch(/q\.company_id = p_company_id and q\.customer_id = p_customer_id and q\.deleted_at is null/);
  });

  it("senza contatto: i legati al cliente oppure quelli della sua email, anche senza email", () => {
    expect(sql).toMatch(/and \(q\.customer_id = p_customer_id or \(v_email is not null and lower\(q\.client_email\) = v_email\)\)/);
    expect(sql).not.toMatch(/elsif v_email is not null then/);
  });

  it("il resto della scheda non cambia", () => {
    const vecchia = codice(leggi("20281023214500_scheda_cliente_in_una_lettura.sql"));
    const dopoPreventivi = (s: string) => s.slice(s.indexOf("  return jsonb_build_object("));
    expect(dopoPreventivi(sql)).toBe(dopoPreventivi(vecchia));
  });
});
