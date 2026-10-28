// Isolated import rehearsal. No credentials, network or remote writes.
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const db = new PGlite();
const bundle = await build({ entryPoints: ['scripts/fixtures/prepareWindowImport.ts'], bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.sql': 'text' } });
const { prepareWindowImport, windowImportSql } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const sql = windowImportSql(prepareWindowImport());
const cid='d2000000-0000-4000-a000-000000000002', tid='669ad79f-b13a-484c-9137-3388a2ae4a71', sid='094083a9-ae8e-4f12-b545-30d9ea1b2473';
await db.exec(`
create table companies(id uuid primary key,name text);
create table survey_templates(id uuid primary key,company_id uuid,category text,is_active boolean);
create table surveys(id uuid primary key,company_id uuid references companies,template_id uuid references survey_templates,status text,mode text,address text,city text,header_data jsonb,notes text,code text default 'SOP-ISOLATED',client_id uuid,order_id uuid);
create table survey_areas(id uuid primary key,survey_id uuid references surveys,name text,position integer,area_data jsonb,notes text,is_complete boolean);
create table survey_elements(id uuid primary key,survey_id uuid references surveys,area_id uuid references survey_areas,element_type text,element_label text,position integer,values jsonb,quantity integer,notes text,is_complete boolean,missing_required_fields text[]);
insert into companies values('${cid}','Demo Azienda 2 S.r.l.');
insert into survey_templates values('${tid}',null,'infissi',true);
insert into surveys(id,company_id,template_id,status,notes) values('00000000-0000-4000-a000-000000000001','${cid}','${tid}','draft','NON MODIFICARE');
`);
const rows=async q=>(await db.query(q)).rows;
await db.exec(sql);
assert.equal((await rows(`select count(*)::int n from surveys`))[0].n,2);
assert.equal((await rows(`select count(*)::int n from survey_areas where survey_id='${sid}'`))[0].n,6);
assert.equal((await rows(`select count(*)::int n from survey_elements where survey_id='${sid}'`))[0].n,16);
assert.equal((await rows(`select notes from surveys where id='00000000-0000-4000-a000-000000000001'`))[0].notes,'NON MODIFICARE');
assert.equal((await rows(`select count(*)::int n from survey_elements where is_complete or values->>'rv_order_checked'<>'false'`))[0].n,0);
assert.equal((await rows(`select count(*)::int n from surveys where id='${sid}' and status='draft' and client_id is null and order_id is null`))[0].n,1);
await db.exec(sql);
assert.equal((await rows(`select count(*)::int n from survey_elements`))[0].n,16,'retry must not duplicate');
// Deliberately invalid payload: all inserts must roll back, never leave a partial survey.
await db.exec(`delete from survey_elements where survey_id='${sid}'; delete from survey_areas where survey_id='${sid}'; delete from surveys where id='${sid}';`);
let rejected=false;
try {await db.exec(sql.replace("if jsonb_array_length(p->'areas')<>6", "if jsonb_array_length(p->'areas')<>7"));} catch {rejected=true; await db.exec('rollback');}
assert.equal(rejected,true);
assert.equal((await rows(`select count(*)::int n from surveys`))[0].n,1);
assert.equal((await rows(`select count(*)::int n from survey_elements`))[0].n,0);
console.log('10 isolated import checks passed. No remote writes.');
await db.close();
