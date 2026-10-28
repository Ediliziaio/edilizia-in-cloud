// Isolated PostgreSQL 17 in WASM. Never connects to production or sends messages.
// deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env scripts/test-custom-fields-server.mts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333", F = "44444444-4444-4444-8444-444444444444", U = "55555555-5555-4555-8555-555555555555";
let checks = 0;
const assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks++; };
const rejects = async (sql: string, label: string) => { let rejected = false; try { await db.exec(sql); } catch { rejected = true; } assert(rejected, label); };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;
    CREATE FUNCTION public.has_permission_for_company(u uuid,p text,c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT u IS NOT NULL AND c::text=current_setting('app.company',true) AND (NOT p LIKE 'can_edit_%' OR current_setting('app.edit',true)='true')$$;
    CREATE TABLE marketing_custom_fields(id uuid PRIMARY KEY,company_id uuid NOT NULL,name text NOT NULL,object_type text NOT NULL,field_type text NOT NULL,options text[],is_required boolean DEFAULT false,deleted_at timestamptz);
    CREATE TABLE staff_permissions(user_id uuid,company_id uuid,sola_lettura boolean);
    CREATE FUNCTION public.utente_sola_lettura(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM staff_permissions WHERE user_id=auth.uid() AND company_id=c AND sola_lettura)$$;
    CREATE TABLE marketing_contacts(id uuid PRIMARY KEY,company_id uuid NOT NULL);
    CREATE TABLE marketing_opportunities(id uuid PRIMARY KEY,company_id uuid NOT NULL);
    CREATE TABLE marketing_contact_field_values(id uuid DEFAULT gen_random_uuid(),contact_id uuid,field_id uuid,value text);
    CREATE TABLE marketing_opportunity_field_values(id uuid DEFAULT gen_random_uuid(),opportunity_id uuid,field_id uuid,value text);
    CREATE TABLE entity_custom_field_values(id uuid DEFAULT gen_random_uuid(),company_id uuid,entity_type text,entity_id uuid,field_id uuid,value text,UNIQUE(entity_type,entity_id,field_id));
    ALTER TABLE entity_custom_field_values ENABLE ROW LEVEL SECURITY;`);
  const targets = ['appointments','tasks','employees','warehouse_stock','ordini_variazione','giornale_lavori','duvri_documents','orders','quotes',...['sr','fv','bgn','rst','tet','clm','idr','ele','pav','pis'].map(s=>s+'_progetti')];
  for (const t of targets) await db.exec(`CREATE TABLE ${t}(id uuid PRIMARY KEY,company_id uuid NOT NULL,stato text DEFAULT 'bozza'); ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY; CREATE POLICY parent_tenant ON ${t} FOR SELECT TO authenticated USING(company_id::text=current_setting('app.company',true) AND coalesce(current_setting('app.hide_parent',true),'')<>'true');`);
  await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;`);
  const sql = (await Promise.all(["20281026160000_campi_personalizzati_validazione_alias.sql","20281026160100_campi_personalizzati_sola_lettura_crm.sql"].map(name => Deno.readTextFile(new URL(`../supabase/migrations/${name}`, import.meta.url))))).join("\n");
  await db.exec(`BEGIN;${sql}COMMIT;`);
  await db.exec(`INSERT INTO quotes(id,company_id) VALUES('${R}','${A}'); INSERT INTO marketing_contacts VALUES('${R}','${A}'); INSERT INTO marketing_opportunities VALUES('${R}','${A}');
    INSERT INTO marketing_custom_fields(id,company_id,name,object_type,field_type) VALUES('${F}','${A}','Codice cliente','quote','number');
    SET app.uid='${U}'; SET app.company='${A}'; SET app.edit='true'; SET ROLE authenticated;`);
  const insert = (value: string, company = A, record = R, field = F, entity = 'quote') => `INSERT INTO entity_custom_field_values(company_id,entity_type,entity_id,field_id,value) VALUES('${company}','${entity}','${record}','${field}','${value}') ON CONFLICT(entity_type,entity_id,field_id) DO UPDATE SET value=excluded.value`;
  await db.exec(insert('12,50'));
  assert((await db.query<{value:string}>('SELECT value FROM entity_custom_field_values')).rows[0].value === '12.50','normalizza decimali');
  await rejects(insert('NaN'),'rifiuta numero invalido');
  await rejects(insert('12',B),'rifiuta azienda diversa');
  await rejects(insert('12',A,U),'rifiuta record inesistente');
  await rejects(insert('12',A,R,U),'rifiuta definizione inesistente');
  await rejects(insert('12',A,R,F,'warehouse'),'rifiuta oggetto discordante');
  await db.exec(`SET app.edit='false'`); await rejects(insert('15'),'rifiuta ruolo sola lettura');
  await db.exec(`SET app.edit='true'; RESET ROLE; INSERT INTO staff_permissions VALUES('${U}','${A}',true); SET ROLE authenticated`);
  await rejects(insert('15'),'sola lettura prevale sui permessi del modulo');
  await db.exec(`RESET ROLE; DELETE FROM staff_permissions; SET ROLE authenticated; SET app.edit='false'`);
  assert((await db.query('SELECT * FROM entity_custom_field_values')).rows.length===1,'sola lettura mantiene lettura');
  await db.exec(`SET app.hide_parent='true'`);
  assert((await db.query('SELECT * FROM entity_custom_field_values')).rows.length===0,'rispetta restrizioni del record padre');
  await db.exec(`SET app.hide_parent='false'; SET app.edit='true'; RESET ROLE`);
  await db.exec(`UPDATE marketing_custom_fields SET name='Riferimento cliente' WHERE id='${F}'`);
  assert((await db.query<{key_aliases:string[]}>(`SELECT key_aliases FROM marketing_custom_fields WHERE id='${F}'`)).rows[0].key_aliases.includes('codice_cliente'),'mantiene alias storico');
  await rejects(`INSERT INTO marketing_custom_fields(id,company_id,name,object_type,field_type) VALUES('${U}','${A}','Codice cliente','quote','text')`,'protegge alias da riuso');
  await rejects(`UPDATE marketing_custom_fields SET field_type='checkbox' WHERE id='${F}'`,'blocca cambio tipo valorizzato');
  await db.exec(`UPDATE marketing_custom_fields SET deleted_at=now() WHERE id='${F}'`); await rejects(insert('12'),'rifiuta campo archiviato');
  await db.exec(`UPDATE marketing_custom_fields SET deleted_at=null WHERE id='${F}'; DELETE FROM entity_custom_field_values; UPDATE marketing_custom_fields SET field_type='checkbox' WHERE id='${F}'`);
  await db.exec(insert('false')); await rejects(insert('forse'),'rifiuta booleano non valido');
  assert((await db.query<{value:string}>('SELECT value FROM entity_custom_field_values')).rows[0].value==='false','preserva false');
  await db.exec(`DELETE FROM entity_custom_field_values; UPDATE marketing_custom_fields SET field_type='multiselect', options=ARRAY['A','B'] WHERE id='${F}'`);
  await db.exec(insert('["A","B"]')); await rejects(insert('["A","X"]'),'rifiuta scelta non prevista'); await rejects(insert('A,B'),'rifiuta CSV ambiguo');
  await db.exec(`DELETE FROM entity_custom_field_values; UPDATE marketing_custom_fields SET object_type='contact',field_type='number',options=null WHERE id='${F}'`);
  await db.exec(`INSERT INTO marketing_contact_field_values(contact_id,field_id,value) VALUES('${R}','${F}','0')`);
  await db.exec(`INSERT INTO staff_permissions VALUES('${U}','${A}',true); SET ROLE authenticated`);
  await rejects(`INSERT INTO marketing_contact_field_values(contact_id,field_id,value) VALUES('${R}','${F}','1')`,'CRM: sola lettura prevale anche sulle vecchie policy permissive');
  await db.exec(`RESET ROLE; DELETE FROM staff_permissions`);
  await rejects(`INSERT INTO marketing_contact_field_values(contact_id,field_id,value) VALUES('${U}','${F}','0')`,'CRM: rifiuta record sconosciuto');
  await rejects(`INSERT INTO marketing_opportunity_field_values(opportunity_id,field_id,value) VALUES('${R}','${F}','0')`,'CRM: rifiuta definizione di altro oggetto');
  // All native wizard identifiers resolve to a real, whitelisted parent table.
  await db.exec(`DELETE FROM marketing_contact_field_values; UPDATE marketing_custom_fields SET object_type='quote' WHERE id='${F}'`);
  for (const prefix of ['sr','fv','bgn','rst','tet','clm','idr','ele','pav','pis']) {
    await db.exec(`INSERT INTO ${prefix}_progetti(id,company_id) VALUES('${R}','${A}'); SET ROLE authenticated;`);
    await db.exec(insert('0', A, R, F, 'quote_'+prefix));
    assert((await db.query(`SELECT 1 FROM entity_custom_field_values WHERE entity_type='quote_${prefix}'`)).rows.length===1,`wizard ${prefix}: roundtrip`);
    await db.exec('RESET ROLE');
  }
  await db.exec(`UPDATE quotes SET stato='firmato' WHERE id='${R}'; SET ROLE authenticated`);
  await rejects(insert('12'),'blocca scritture sui documenti consolidati');
  console.log(`PostgreSQL isolato: ${checks} verifiche superate. Nessuna connessione remota.`);
} finally { await db.close(); }
