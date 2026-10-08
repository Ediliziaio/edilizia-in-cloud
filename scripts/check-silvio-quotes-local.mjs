/** Isolated PostgreSQL test. No app database, credentials or network. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Pass the absolute path to the local PGlite module.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [company, otherCompany, actor, staff] = [1, 2, 3, 4].map(id);
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; console.log(`PASS ${message}`); };
const items = [{ name: 'Posa test', item_type: 'labor', quantity: 3, unit_price: 10.005, vat_rate: 22 },
  { name: 'Materiale test', quantity: 2, unit_price: 4, vat_rate: 10 }];
const create = async (lines = items, options = {}) => (await db.query(`SELECT public.silvio_create_quote_draft(
  p_company_id => $1, p_user_id => $2, p_client_name => 'Cliente fittizio', p_items => $3::jsonb,
  p_default_vat_rate => $4) AS result`, [options.company ?? company, options.actor ?? actor, JSON.stringify(lines), options.vat ?? null])).rows[0].result;
const counts = async () => (await db.query('SELECT (SELECT count(*)::int FROM quotes) AS quotes, (SELECT count(*)::int FROM quote_items) AS items')).rows[0];
const reject = async (fn, pattern, message) => {
  const before = await counts(); await assert.rejects(fn, pattern); check(await counts(), before, message);
};
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION public.ai_is_service_role() RETURNS boolean LANGUAGE sql AS
      $$ SELECT coalesce(current_setting('test.service', true), '') = 'true' $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, company_id uuid, is_blocked boolean DEFAULT false);
    CREATE TABLE user_roles(user_id uuid, role text);
    CREATE TABLE multi_company_access(user_id uuid, company_id uuid, access_role text, status text, expires_at timestamptz);
    CREATE TABLE staff_permissions(company_id uuid, user_id uuid, sola_lettura boolean,
      can_view_preventivi boolean, can_edit_preventivi boolean, only_assigned boolean, only_my_warehouse boolean);
    CREATE TABLE quotes(id uuid PRIMARY KEY, company_id uuid NOT NULL, quote_number text UNIQUE,
      status text CHECK(status = 'bozza'), client_name text, client_email text, client_phone text, client_address text,
      title text, description text, tipo_lavoro text, indirizzo_lavori text, subtotal numeric, vat_amount numeric, total numeric,
      validity_days int, expires_at timestamptz, internal_notes text, created_by uuid, updated_at timestamptz,
      prezzo_manuale numeric, prezzo_manuale_iva_pct numeric, discount_percent numeric, discount_amount numeric);
    CREATE TABLE quote_items(quote_id uuid REFERENCES quotes(id), company_id uuid NOT NULL, item_type text, name text,
      description text, quantity numeric, unit_price numeric, unit_of_measure text, vat_rate numeric, sort_order int,
      is_optional boolean DEFAULT false, discount_percent numeric DEFAULT 0,
      line_total numeric(12,2) GENERATED ALWAYS AS (round(quantity * unit_price * (1 - coalesce(discount_percent,0)/100),2)) STORED);
    INSERT INTO profiles VALUES ('${actor}','${company}',false), ('${staff}','${company}',false);
    INSERT INTO user_roles VALUES ('${actor}','company_admin'), ('${staff}','company_staff');
    SET test.service = 'true';
  `);
  await db.exec(read('20261007104833_silvio_context_isolation_and_memory.sql').split('-- One retrieval entrypoint')[0]);
  await db.exec(read('20280923100000_quote_totals_rounding_parity.sql'));
  await db.exec(read('20261007160000_silvio_atomic_quote_draft.sql'));
  const first = await create();
  check(first.status, 'bozza', 'draft uses current status vocabulary');
  check([first.subtotal_eur, first.vat_eur, first.total_eur], [38.02, 7.4, 45.42], 'totals use real shared SQL calculation and rounding');
  check(first.items_count, 2, 'every requested line is persisted');
  check(first.link, `/azienda/marketing/preventivi/${first.quote_id}/modifica`, 'editor link uses actual created quote');
  const rows = (await db.query('SELECT company_id, quote_id, line_total::float, sort_order FROM quote_items ORDER BY sort_order')).rows;
  check(rows.map(r => [r.company_id, r.quote_id, r.line_total, r.sort_order]),
    [[company, first.quote_id, 30.02, 0], [company, first.quote_id, 8, 1]], 'generated totals and tenant are preserved on every line');
  const second = await create(); check(second.quote_number === first.quote_number, false, 'same-millisecond drafts have distinct identifiers');
  for (const [lines, pattern, label] of [
    [[], /200 voci/, 'empty items rejected'], [null, /Voci non valide/, 'null items rejected'],
    [{}, /Voci non valide/, 'non-array rejected'], [[{}], /Voce non valida/, 'missing fields rejected'],
    [[{ ...items[0], quantity: 0 }], /Voce non valida/, 'zero quantity rejected'],
    [[{ ...items[0], unit_price: -1 }], /Voce non valida/, 'negative price rejected'],
    [[{ ...items[0], vat_rate: null }], /Voce non valida/, 'missing VAT never guessed'],
    [[{ ...items[0], vat_rate: 101 }], /Voce non valida/, 'invalid VAT rejected'],
    [[...items, { ...items[0], unit_price: 1e20 }], /numeric field overflow/, 'line insertion failure rolls back header and all lines'],
  ]) await reject(() => create(lines), pattern, label);
  const fallback = await create([{ ...items[0], vat_rate: null }], { vat: 10 });
  check(fallback.vat_eur, 3, 'explicit user default is applied');
  await reject(() => create(items, { company: otherCompany }), /Company access denied/, 'cross-company access denied before insert');
  await db.exec(`UPDATE profiles SET is_blocked = true WHERE id = '${actor}'`);
  await reject(() => create(), /Actor unavailable/, 'blocked actor cannot create drafts');
  await db.exec(`UPDATE profiles SET is_blocked = false WHERE id = '${actor}'`);
  await reject(() => create(items, { actor: staff }), /Quote permission denied/, 'staff without explicit permissions denied');
  await db.exec(`INSERT INTO staff_permissions VALUES('${company}','${staff}',false,true,true,false,false)`);
  check((await create(items, { actor: staff })).items_count, 2, 'authorized staff can create a complete draft');
  await db.exec(`UPDATE staff_permissions SET only_assigned = true`);
  await reject(() => create(items, { actor: staff }), /Quote permission denied/, 'restricted row scope cannot be bypassed');
  await db.exec("SET test.service = 'false'");
  await reject(() => create(), /Service execution required/, 'non-service calls denied');
  const permission = (await db.query("SELECT has_function_privilege('authenticated','public.silvio_create_quote_draft(uuid,uuid,text,text,text,text,text,text,text,text,jsonb,int,numeric,text)','EXECUTE') AS allowed")).rows[0];
  check(permission.allowed, false, 'RPC is not directly executable by authenticated clients');
  console.log(`${checks} checks passed. Isolated fixture, not a full production migration replay.`);
} finally { await db.close(); }
