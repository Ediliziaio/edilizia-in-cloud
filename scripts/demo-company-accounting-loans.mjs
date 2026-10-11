/** Future loan instalments: documented monthly amount, indicative date, no actual debit. */
import {createHash} from 'node:crypto';
import {C,AS_OF,MARK,q,sql,guard,context,insert,read,save,has} from './demo-company-accounting-audit.mjs';
import {uid} from './demo-company-accounting-repair.mjs';
import {sum} from './demo-company-accounting-verify.mjs';
guard();const mode=process.argv[2]||'plan',hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(mode==='plan'){
 if(has('loans-applied'))throw Error('Preserve applied plan');
 const s=read('latest'),rows=[],statements=[];
 if(s.cg_cash_flow_manuali.some(m=>m.anno===2026&&m.mese>=10&&/mutuo|rata.*finanziamento/i.test(m.descrizione)))throw Error('A loan forecast already exists: review duplicates');
 for(const loan of s.cg_loans.filter(l=>l.is_active))for(let month=10;month<=12;month++){
  const date=`2026-${month}-28`;if(date<AS_OF||date<loan.data_inizio||date>loan.data_fine)continue;
  if(!(loan.rata_mensile>0))throw Error('Missing documented instalment');
  const row={id:uid('loan-forecast:'+loan.id+':2026:'+month),company_id:C,anno:2026,mese:month,tipo:'uscita',categoria:'Mutui - rata complessiva',descrizione:'DEMO - Rata prevista '+loan.descrizione,importo:Number(loan.rata_mensile),ricorrente:false,note:MARK+' PREVISIONE, NON PAGATA. Rata complessiva da cg_loans '+loan.id+'. Il giorno 28 è indicativo: la data contrattuale non è registrata. Non è un secondo costo di interessi e non aggiorna il capitale residuo.'};rows.push(row);statements.push(insert('cg_cash_flow_manuali',row));
 }
 const p={company:C,asOf:AS_OF,rows,total:sum(rows,'importo'),statements};save('loans-plan',p);console.log(JSON.stringify({rows:rows.length,forecast:p.total,newCosts:0,newCashPayments:0}));
}else{
 const p=read('loans-plan');if(!['dry','apply'].includes(mode))throw Error('Unknown mode');if(mode==='apply'&&(!has('loans-dry')||read('loans-dry').hash!==hash(p)))throw Error('Rollback rehearsal required');if(mode==='apply'&&has('loans-applied')){console.log('Already applied');process.exit(0);}
 sql(`begin;${context}${p.statements.join('\n')}${mode==='dry'?'rollback':'commit'};`);save('loans-'+(mode==='dry'?'dry':'applied'),{hash:hash(p),at:new Date().toISOString()});console.log(mode+' OK');
}
