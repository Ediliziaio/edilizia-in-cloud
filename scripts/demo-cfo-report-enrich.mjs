// Fill operational fields on DEMO reports ONLY. No approvals, stock or signatures.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const m=JSON.parse(readFileSync('work/demo-cfo/manifest.json','utf8'));
const ids=['int','mix','sub'].map(k=>m.records.find(r=>r.key==='order-'+k).id);
const scope=ids.map(id=>"'"+id+"'").join(',');
const query=sql=>JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'})).rows;
const before=query(`select id,presenze,materiali_usati from campo_rapportini where company_id='${m.company}' and order_id in (${scope})`);
if(before.length!==90)throw new Error('Expected 90 DEMO reports');
writeFileSync('work/demo-cfo/reports-before-enrichment.json',JSON.stringify(before,null,2));
const sql=`BEGIN;
SELECT set_config('request.jwt.claim.sub','e592255e-0c82-86cd-7f7b-d3046317f9cd',true);
CREATE TEMP TABLE before_margin AS SELECT id,consuntivo,margine FROM v_ordine_marginalita WHERE id IN (${scope});
WITH ranked AS (
 SELECT r.id, row_number() over(partition by r.order_id order by r.data_lavoro,r.id) as day,
 i.id as item_id, i.name as item_name,i.quantity as used_quantity
 FROM campo_rapportini r JOIN order_items i ON i.order_id=r.order_id AND i.name='DEMO · Premiscelato cementizio (sacco 25 kg)'
 WHERE r.company_id='${m.company}' AND r.order_id IN (${scope}) AND r.descrizione_lavori LIKE '[DEMO CFO 2026-09 v1]%'
)
UPDATE campo_rapportini r SET
 presenze=COALESCE((SELECT jsonb_agg(CASE WHEN COALESCE(p->>'nome','')='' AND e.id IS NOT NULL THEN p||jsonb_build_object('nome',concat_ws(' ',e.first_name,e.last_name)) ELSE p END)
 FROM jsonb_array_elements(COALESCE(r.presenze,'[]'::jsonb)) p LEFT JOIN employees e ON e.id::text=p->>'employee_id' AND e.company_id=r.company_id),'[]'::jsonb),
 materiali_usati=CASE WHEN ranked.day<=ranked.used_quantity/5 AND COALESCE(jsonb_array_length(r.materiali_usati),0)=0
 THEN jsonb_build_array(jsonb_build_object('nome',ranked.item_name,'order_item_id',ranked.item_id,'quantita',5,'unita','sacchi','da_furgone',false))
 ELSE r.materiali_usati END
 FROM ranked WHERE r.id=ranked.id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM before_margin b JOIN v_ordine_marginalita v USING(id) WHERE v.consuntivo IS DISTINCT FROM b.consuntivo OR v.margine IS DISTINCT FROM b.margine)
 THEN RAISE EXCEPTION 'Unexpected margin change: rollback report enrichment'; END IF;
END $$;
SELECT o.order_code,count(*) as reports,count(*) FILTER(WHERE jsonb_array_length(r.materiali_usati)>0) as with_materials,
 (SELECT sum((p->>'quantita')::numeric) FROM campo_rapportini rr CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rr.materiali_usati,'[]'::jsonb)) p WHERE rr.order_id=o.id) as sacks_declared
 FROM campo_rapportini r JOIN orders o ON o.id=r.order_id WHERE r.company_id='${m.company}' AND r.order_id IN (${scope}) GROUP BY o.id,o.order_code;
COMMIT;`;
console.log(query(sql));
