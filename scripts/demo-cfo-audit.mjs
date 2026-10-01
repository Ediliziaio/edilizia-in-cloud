import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const m=JSON.parse(readFileSync('work/demo-cfo/manifest.json','utf8'));
const id=key=>m.records.find(r=>r.key===key).id;
const q=s=>`'${s.replaceAll("'","''")}'`;
const order=id('order-int'),report=id('int-report-0'),employee=id('employee-0'),phase=id('int-phase-0');
const auth="SELECT set_config('request.jwt.claim.sub','e592255e-0c82-86cd-7f7b-d3046317f9cd',true);";
// Every test is ROLLED BACK, including changed tariffs, approvals and payments.
const sql=`BEGIN; ${auth}
CREATE TEMP TABLE audit_results(name text, passed boolean, detail jsonb);
CREATE TEMP TABLE before_cost AS SELECT * FROM v_ordine_marginalita WHERE id=${q(order)};
UPDATE campo_rapportini SET stato='inviato',approvato=false WHERE id=${q(report)};
UPDATE campo_rapportini SET stato='approvato',approvato=true WHERE id=${q(report)};
INSERT INTO audit_results SELECT 'reapproval_is_idempotent',v.consuntivo=b.consuntivo,to_jsonb(v) FROM v_ordine_marginalita v JOIN before_cost b USING(id);
UPDATE campo_rapportini SET stato='approvato' WHERE id=${q(report)};
INSERT INTO audit_results SELECT 'repeated_approval_no_duplicate',v.consuntivo=b.consuntivo,'{}'::jsonb FROM v_ordine_marginalita v JOIN before_cost b USING(id);
UPDATE order_installments SET is_paid=true,paid_date='2026-09-30' WHERE order_id=${q(order)} AND type='balance';
INSERT INTO audit_results SELECT 'payment_does_not_change_margin',v.margine=b.margine,'{}'::jsonb FROM v_ordine_marginalita v JOIN before_cost b USING(id);
UPDATE campo_rapportini SET stato='inviato',approvato=false WHERE id=${q(report)};
UPDATE employees SET costo_orario=40 WHERE id=${q(employee)};
UPDATE campo_rapportini SET stato='approvato',approvato=true WHERE id=${q(report)};
UPDATE campo_rapportini SET stato='inviato',approvato=false WHERE id=${q(report)};
INSERT INTO audit_results SELECT 'revoke_recalculates_hourly_rate',hourly_rate=round(total_cost/nullif(hours_worked,0),2),jsonb_build_object('rate',hourly_rate,'cost',total_cost,'hours',hours_worked) FROM order_employees WHERE order_id=${q(order)} AND employee_id=${q(employee)} AND phase_id=${q(phase)};
SELECT * FROM audit_results; ROLLBACK;`;
const raw=execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'});
const results=JSON.parse(raw).rows;
writeFileSync('work/demo-cfo/behavior-audit.json',JSON.stringify(results,null,2));
console.log(results);
if(results.some(r=>!r.passed))process.exitCode=1;
