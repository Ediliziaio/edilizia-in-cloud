// Management-role behaviour checks, NOT proof of RLS. All signatures rollback.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const sql=`BEGIN;
SELECT set_config('request.jwt.claim.sub','e592255e-0c82-86cd-7f7b-d3046317f9cd',true);
CREATE TEMP TABLE results(name text,passed boolean);
CREATE TEMP TABLE before_state AS SELECT o.id,o.total_amount,v.preventivo_totale FROM orders o JOIN v_ordine_marginalita v ON v.id=o.id WHERE o.id='d1d16e2e-437a-42eb-a7a0-60c38c22dfbe' AND o.company_id='d2000000-0000-4000-a000-000000000002';
CREATE TEMP TABLE variation_token AS SELECT gen_random_uuid()::text as token;
INSERT INTO ordini_variazione(company_id,order_id,numero_odv,titolo,descrizione,impatto_economico,impatto_giorni,status,firma_token)
SELECT 'd2000000-0000-4000-a000-000000000002',b.id,COALESCE((select max(numero_odv) from ordini_variazione where order_id=b.id),0)+1,'TEST ROLLBACK NON REALE','Firma sintetica per test transazionale, non conservata',1250,2,'in_attesa',t.token FROM before_state b CROSS JOIN variation_token t;
INSERT INTO results SELECT 'pending_does_not_increase_revenue',v.preventivo_totale=b.preventivo_totale FROM v_ordine_marginalita v JOIN before_state b USING(id);
SELECT odv_sign_with_token(token,'TEST-DEMO-ROLLBACK-NON-FIRMA-REALE','TEST DEMO') FROM variation_token;
INSERT INTO results SELECT 'approved_increases_revenue_once',v.preventivo_totale=b.preventivo_totale+1250 FROM v_ordine_marginalita v JOIN before_state b USING(id);
INSERT INTO results SELECT 'base_contract_unchanged',o.total_amount=b.total_amount FROM orders o JOIN before_state b USING(id);
INSERT INTO results SELECT 'second_signature_rejected',NOT (odv_sign_with_token(token,'TEST-DEMO','TEST DEMO')->>'success')::boolean FROM variation_token;
INSERT INTO results SELECT 'approved_cannot_be_rejected',NOT (odv_reject_with_token(token,'TEST DEMO')->>'success')::boolean FROM variation_token;
INSERT INTO results SELECT 'invalid_token_rejected',NOT (odv_sign_with_token('not-a-real-token','TEST-DEMO','TEST DEMO')->>'success')::boolean;
SELECT * FROM results; ROLLBACK;`;
const rows=JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'})).rows;
writeFileSync('work/demo-cfo/variation-audit.json',JSON.stringify(rows,null,2));
console.log(rows);
if(rows.length!==6 || rows.some(r=>!r.passed))process.exitCode=1;
