/** Allocate rounding remainder to the last planned line and phase only.
 * Existing issued fiscal documents, job contract totals and actual costs stay unchanged.
 */
import {existsSync} from 'node:fs';
import {C,MARK,uid,q,read,save,guard} from './demo-company-55m.mjs';
guard();if(existsSync('tmp/demo-integrated/annual-55m/plan-balances-applied.json'))throw Error('Applied plan immutable');
const statements=[];
for(const job of read('business-manifest').orders){let allocated=0;
  for(let n=0;n<6;n++){
    const amount=n===5?Math.round((job.amount-allocated)*100)/100:Math.round(job.amount/6*100)/100;
    allocated=Math.round((allocated+amount)*100)/100;
    statements.push(`update order_items set unit_price=${amount} where id=${q(uid('item-'+job.index+'-'+n))} and order_id=${q(job.id)} and notes like ${q(MARK+'%')};`);
    statements.push(`update order_work_phases set importo_venduto=${amount} where id=${q(uid('phase-'+job.index+'-'+n))} and order_id=${q(job.id)} and company_id=${q(C)} and notes like ${q(MARK+'%')};`);
  }
  statements.push(`do $$begin if abs((select sum(unit_price*quantity) from order_items where order_id=${q(job.id)})-${job.amount})>.001 or abs((select sum(importo_venduto) from order_work_phases where order_id=${q(job.id)})-${job.amount})>.001 then raise exception 'Planned net totals mismatch';end if;end $$;`);
}
save('plan-balances-plan',{company:C,marker:MARK,batches:[statements]});
console.log({jobs:48,financialDocumentsChanged:0});
