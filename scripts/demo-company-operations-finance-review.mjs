/** Surface proven audit gaps as internal review tasks, never invent a resolution. */
import {C,A,q,guard,insert,read as financialRead,sql,context} from './demo-company-accounting-audit.mjs';
import {uid,save as closureSave,has as closureHas,run} from './demo-company-closure.mjs';
import {read,protectedSQL} from './demo-company-operations.mjs';
const stage='operations-finance-review',marker='[DEMO AUDIT CONTABILE 2026-10-11]',mode=process.argv[2]||'plan';guard();
if(mode==='plan'){
 if(closureHas(stage+'-plan'))throw Error('Preserve prepared financial review');
 const d=financialRead('latest'),p=read('plan'),owner=p.manifest.calendars.find(x=>x.name.includes('Personale e cantiere')).owner_id;
 if(d.company!==C||!owner)throw Error('Wrong company review scope');
 const legacy=d.invoices.find(x=>x.id==='dc07a62f-307a-46a9-832b-845e007840bc'),zero=d.documenti_fiscali.find(x=>x.id==='fc2a0ffd-286a-24fd-007d-e93e473d27e3'),costIDs=['acf423d5-bbb5-1b9d-a4ed-3b2cf96d76dd','5a081708-be59-7cba-78c2-790bb428fe97','7730a1f7-dc41-73f0-67c1-1596ef931f1e','ef308044-1104-da2a-76a8-84c6b0673322'];
 const costs=costIDs.map(id=>d.company_costs.find(x=>x.id===id));
 if(!legacy||!zero||costs.some(x=>!x||x.company_id!==C)||legacy.company_id!==C||zero.company_id!==C||d.documenti_fiscali.some(x=>x.id===legacy.id)||d.prima_nota_entries.some(x=>costIDs.includes(x.cost_id)))throw Error('Audit evidence changed; recapture first');
 const entries=[
  {key:'legacy-invoice',order_id:legacy.order_id,title:'Verifica contabile · '+legacy.number+' da allineare',description:`Documento legacy senza corrispondente documento fiscale nativo. Scostamento nei ricavi gestionali: ${legacy.subtotal} EUR netti. Verificare origine e flusso di emissione con chi lo ha creato; non duplicare, cancellare o emettere un’altra fattura.`,priority:'high'},
  {key:'zero-issued',order_id:zero.ordine_id||null,title:'Verifica contabile · fattura emessa senza righe',description:`${zero.numero}: stato emessa, imponibile zero e nessuna riga. Chiarire origine e uso del documento prima di una rettifica. Nessuna cancellazione o nota di credito automatica.`,priority:'medium'},
  {key:'historic-settlements',order_id:null,title:'Verifica contabile · pagamenti storici da riconciliare',description:'Quattro costi segnati pagati senza prima nota certa: '+costs.map(c=>`${c.name}, ${c.amount} EUR, ${c.paid_date}`).join('; ')+'. Verificare trattenute già presenti nei cedolini e interessi già presenti nei piani mutuo prima di registrare cassa. Non sono nuovi costi né nuove uscite.',priority:'high'},
  {key:'internal-transfers',order_id:null,title:'Verifica contabile · giroconti da escludere dai costi',description:'Nove uscite di giroconto interno, per 31.500 EUR, risultano ancora nella fonte dei costi del controllo di gestione. I trasferimenti sono già registrati in banca: nessun nuovo pagamento. Serve una correzione del motore condiviso, non un costo fittizio o una modifica ai saldi della demo.',priority:'high'},
 ];
 const batches=[entries.map(e=>insert('anomalies',{id:uid(stage+':'+e.key),company_id:C,order_id:e.order_id,type:'fatturazione',priority:e.priority,status:'in_review',title:e.title,description:marker+' '+e.description,impact_amount:0,assigned_to:owner,created_by:A}))];
 batches[0].unshift(`do $$begin if not exists(select 1 from invoices where company_id=${q(C)} and id=${q(legacy.id)}) or exists(select 1 from documenti_fiscali where company_id=${q(C)} and id=${q(legacy.id)}) or exists(select 1 from prima_nota_entries where company_id=${q(C)} and cost_id in(${costIDs.map(q)})) then raise exception 'Reviewed evidence changed';end if;end $$;`);
 batches[0].push(`do $$begin if (${protectedSQL()}) is distinct from ${q(read('before').protected)} then raise exception 'Financial alerts changed money, margins or warehouse';end if;end $$;`);
 closureSave(stage+'-plan',{company:C,batches,manifest:{marker,entries:entries.map(e=>({id:uid(stage+':'+e.key),...e})),newCost:0,newCash:0}},true);console.log({reviewAlerts:4,expenseOrCashChanges:0});
}else if(['dry','apply'].includes(mode))run(stage,mode);
else if(mode==='clarify'){
 sql(`begin;${context}update anomalies set title='Verifica contabile · giroconti da escludere dai costi' where company_id=${q(C)} and id=${q(uid(stage+':internal-transfers'))} and status='in_review' and title='Verifica contabile · giroconti esclusi dai costi';do $$begin if (${protectedSQL()}) is distinct from ${q(read('before').protected)} then raise exception 'Alert label changed money';end if;end $$;commit;`);console.log('Own review alert label clarified; financial records unchanged');
}else if(mode==='verify'){
 const rs=sql(`select id,title,status,impact_amount from anomalies where company_id=${q(C)} and description like ${q(marker+'%')}`);
 if(rs.length!==4||rs.some(x=>x.status!=='in_review'||Number(x.impact_amount)!==0)||sql(protectedSQL())[0].value!==read('before').protected)throw Error('Review alerts did not preserve source data');console.log({savedReviewAlerts:rs.length,costsCashStockMargins:'unchanged'});
}else throw Error('plan | dry | apply | verify');
