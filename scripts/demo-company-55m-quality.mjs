/** Complete planning fields and allocate an already-recorded insurance cost.
 * No additional job/structure expense, insurance policy, or certification.
 */
import {existsSync} from 'node:fs';
import {C,A,MARK,uid,q,read,save,insert,guard,sql} from './demo-company-55m.mjs';
guard();
if(existsSync('tmp/demo-integrated/annual-55m/quality-applied.json'))throw Error('Applied plan immutable');
const jobs=read('business-manifest').orders,fleet=read('resources-manifest').fleet;
save('quality-before',sql(`select id,purchase_price,standard_cost from order_items where order_id in(select id from orders where company_id=${q(C)} and order_code like 'DEMO-2025-%')`));
const statements=[];
for(const job of jobs){let allocated=0;
  for(let n=0;n<6;n++){
    const price=n===5?Math.round((job.materialCost-allocated)*100)/100:Math.round(job.materialCost/6*100)/100;
    allocated=Math.round((allocated+price)*100)/100;
    statements.push(`update order_items set purchase_price=${price},standard_cost=${price} where id=${q(uid('item-'+job.index+'-'+n))} and order_id=${q(job.id)} and notes like ${q(MARK+'%')} and purchase_price=0;`);
  }
  statements.push(`do $$begin if abs((select sum(purchase_price*quantity) from order_items where order_id=${q(job.id)})-${job.materialCost})>.01 then raise exception 'Material planning mismatch';end if;end $$;`);
}
// Shares of the €15,600 annual company insurance already in company_costs.
// These records explain the fleet estimator; they create no second cash event.
for(const asset of fleet)statements.push(insert('mezzi_documenti',{
  id:uid('insurance-cost-share-'+asset.id),company_id:C,mezzo_id:asset.id,
  categoria:'assicurazione',titolo:'DEMO · Quota costo assicurativo, NON polizza',
  ente:'Simulazione interna — nessun assicuratore reale',
  importo:asset.tipo==='furgone'?600:100,
  data_inizio:'2025-01-01',data_scadenza:'2025-12-31',alert_giorni_prima:0,
  created_by:A,note:MARK+' Quota del costo annuale assicurativo già contabilizzato nella struttura. Non copertura assicurativa o certificazione reale. Nessun nuovo costo o pagamento.',
}));
statements.push(`do $$begin if exists(select 1 from v_ordine_costi_mezzi_stimati v join orders o on o.id=v.order_id where o.company_id=${q(C)} and o.order_code like 'DEMO-2025-%' and v.mezzi_senza_costo>0) then raise exception 'Missing fleet cost';end if;end $$;`);
save('quality-plan',{company:C,marker:MARK,batches:[statements]});
console.log({jobs:jobs.length,insuranceCostShares:fleet.length,newCash:0});
