/** Isolated database simulation. Never connects to the app or sends messages. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Pass the absolute local PGlite module path');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [company, actor, other, staff] = [1,2,3,4].map(id);
const revision = '2026-10-08T08:00:00.000Z';
let checks = 0, sequence = 100;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const template = model => ({ company_id: company, cover_title: `Modello ${model}`, cover_image_url: 'https://images.example.test/fake.jpg',
  esigenze: [], soluzione: [], usp: [], percorso: [], garanzie: [], faq: [], cronoprogramma: [], testimonianze: [],
  pdf_blocchi: { modulo_intervento: model, modulo_defaults: { editor: true }, modulo_foto: ['archive'] } });
const publish = async (model, savedAt = revision, patch = {}) => db.query(`INSERT INTO modelli_libreria_azienda VALUES($1,$2,$3::jsonb)
  ON CONFLICT(company_id,chiave) DO UPDATE SET contenuto=excluded.contenuto`, [company,
  `eic:full-bgn-module:v1:${company}:${model}`, JSON.stringify({ version: 1, companyId: company, moduleId: model, savedAt, template: template(model), ...patch })]);
const quote = async () => {
  const q = id(sequence++);
  await db.query(`INSERT INTO quotes(id,company_id,quote_number,status,client_name,subtotal,total,vat_amount,updated_at)
    VALUES($1,$2,$3,'bozza','Cliente fittizio',120,132,12,$4)`, [q,company,`TEST-${q}`,revision]);
  await db.query(`INSERT INTO quote_items(id,quote_id,company_id,item_type,name,quantity,unit_price,vat_rate,unit_of_measure,sort_order)
    VALUES($1,$3,$4,'material','Piastrelle',2,10,10,'mq',0),($2,$3,$4,'labor','Posa',4,25,10,'h',1)`, [id(sequence++),id(sequence++),q,company]);
  return q;
};
const prepare = async (q, model = 'vasca-doccia', extra = {}) => (await db.query(
  `SELECT whatsapp_prepare_bathroom_quote($1,$2,$3,$4,$5,$6) AS result`,
  [extra.company ?? company,extra.actor ?? actor,q,model,extra.modelRevision ?? revision,extra.quoteRevision ?? revision])).rows[0].result;
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM bgn_progetti) AS projects,
  (SELECT count(*)::int FROM bgn_computo_voci) AS lines`)).rows[0];
const reject = async (f, pattern, label) => { const before = await counts(); await assert.rejects(f,pattern); check(await counts(),before,label); };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION ai_is_service_role() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.service',true) = 'true' $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,is_blocked boolean DEFAULT false);
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE multi_company_access(user_id uuid,company_id uuid,access_role text,status text,expires_at timestamptz);
    CREATE TABLE staff_permissions(company_id uuid,user_id uuid,sola_lettura boolean,can_view_preventivi boolean,
      can_edit_preventivi boolean,only_assigned boolean,only_my_warehouse boolean);
    CREATE TABLE subscription_plans(id uuid,slug text);
    CREATE TABLE companies(id uuid PRIMARY KEY,subscription_plan_id uuid);
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,PRIMARY KEY(bucket_id,name));
    CREATE TABLE company_feature_overrides(company_id uuid,feature_key text,access_level text,is_enabled boolean,expires_at timestamptz);
    CREATE TABLE plan_feature_defaults(plan_id uuid,feature_key text,access_level text,is_enabled boolean);
    CREATE TABLE platform_feature_flags(key text,default_value boolean,plans_included text[]);
    CREATE TABLE modelli_libreria_azienda(company_id uuid,chiave text,contenuto jsonb,PRIMARY KEY(company_id,chiave));
    CREATE TABLE quotes(id uuid PRIMARY KEY,company_id uuid,quote_number text,status text,client_name text,client_email text,client_phone text,
      indirizzo_lavori text,subtotal numeric,total numeric,vat_amount numeric,prezzo_manuale numeric,discount_percent numeric,
      updated_at timestamptz,deleted_at timestamptz,source text);
    CREATE TABLE quote_items(id uuid PRIMARY KEY,quote_id uuid REFERENCES quotes(id),company_id uuid,item_type text,name text,description text,
      quantity numeric,unit_price numeric,vat_rate numeric,unit_of_measure text,sort_order int,is_optional boolean,discount_percent numeric);
    CREATE TABLE bgn_progetti(id uuid PRIMARY KEY,company_id uuid,code text,stato text,tipo_intervento text,numero_bagni int,updated_at timestamptz DEFAULT now(),
      cliente_nome text,cliente_email text,cliente_telefono text,cantiere_indirizzo text,iva_pct numeric,sconto_pct numeric,detrazione_pct numeric,
      totale_imponibile numeric,totale numeric,note text,created_by uuid,modello_snapshot jsonb,deleted_at timestamptz);
    CREATE TABLE bgn_computo_voci(progetto_id uuid REFERENCES bgn_progetti(id),company_id uuid,capitolo_nome text,descrizione text,
      unita_misura text,quantita numeric,prezzo_unitario numeric,importo numeric,costo_materiali numeric,costo_manodopera numeric,sconto_pct numeric,ordine int);
    INSERT INTO profiles VALUES('${actor}','${company}',false),('${staff}','${company}',false);
    INSERT INTO auth.users VALUES('${actor}'),('${staff}');
    INSERT INTO user_roles VALUES('${actor}','company_admin'),('${staff}','company_staff');
    INSERT INTO companies VALUES('${company}',null);
    INSERT INTO company_feature_overrides VALUES('${company}','modulo_bagni_attivo','enabled',true,null);
    SET test.service='true';`);
  await db.exec(read('20261007104833_silvio_context_isolation_and_memory.sql').split('-- One retrieval entrypoint')[0]);
  await db.exec(read('20261008040053_whatsapp_bathroom_model_atomic.sql'));
  let first;
  for (const model of ['completo','vasca-doccia','doccia','sanitari','accessibilita','rinnovo']) {
    await publish(model); const q = await quote(); const result = await prepare(q,model);
    const project = (await db.query('SELECT * FROM bgn_progetti WHERE id=$1',[result.progetto_id])).rows[0];
    check([project.modello_snapshot.modelId,project.modello_snapshot.template.cover_image_url,Number(project.totale)],
      [model,template(model).cover_image_url,132],`exact ${model} model, photo reference and totals saved`);
    check(project.modello_snapshot.template.pdf_blocchi,{ modulo_intervento: model },`editor-only state removed for ${model}`);
    check((await db.query('SELECT count(*)::int AS n FROM bgn_computo_voci WHERE progetto_id=$1',[result.progetto_id])).rows[0].n,2,`all rows persisted for ${model}`);
    if (model === 'vasca-doccia') first = { q, result };
  }
  const duplicate = await prepare(first.q);
  check([duplicate.progetto_id,duplicate.reused],[first.result.progetto_id,true],'retry reuses exact project without duplicate');
  await reject(() => prepare(first.q,'completo'),/diversa/,'different model never replaces existing project');
  await reject(() => prepare(first.q,'vasca-doccia',{ company: other }),/Company access denied/,'cross-company actor blocked');
  await reject(() => prepare(first.q,'vasca-doccia',{ actor: staff }),/permission denied/,'staff missing edit permissions blocked');
  const changed = await quote();
  await db.query('UPDATE quotes SET updated_at=updated_at+interval \'1 minute\' WHERE id=$1',[changed]);
  await reject(() => prepare(changed),/modificato/,'quote revision changed after confirmation rejected');
  const changedModel = await quote(); await publish('vasca-doccia','2026-10-08T09:00:00.000Z');
  await reject(() => prepare(changedModel),/Modello non pubblicato/,'model changed after confirmation rejected');
  check((await prepare(first.q)).progetto_id,first.result.progetto_id,'later template edits do not alter frozen existing quote');
  await publish('vasca-doccia');
  for (const [sql,pattern,label] of [
    ['UPDATE quote_items SET vat_rate=22 WHERE quote_id=$1 AND item_type=\'labor\'',/IVA mista/,'mixed VAT stops instead of changing totals'],
    ['UPDATE quote_items SET quantity=0 WHERE quote_id=$1',/non convertibile/,'invalid quantities roll back'],
    ['UPDATE quote_items SET unit_of_measure=\'kg\' WHERE quote_id=$1',/non convertibile/,'unsupported units never silently become a corpo'],
    ['UPDATE quote_items SET is_optional=true WHERE quote_id=$1',/non convertibile/,'optional lines require explicit app review'],
    ['UPDATE quotes SET total=133 WHERE id=$1',/Totali non coincidono/,'incorrect totals rejected'],
  ]) { const q = await quote(); await db.query(sql,[q]); await reject(() => prepare(q),pattern,label); }
  await db.exec(`CREATE FUNCTION fail_test_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test row failure'; END $$;
    CREATE TRIGGER fail_test_line BEFORE INSERT ON bgn_computo_voci FOR EACH ROW EXECUTE FUNCTION fail_test_line();`);
  const fail = await quote(); await reject(() => prepare(fail),/test row failure/,'line failure rolls back the project and model together');
  await db.exec('DROP TRIGGER fail_test_line ON bgn_computo_voci');
  await db.exec('SET test.service=\'false\'');
  await reject(() => prepare(first.q),/Service execution required/,'non-service calls rejected');
  await db.exec('SET test.service=\'true\'; UPDATE company_feature_overrides SET is_enabled=false,access_level=\'disabled\'');
  await reject(() => prepare(first.q),/non abilitato/,'disabled company module cannot bypass feature guard');
  await db.exec(read('20261008044530_whatsapp_quote_artifact_receipts.sql'));
  const fp = 'a'.repeat(64), sha = 'b'.repeat(64);
  const path = `bagno/${company}/${first.result.progetto_id}/${fp}-${sha}.pdf`;
  const artifactArgs = [company,actor,first.result.progetto_id,'vasca-doccia',first.result.project_revision,fp,sha,path,500];
  const record = (args = artifactArgs) => db.query('SELECT whatsapp_record_bathroom_artifact($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',args);
  await assert.rejects(record(),/stored_document_missing/); checks++;
  await db.query("INSERT INTO storage.objects VALUES('quote-pdfs',$1)",[path]);
  const saved = (await record()).rows[0].result;
  check([saved.company_id,saved.project_id,saved.model_id,saved.storage_path],[company,first.result.progetto_id,'vasca-doccia',path],'stored receipt binds exact company, project, model and PDF');
  check((await record()).rows[0].result.id,saved.id,'duplicate receipt returns same immutable artifact');
  const wrongProject = [...artifactArgs]; wrongProject[0] = other;
  await assert.rejects(record(wrongProject),/Company access denied/); checks++;
  const stale = [...artifactArgs]; stale[4] = revision;
  await assert.rejects(record(stale),/project_changed_or_forbidden/); checks++;
  const wrongModel = [...artifactArgs]; wrongModel[3] = 'completo';
  await assert.rejects(record(wrongModel),/project_changed_or_forbidden/); checks++;
  const wrongPath = [...artifactArgs]; wrongPath[7] = `bagno/${other}/${first.result.progetto_id}/${fp}-${sha}.pdf`;
  await db.query("INSERT INTO storage.objects VALUES('quote-pdfs',$1)",[wrongPath[7]]);
  await assert.rejects(record(wrongPath),/check constraint/); checks++;
  const oversized = [...artifactArgs]; oversized[8] = 20971521;
  await assert.rejects(record(oversized),/check constraint/); checks++;
  await db.exec("SET test.service='false'"); await assert.rejects(record(),/service_required/); checks++;
  await db.exec("SET test.service='true'");
  for (const role of ['anon','authenticated','service_role']) {
    check((await db.query(`SELECT has_table_privilege('${role}','whatsapp_quote_artifacts','UPDATE') AS ok`)).rows[0].ok,false,`${role} cannot rewrite artifact receipts`);
    check((await db.query(`SELECT has_table_privilege('${role}','whatsapp_quote_artifacts','INSERT') AS ok`)).rows[0].ok,false,`${role} cannot insert unverified receipts directly`);
  }
  for (const role of ['anon','authenticated']) {
    check((await db.query(`SELECT has_function_privilege('${role}','whatsapp_record_bathroom_artifact(uuid,uuid,uuid,text,text,text,text,text,integer)','EXECUTE') AS ok`)).rows[0].ok,false,`${role} cannot call privileged receipt RPC`);
  }
  check((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='whatsapp_quote_artifacts'::regclass")).rows[0].relrowsecurity,true,'artifact table is protected by RLS');
  console.log(`${checks} checks passed. No remote database or WhatsApp calls.`);
} finally { await db.close(); }
