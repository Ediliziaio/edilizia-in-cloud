// Completes only this fixture's payment/vehicle metadata. Re-runnable.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const m=JSON.parse(readFileSync('work/demo-cfo/manifest.json','utf8'));
const q=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
const id=key=>m.records.find(r=>r.key===key).id;
const uuid=key=>{const h=createHash('md5').update(`${m.marker}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;};
const sql=['BEGIN;',"SELECT set_config('request.jwt.claim.sub','e592255e-0c82-86cd-7f7b-d3046317f9cd',true);"];
const added=[];
for(const j of m.jobs){
 sql.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM orders WHERE id=${q(j.id)} AND company_id=${q(m.company)} AND internal_notes LIKE ${q(m.marker+'%')}) THEN RAISE EXCEPTION 'Not our fixture'; END IF; END $$;`);
 sql.push(`UPDATE orders SET current_status_id='30b59d2d-0248-b631-d969-5928f5270ece',fulfillment_status='completed' WHERE id=${q(j.id)} AND current_status_id IS NULL;`);
 sql.push(`UPDATE orders SET indirizzo_lavori=work_address WHERE id=${q(j.id)} AND indirizzo_lavori IS NULL;`);
 // This fixture has exactly one cement line per job. Explicit association,
 // never a product-name guess; prevents the installation trigger deducting twice.
 sql.push(`UPDATE warehouse_movements SET order_item_id=${q(id(`${j.key}-cemento-item`))} WHERE stock_item_id=${q(id('cemento'))} AND order_id=${q(j.id)} AND order_item_id IS NULL;`);
 // These fixtures represent completed works: material is consumed/installed,
 // not still waiting for a supplier order after the warehouse withdrawal.
 sql.push(`UPDATE order_items SET status='installato' WHERE order_id=${q(j.id)} AND id IN (${m.records.filter(r=>r.table==='order_items').map(r=>q(r.id)).join(',')});`);
 sql.push(`UPDATE order_employees SET is_paid=true,paid_date='2026-09-30' WHERE order_id=${q(j.id)} AND notes LIKE ${q(m.marker+'%')} AND NOT is_paid;`);
 for(let n=0;n<2;n++){
  sql.push(`UPDATE mezzi SET possesso='noleggio_lungo',rata_mensile=${n?60:350},note=${q(m.marker+' Canone simulato: sola incidenza gestionale, esclusa dai costi diretti.')} WHERE id=${q(id(`${j.key}-mezzo-${n}`))} AND rata_mensile IS NULL;`);
 }
 sql.push(`UPDATE company_costs SET name=${q(`DEMO CFO · ${j.key} · Sicurezza, DPI e consumabili`)},notes=${q(m.marker+' Costi diretti diversi dai canoni mezzi stimati.')} WHERE id=${q(id(`${j.key}-cost-1`))};`);
 // Cash ledger uses supplier bills. Linked ODA prevents double counting expenses.
 for(let n=0;n<2;n++) {
  const bid=uuid(`${j.key}-supplier-payment-${n}`);added.push({table:'company_costs',id:bid});
  sql.push(`INSERT INTO company_costs(id,company_id,order_id,purchase_order_id,supplier_id,name,cost_type,recurrence,amount,vat_rate,is_paid,paid_date,due_date,notes,payment_method)
   VALUES(${q(bid)},${q(m.company)},${q(j.id)},${q(id(`${j.key}-po`))},${q(id('supplier'))},${q(`DEMO CFO · ${j.key} · fornitore ${n?'saldo':'acconto'}`)},'variable','once',${j.expected.purchase*(n?.4:.6)},22,${n?'false':'true'},${n?'NULL':"'2026-08-12'"},${n?"'2026-10-10'":"'2026-08-12'"},${q(m.marker+' Scadenza collegata ODA: cassa, non nuovo costo.')},'bonifico') ON CONFLICT(id) DO NOTHING;`);
 }
 sql.push(`UPDATE order_items SET deposit_amount=round(quantity*purchase_price*0.6,2),deposit_paid=true,deposit_paid_date='2026-08-12',balance_amount=round(quantity*purchase_price*0.4,2),balance_expected_date='2026-10-10' WHERE order_id=${q(j.id)} AND description=${q(m.marker)} AND deposit_paid IS NOT TRUE;`);
 // Names in report presence snapshots are UI labels, not new accounts.
 sql.push(`UPDATE campo_rapportini r SET presenze=(SELECT jsonb_agg(p || jsonb_build_object('nome',e.first_name||' '||e.last_name)) FROM jsonb_array_elements(r.presenze) p JOIN employees e ON e.id=(p->>'employee_id')::uuid) WHERE r.order_id=${q(j.id)} AND jsonb_array_length(r.presenze)>0 AND r.note='Simulazione: nessuna firma o geolocalizzazione reale.';`);
 sql.push(`UPDATE campo_rapportini SET percentuale_avanzamento=least(100,round((data_lavoro-'2026-08-01'::date)::numeric/60*100)),lavoro_completato=(data_lavoro='2026-09-30') WHERE order_id=${q(j.id)} AND note='Simulazione: nessuna firma o geolocalizzazione reale.';`);
}
const entityIds=[...m.records,...added].map(r=>q(r.id)).join(',');
sql.push(`DELETE FROM automation_trigger_events WHERE company_id=${q(m.company)} AND created_at>=transaction_timestamp() AND entity_id IN (${entityIds}); DELETE FROM wa_notifiche_event_queue WHERE company_id=${q(m.company)} AND created_at>=transaction_timestamp() AND subject_id IN (${entityIds});`);
for(const j of m.jobs)sql.push(`DO $$ BEGIN IF (SELECT consuntivo FROM v_ordine_marginalita WHERE id=${q(j.id)})<>${j.expected.consuntivo} THEN RAISE EXCEPTION 'Enrichment changed costs'; END IF; END $$;`);
sql.push('COMMIT;');
writeFileSync('work/demo-cfo/enrichment.sql',sql.join('\n'));
writeFileSync('work/demo-cfo/enrichment-records.json',JSON.stringify(added,null,2));
execFileSync('supabase',['db','query','--linked','-o','json','--file','work/demo-cfo/enrichment.sql'],{stdio:'inherit'});
