/** Disposable PostgreSQL simulation. Real migration/table DDL; no remote calls. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { EDILE_DRAFT_MODULES } from '../supabase/functions/_shared/edileQuoteDraft.ts';
if (!process.argv[2]) throw new Error('Pass the absolute local PGlite module path');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [company, actor, other, staff] = [1, 2, 3, 4].map(id);
const revision = '2026-10-08T08:00:00.000Z';
let checks = 0, sequence = 100;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const sourceFiles = { clm: '20271103020000_clm_modulo.sql', ele: '20271104020000_ele_modulo.sql',
  idr: '20271105020000_idr_modulo.sql', pav: '20271106020000_pav_modulo.sql', pis: '20271107020000_pis_modulo.sql', rst: '20260616194406_rst_modulo_wave1.sql' };
const archives = { clm: 'clm', ele: 'elt', idr: 'idr', pav: 'pav', pis: 'psc', rst: 'rst' };
const template = model => ({ company_id: company, cover_title: `Modello ${model}`, cover_image_url: 'https://images.example.test/synthetic.jpg',
  esigenze: [], soluzione: [], usp: [], percorso: [], garanzie: [], faq: [], cronoprogramma: [], testimonianze: [],
  pdf_blocchi: { modulo_intervento: model, modulo_defaults: { editor: true }, modulo_foto: ['archive'] } });
const publish = async (module, model, patch = {}) => {
  const archive = archives[EDILE_DRAFT_MODULES[module].prefix];
  return db.query(`INSERT INTO modelli_libreria_azienda VALUES($1,$2,$3::jsonb)
    ON CONFLICT(company_id,chiave) DO UPDATE SET contenuto=excluded.contenuto`, [company,
    `eic:full-${archive}-module:v1:${company}:${model}`, JSON.stringify({ version: 1, companyId: company, moduleId: model,
      savedAt: revision, template: template(model), ...patch })]);
};
const quote = async () => {
  const q = id(sequence++);
  await db.query(`INSERT INTO quotes(id,company_id,quote_number,status,client_name,client_email,client_phone,
      indirizzo_lavori,subtotal,total,vat_amount,updated_at) VALUES($1,$2,$3,'bozza','Cliente test','test@example.invalid','+390000',
      'Via Test 1',120,132,12,$4)`, [q, company, `TEST-${q}`, revision]);
  await db.query(`INSERT INTO quote_items(id,quote_id,company_id,item_type,name,quantity,unit_price,vat_rate,unit_of_measure,sort_order,prezzo_acquisto,line_total)
    VALUES($1,$3,$4,'material','Fornitura test',2,10,10,'mq',0,6,20),($2,$3,$4,'labor','Posa test',4,25,10,'h',1,12,100)`,
    [id(sequence++), id(sequence++), q, company]);
  return q;
};
const review = async (q, module = 'climatizzazione', model = 'monosplit', extra = {}) => (await db.query(
  'SELECT whatsapp_review_edile_quote($1,$2,$3,$4,$5) AS result', [extra.company ?? company, extra.actor ?? actor, q, module, model])).rows[0].result;
const prepare = async (r, extra = {}) => (await db.query('SELECT whatsapp_prepare_edile_quote($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',
  [extra.company ?? company, extra.actor ?? actor, r.quote_id, r.module_id, r.model_id, r.revisione_modello, r.revisione_preventivo,
    r.impronta_preventivo, r.impronta_modello])).rows[0].result;
const counts = async () => {
  const result = {};
  for (const p of Object.keys(sourceFiles)) result[p] = (await db.query(`SELECT (SELECT count(*)::int FROM ${p}_progetti) AS projects,
    (SELECT count(*)::int FROM ${p}_computo_voci) AS lines`)).rows[0];
  return result;
};
const reject = async (call, regex, label) => {
  const before = await counts(); await assert.rejects(call, regex); check(await counts(), before, label);
};
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION ai_is_service_role() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.service',true)='true' $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,is_blocked boolean DEFAULT false);
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE multi_company_access(user_id uuid,company_id uuid,access_role text,status text,expires_at timestamptz);
    CREATE TABLE staff_permissions(company_id uuid,user_id uuid,sola_lettura boolean,can_view_preventivi boolean,
      can_edit_preventivi boolean,only_assigned boolean,only_my_warehouse boolean);
    CREATE TABLE subscription_plans(id uuid PRIMARY KEY,slug text);
    CREATE TABLE companies(id uuid PRIMARY KEY,subscription_plan_id uuid);
    CREATE TABLE company_feature_overrides(company_id uuid,feature_key text,access_level text,is_enabled boolean,expires_at timestamptz);
    CREATE TABLE plan_feature_defaults(plan_id uuid,feature_key text,access_level text,is_enabled boolean);
    CREATE TABLE platform_feature_flags(key text,default_value boolean,plans_included text[]);
    CREATE TABLE modelli_libreria_azienda(company_id uuid,chiave text,contenuto jsonb,PRIMARY KEY(company_id,chiave));
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid,quote_number text,status text,client_name text,client_email text,client_phone text,
      indirizzo_lavori text,subtotal numeric,total numeric,vat_amount numeric,prezzo_manuale numeric,discount_percent numeric,discount_amount numeric,
      bonus_lines jsonb,financing_table_id uuid,financing_amount numeric,financing_num_installments int,
      totale_overhead numeric,totale_costo_interno numeric,updated_at timestamptz,deleted_at timestamptz,source text);
    CREATE TABLE quote_items(id uuid PRIMARY KEY,quote_id uuid REFERENCES quotes(id),company_id uuid,item_type text,name text,description text,
      quantity numeric,unit_price numeric,vat_rate numeric,unit_of_measure text,sort_order int,is_optional boolean,discount_percent numeric,
      parent_item_id uuid,article_template_id uuid,supplier_product_line_id uuid,computo_voce_id uuid,tariffa_id uuid,supplier_catalog_id uuid,
      family_id uuid,image_url text,codice_prezzario text,axis_selections jsonb,custom_field_values jsonb,mostra_nel_pdf boolean,
      misura_x numeric,misura_y numeric,overhead_importo numeric,prezzo_acquisto numeric,line_total numeric);
    INSERT INTO profiles VALUES('${actor}','${company}',false),('${staff}','${company}',false);
    INSERT INTO auth.users VALUES('${actor}'),('${staff}');
    INSERT INTO user_roles VALUES('${actor}','company_admin'),('${staff}','company_staff');
    INSERT INTO companies VALUES('${company}',null);
    SET test.service='true';`);
  // Original module table DDL, not convenient handwritten substitute tables.
  for (const [prefix, file] of Object.entries(sourceFiles)) {
    for (const suffix of ['progetti', 'computo_voci']) {
      const ddl = read(file).match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${prefix}_${suffix} \\([\\s\\S]+?\\n\\);`))?.[0];
      assert.ok(ddl, `actual ${prefix}_${suffix} schema found`); await db.exec(ddl);
    }
    await db.exec(`ALTER TABLE ${prefix}_progetti ADD COLUMN deleted_at timestamptz; ALTER TABLE ${prefix}_progetti ENABLE ROW LEVEL SECURITY`);
  }
  await db.exec('CREATE TABLE bgn_progetti (LIKE clm_progetti INCLUDING ALL)');
  await db.exec(read('20280925231500_modelli_preventivo_moduli_edili.sql'));
  await db.exec(read('20261007104833_silvio_context_isolation_and_memory.sql').split('-- One retrieval entrypoint')[0]);
  await db.exec(read('20261008052535_whatsapp_edile_model_drafts.sql'));
  for (const module of Object.keys(EDILE_DRAFT_MODULES)) await db.query('INSERT INTO company_feature_overrides VALUES($1,$2,\'enabled\',true,null)',
    [company, `modulo_${module}_attivo`]);
  let first;
  for (const [module, spec] of Object.entries(EDILE_DRAFT_MODULES)) {
    for (const [model, type] of Object.entries(spec.models)) {
      await publish(module, model); const q = await quote(); const r = await review(q, module, model); const result = await prepare(r);
      check(r.voci_da_mostrare.every(row => !Object.hasOwn(row, 'prezzo_acquisto') && !Object.hasOwn(row, 'margine_percentuale')),
        true, `${module}/${model}: review never exposes internal cost columns to the chat`);
      const p = (await db.query(`SELECT * FROM ${spec.prefix}_progetti WHERE id=$1`, [result.progetto_id])).rows[0];
      check([p.company_id, p.tipo_intervento, p.modello_snapshot.modelId, p.modello_snapshot.template.cover_image_url, Number(p.totale)],
        [company, type, model, template(model).cover_image_url, 132], `${module}/${model}: real schema, exact frozen model/photo, totals`);
      check(p.modello_snapshot.template.pdf_blocchi, { modulo_intervento: model }, `${module}/${model}: editor-only state removed`);
      const rows = (await db.query(`SELECT * FROM ${spec.prefix}_computo_voci WHERE progetto_id=$1 ORDER BY ordine`, [p.id])).rows;
      check(rows.map(v => [v.unita_misura, Number(v.quantita), Number(v.importo), Number(v.costo_materiali), Number(v.costo_manodopera)]),
        [['mq', 2, 20, 6, 0], ['ora', 4, 100, 0, 12]], `${module}/${model}: all rows and unit costs preserved`);
      check([result.pdf_generated, result.dati_tecnici_da_completare], [false, true], `${module}/${model}: no fake PDF/engineering success`);
      check((await prepare(r)).progetto_id, p.id, `${module}/${model}: retry reuses existing project`);
      if (!first) first = { r, result };
    }
  }
  await reject(() => prepare({ ...first.r, model_id: 'multisplit' }), /diversa/, 'different model never replaces existing project');
  await reject(() => prepare({ ...first.r, module_id: 'elettrico', model_id: 'completo' }), /altro preventivatore/,
    'same quote cannot duplicate into a second edile module');
  await reject(() => prepare(first.r, { company: other }), /Company access denied/, 'tenant access is checked inside RPC');
  await reject(() => prepare(first.r, { actor: staff }), /permission denied/, 'restricted staff cannot use service RPC as bypass');
  await db.exec(`INSERT INTO staff_permissions VALUES('${company}','${staff}',false,true,true,false,false)`);
  const allowedStaff = await quote(); check((await prepare(await review(allowedStaff), { actor: staff })).success, true, 'unrestricted authorized staff can create');
  await db.exec('UPDATE staff_permissions SET only_assigned=true');
  await reject(() => review(allowedStaff, 'climatizzazione', 'monosplit', { actor: staff }), /permission denied/, 'assigned-only staff cannot expose unrestricted quote preview');
  const changedItems = await quote(); const beforeItems = await review(changedItems);
  await db.query("UPDATE quote_items SET description='Changed wording, same totals' WHERE quote_id=$1", [changedItems]);
  await reject(() => prepare(beforeItems), /modificato/, 'same-total description change invalidates confirmed source hash');
  const decimals = await quote();
  await db.query(`UPDATE quote_items SET quantity=CASE item_type WHEN 'material' THEN 2.5 ELSE 1.25 END,
    unit_price=CASE item_type WHEN 'material' THEN 19.995 ELSE 3.335 END WHERE quote_id=$1`, [decimals]);
  await db.query('UPDATE quote_items SET line_total=round(quantity*unit_price,2) WHERE quote_id=$1', [decimals]);
  await db.query(`UPDATE quotes SET subtotal=54.16,total=59.58,vat_amount=5.42 WHERE id=$1`, [decimals]);
  const decimalResult = await prepare(await review(decimals));
  check([Number(decimalResult.total), Number((await db.query('SELECT totale_imponibile FROM clm_progetti WHERE id=$1', [decimalResult.progetto_id])).rows[0].totale_imponibile)],
    [59.58, 54.16], 'fractional quantities/prices use rounded line amounts and agree with app totals');
  check((await db.query('SELECT importo FROM clm_computo_voci WHERE progetto_id=$1 ORDER BY ordine', [decimalResult.progetto_id])).rows.map(r => Number(r.importo)),
    [49.99, 4.17], 'persisted decimal line amounts sum exactly to the displayed net total');
  const changedCost = await quote(); const beforeCost = await review(changedCost);
  await db.query('UPDATE quote_items SET prezzo_acquisto=prezzo_acquisto+1 WHERE quote_id=$1', [changedCost]);
  await reject(() => prepare(beforeCost), /modificato/, 'cost edits without quote timestamp update invalidate confirmation');
  const changedModel = await quote(); const beforeModel = await review(changedModel);
  await publish('climatizzazione', 'monosplit', { template: { ...template('monosplit'), cover_title: 'Edited title, same savedAt' } });
  await reject(() => prepare(beforeModel), /modificato/, 'same-revision model edits invalidate model hash');
  check((await prepare(first.r)).progetto_id, first.result.progetto_id, 'later library edit never replaces already frozen project');
  await publish('climatizzazione', 'monosplit');
  const invalidRevision = await quote();
  await publish('climatizzazione', 'monosplit', { savedAt: 'infinity' });
  await reject(() => review(invalidRevision), /Revisione modello non valida/, 'infinite model timestamps cannot bypass revision checks');
  await publish('climatizzazione', 'monosplit');
  for (const [sql, regex, label] of [
    ["UPDATE quote_items SET vat_rate=22 WHERE quote_id=$1 AND item_type='labor'", /IVA mista/, 'mixed VAT is rejected before confirmation'],
    ['UPDATE quote_items SET quantity=0 WHERE quote_id=$1', /senza perdita/, 'invalid quantities rejected'],
    ["UPDATE quote_items SET quantity='NaN' WHERE quote_id=$1", /senza perdita/, 'NaN quantities rejected'],
    ["UPDATE quote_items SET unit_price='Infinity' WHERE quote_id=$1", /senza perdita/, 'infinite prices rejected'],
    ["UPDATE quote_items SET unit_of_measure='kg' WHERE quote_id=$1", /senza perdita/, 'unsupported units are not silently changed'],
    ['UPDATE quote_items SET is_optional=true WHERE quote_id=$1', /senza perdita/, 'optional lines remain app reviewed'],
    ['UPDATE quote_items SET discount_percent=5 WHERE quote_id=$1', /senza perdita/, 'line discounts remain app reviewed'],
    ['UPDATE quotes SET discount_amount=5 WHERE id=$1', /senza perdita/, 'amount discounts are not lost'],
    ['UPDATE quotes SET prezzo_manuale=100 WHERE id=$1', /senza perdita/, 'manual prices are not lost'],
    ['UPDATE quotes SET financing_amount=100 WHERE id=$1', /senza perdita/, 'financing cannot be silently dropped'],
    ['UPDATE quotes SET totale_overhead=10 WHERE id=$1', /senza perdita/, 'additional overhead costs cannot be silently dropped'],
    ['UPDATE quotes SET totale_costo_interno=99 WHERE id=$1', /senza perdita/, 'global internal costs cannot silently disagree with unit costs'],
    ['UPDATE quote_items SET mostra_nel_pdf=false WHERE quote_id=$1', /senza perdita/, 'hidden lines cannot silently become visible'],
    ['UPDATE quote_items SET line_total=999 WHERE quote_id=$1', /senza perdita/, 'custom line totals cannot be silently repriced'],
    ["UPDATE quote_items SET article_template_id='00000000-0000-4000-8000-000000000009' WHERE quote_id=$1", /senza perdita/, 'configured products require product adapter'],
    ["UPDATE quote_items SET image_url='https://images.invalid/private.jpg' WHERE quote_id=$1", /senza perdita/, 'line photos cannot silently disappear'],
    ["UPDATE quote_items SET axis_selections='{" + '"colour":"white"' + "}'::jsonb WHERE quote_id=$1", /senza perdita/, 'axes/variants require app review'],
    ['UPDATE quote_items SET company_id=\'00000000-0000-4000-8000-000000000003\' WHERE quote_id=$1', /senza perdita/, 'foreign tenant lines rejected'],
    ['UPDATE quotes SET total=133 WHERE id=$1', /Totali non coincidono/, 'incorrect totals rejected'],
    ["UPDATE quotes SET status='accettato' WHERE id=$1", /non convertibile/, 'accepted quote is never changed or copied'],
    ["UPDATE quotes SET source='modulo:climatizzazione' WHERE id=$1", /non convertibile/, 'existing module offer is not re-converted'],
  ]) { const q = await quote(); await db.query(sql, [q]); await reject(() => review(q), regex, label); }
  const badHashQuote = await quote(); const badHashReview = await review(badHashQuote);
  const consistentCost = await quote();
  await db.query('UPDATE quotes SET totale_costo_interno=60 WHERE id=$1', [consistentCost]);
  check((await prepare(await review(consistentCost))).success, true, 'matching global cost snapshot is preserved by actual unit costs');
  await reject(() => prepare({ ...badHashReview, impronta_preventivo: null }), /Conferma completa/, 'missing digest blocked inside service RPC');
  await reject(() => review(badHashQuote, 'climatizzazione', 'constructor'), /non supportato/, 'inherited/unknown model blocked by SQL allowlist');
  await reject(() => review(badHashQuote, 'fotovoltaico', 'base'), /non supportato/, 'engineering-heavy module has no generic adapter');
  const failQuote = await quote(); const failReview = await review(failQuote);
  await db.exec(`CREATE FUNCTION fail_test_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test row failure'; END $$;
    CREATE TRIGGER fail_test_line BEFORE INSERT ON clm_computo_voci FOR EACH ROW EXECUTE FUNCTION fail_test_line();`);
  await reject(() => prepare(failReview), /test row failure/, 'line failure rolls back project, frozen template and origin together');
  await db.exec('DROP TRIGGER fail_test_line ON clm_computo_voci');
  await db.query('UPDATE clm_progetti SET deleted_at=now() WHERE id=$1', [first.result.progetto_id]);
  await reject(() => prepare(first.r), /eliminata/, 'deleted conversion does not create a duplicate');
  await db.exec("UPDATE company_feature_overrides SET is_enabled=false,access_level='disabled' WHERE feature_key='modulo_climatizzazione_attivo'");
  await reject(() => review(badHashQuote), /non abilitato/, 'disabled feature blocks direct preview RPC');
  await reject(() => prepare(badHashReview), /non abilitato/, 'disabled feature blocks direct conversion RPC');
  await db.exec("UPDATE company_feature_overrides SET is_enabled=true,access_level='enabled'");
  await db.exec("SET test.service='false'");
  await reject(() => review(badHashQuote), /Service execution required/, 'non-service call cannot read quote preview');
  await reject(() => prepare(badHashReview), /Service execution required/, 'non-service call cannot mutate using service function');
  await db.exec("SET test.service='true'");
  await db.exec('CREATE OR REPLACE FUNCTION ai_is_service_role() RETURNS boolean LANGUAGE sql AS $$ SELECT null::boolean $$');
  await reject(() => review(badHashQuote), /Service execution required/, 'indeterminate service identity fails closed');
  await db.exec("CREATE OR REPLACE FUNCTION ai_is_service_role() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.service',true)='true' $$");
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['whatsapp_edile_draft_spec(text,text)', 'whatsapp_edile_draft_access(uuid,uuid,text,text)',
      'whatsapp_review_edile_quote(uuid,uuid,uuid,text,text)', 'whatsapp_prepare_edile_quote(uuid,uuid,uuid,text,text,text,timestamptz,text,text)']) {
      check((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS ok', [role, fn])).rows[0].ok, false, `${role} cannot execute ${fn}`);
    }
  }
  for (const prefix of Object.keys(sourceFiles)) {
    check((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [`${prefix}_progetti`])).rows[0].relrowsecurity,
      true, `${prefix}: existing RLS remains enabled`);
    check((await db.query('SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname=\'preventivo_modello_immutabile\'',
      [`${prefix}_progetti`])).rows[0].n, 1, `${prefix}: original immutable model trigger retained`);
  }
  check((await db.query('SELECT count(*)::int AS n FROM quotes WHERE source LIKE \'modulo:%\'')).rows[0].n, 1,
    'conversion never replaces original quote source (only one intentional test edit)');
  console.log(`${checks} checks passed. 38 core models, actual schema DDL and constraints. No remote DB, AI calls, PDF or messages. Not a concurrent database test.`);
} finally { await db.close(); }
