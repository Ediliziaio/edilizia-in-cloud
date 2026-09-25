// Isolated in-memory Postgres. Never uses a project URL or existing business data.
// Usage: node scripts/test-quote-items-security.mjs /path/to/pglite/dist/index.js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const quote = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000099';
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('super_admin','company_admin','company_staff');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.company',true),'')::uuid $$;
    CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $2::text = current_setting('app.role',true) $$;
    CREATE FUNCTION public.has_permission(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2 = 'can_view_orders' OR current_setting('app.edit',true) = 'true' $$;
    CREATE FUNCTION public.check_staff_visibility(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $2 IS NULL OR $1 = $2 $$;
    CREATE TABLE public.quotes(id uuid PRIMARY KEY, company_id uuid, assigned_to uuid, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.quote_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid REFERENCES quotes, company_id uuid,
      item_type text, name text NOT NULL, description text, quantity numeric CHECK(quantity >= 0), unit_price numeric,
      discount_percent numeric, vat_rate numeric, unit_of_measure text, sort_order int, article_template_id uuid,
      item_category text, tariffa_id uuid, prezzo_acquisto numeric, mostra_nel_pdf boolean, is_optional boolean,
      misura_x numeric, misura_y numeric, family_id uuid, axis_selections jsonb, supplier_catalog_id uuid,
      supplier_product_line_id uuid, parent_item_id uuid REFERENCES quote_items ON DELETE CASCADE
    );
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY; ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY qi_sel ON quote_items FOR SELECT TO authenticated USING(company_id = get_my_company_id());
    CREATE POLICY blocked ON quotes AS RESTRICTIVE TO authenticated USING(current_setting('app.blocked',true) <> 'true');
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT SELECT,INSERT,UPDATE,DELETE ON quotes,quote_items TO authenticated;
    INSERT INTO quotes(id,company_id,assigned_to) VALUES ('${quote}','${company}','${user}');
    INSERT INTO quote_items(quote_id,company_id,name,quantity) VALUES ('${quote}','${company}','original',1);
    -- Model the version side effect of totals triggers using real Postgres
    -- transactions. Monetary rounding is covered by test-quote-totals-sql.mjs.
    CREATE FUNCTION public.test_items_touch_quote() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
    BEGIN
      UPDATE public.quotes SET updated_at = clock_timestamp() WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
      RETURN NULL;
    END; $$;
    CREATE TRIGGER test_items_touch_quote AFTER INSERT OR UPDATE OR DELETE ON quote_items
      FOR EACH ROW EXECUTE FUNCTION public.test_items_touch_quote();
  `);
  // Use the checked-in quote write/visibility policies, not a permissive fixture.
  const policies = migration('20270527080000_rls_close_5_leaks_staff_visibility.sql');
  await db.exec(policies.slice(policies.indexOf('DROP POLICY IF EXISTS "q_sel"'), policies.indexOf('-- 6) BANK_TRANSACTIONS')));
  for (const [part, suffix] of [[33,'50'],[34,'51'],[35,'52']]) {
    await db.exec(migration(`202603091040${suffix}_c6a002a4-34b5-4f73-9322-4a55f31e5729_part${part}.sql`));
  }
  await db.exec(migration('20260925070300_secure_quote_items_and_return_version.sql'));
  const session = async (overrides = {}) => {
    const values = { uid:user, company, role:'company_admin', edit:'true', blocked:'false', ...overrides };
    await db.exec('RESET ROLE');
    for (const [key,value] of Object.entries(values)) await db.query('SELECT set_config($1,$2,false)', [`app.${key}`,value]);
    await db.exec('SET ROLE authenticated');
  };
  const save = async items => (await db.query('SELECT save_quote_items_atomic($1,$2,$3::jsonb) AS result', [quote,company,JSON.stringify(items)])).rows[0].result;
  const snapshot = async () => {
    await db.exec('RESET ROLE');
    return { items:(await db.query('SELECT * FROM quote_items ORDER BY sort_order')).rows, quotes:(await db.query('SELECT * FROM quotes')).rows };
  };
  const baseline = await snapshot();
  for (const [label,values] of [
    ['cross tenant',{company:other}], ['read-only staff',{role:'company_staff',edit:'false'}],
    ['unassigned staff',{role:'company_staff',uid:other}], ['blocked user',{blocked:'true'}], ['missing user',{uid:''}],
  ]) {
    await session(values);
    await assert.rejects(save([]), error => error.code === '42501');
    assert.deepEqual(await snapshot(), baseline);
    console.log(`PASS denied ${label}; original rows and version preserved`);
  }
  await db.exec('SET ROLE anon');
  await assert.rejects(save([]), error => error.code === '42501');
  console.log('PASS anonymous execution denied');
  await session();
  const payload = [
    {client_temp_id:'parent',item_type:'product',name:'Finestra',quantity:2,unit_price:100,misura_x:100,axis_selections:{color:'white'}},
    {client_temp_id:'child',parent_temp_id:'parent',item_type:'service',name:'Posa',quantity:2,unit_price:25,is_optional:true},
  ];
  const saved = await save(payload);
  assert.equal(saved.inserted,2); assert.equal(saved.ok,true);
  const state = await snapshot();
  assert.equal(state.items[1].parent_item_id,saved.map.parent);
  assert.equal(state.items[1].is_optional,true);
  assert.equal(new Date(saved.updated_at).getTime(),new Date(state.quotes[0].updated_at).getTime());
  assert.equal((await db.query('SELECT updated_at = $1::timestamptz AS exact FROM quotes WHERE id = $2', [saved.updated_at,quote])).rows[0].exact,true);
  console.log('PASS authorized save, parent mapping, optional flag and exact write version');
  await session();
  await assert.rejects(save([...payload,{name:'bad row',quantity:-1,unit_price:10}]), e => e.code === '23514');
  assert.deepEqual(await snapshot(),state);
  console.log('PASS late insert failure rolls back deletion, inserted rows and quote version');
  for (const invalid of [null,{},'not an array']) {
    await session(); await assert.rejects(save(invalid),e => e.code === '22023');
    assert.deepEqual(await snapshot(),state);
  }
  console.log('PASS malformed payload cannot delete existing rows');
  await session({role:'company_staff'});
  assert.equal((await save([])).inserted,0);
  assert.equal((await snapshot()).items.length,0);
  console.log('PASS assigned editor can intentionally save zero rows');
} finally { await db.close(); }
