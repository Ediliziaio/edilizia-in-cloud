// Rollback-only regression checks, restricted to our fictional stock and job.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const m=JSON.parse(readFileSync('work/demo-cfo/manifest.json','utf8'));
const id=key=>m.records.find(r=>r.key===key).id;
const stock=id('cemento'),order=id('order-int'),item=id('int-cemento-item');
const candidate=process.argv.includes('--candidate') ? readFileSync('supabase/migrations/20281001160000_installazione_stock_senza_doppio_scarico.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'') : '';
const sql=`BEGIN;
SELECT set_config('request.jwt.claim.sub','e592255e-0c82-86cd-7f7b-d3046317f9cd',true);
${candidate}
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM orders WHERE id='${order}' AND company_id='${m.company}' AND order_code='DEMO-CFO-INT-01') THEN RAISE EXCEPTION 'Not our fixture'; END IF; END $$;
CREATE TEMP TABLE stock_audit(name text,passed boolean);
CREATE TEMP TABLE stock_before AS SELECT quantity FROM warehouse_stock WHERE id='${stock}';
CREATE TEMP TABLE cost_before AS SELECT consuntivo FROM v_ordine_marginalita WHERE id='${order}';
UPDATE order_items SET status='in_magazzino',auto_deducted=false WHERE id='${item}';
UPDATE warehouse_movements SET order_item_id=NULL WHERE stock_item_id='${stock}' AND order_id='${order}';
DO $$ BEGIN
 BEGIN UPDATE order_items SET status='installato' WHERE id='${item}';
   INSERT INTO stock_audit VALUES('unallocated_movement_is_blocked',false);
 EXCEPTION WHEN OTHERS THEN INSERT INTO stock_audit VALUES('unallocated_movement_is_blocked',SQLERRM LIKE '%collega i movimenti%'); END;
END $$;
UPDATE warehouse_movements SET order_item_id='${item}' WHERE stock_item_id='${stock}' AND order_id='${order}';
UPDATE order_items SET status='installato' WHERE id='${item}';
INSERT INTO stock_audit SELECT 'already_withdrawn_not_deducted_twice',s.quantity=b.quantity AND v.consuntivo=c.consuntivo FROM warehouse_stock s,stock_before b,cost_before c,v_ordine_marginalita v WHERE s.id='${stock}' AND v.id='${order}';
UPDATE order_items SET status='in_magazzino' WHERE id='${item}';
UPDATE order_items SET status='installato' WHERE id='${item}';
INSERT INTO stock_audit SELECT 'repeat_installation_is_idempotent',s.quantity=b.quantity FROM warehouse_stock s,stock_before b WHERE s.id='${stock}';
UPDATE order_items SET status='in_magazzino',auto_deducted=false,quantity=quantity+3 WHERE id='${item}';
UPDATE order_items SET status='installato' WHERE id='${item}';
INSERT INTO stock_audit SELECT 'only_residual_is_deducted_and_costed',s.quantity=b.quantity-3 AND v.consuntivo=c.consuntivo+22.5 FROM warehouse_stock s,stock_before b,cost_before c,v_ordine_marginalita v WHERE s.id='${stock}' AND v.id='${order}';
UPDATE order_items SET status='in_magazzino',auto_deducted=false,quantity=100000 WHERE id='${item}';
DO $$ BEGIN
 BEGIN UPDATE order_items SET status='installato' WHERE id='${item}';
   INSERT INTO stock_audit VALUES('insufficient_stock_is_blocked',false);
 EXCEPTION WHEN OTHERS THEN INSERT INTO stock_audit VALUES('insufficient_stock_is_blocked',SQLERRM LIKE '%Giacenza insufficiente%'); END;
END $$;
INSERT INTO stock_audit SELECT 'failed_operation_keeps_stock',s.quantity=b.quantity-3 FROM warehouse_stock s,stock_before b WHERE s.id='${stock}';
SELECT * FROM stock_audit; ROLLBACK;`;
const results=JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'})).rows;
writeFileSync('work/demo-cfo/stock-audit.json',JSON.stringify(results,null,2));
console.log(results);
if(results.length!==6 || results.some(r=>!r.passed))process.exitCode=1;
