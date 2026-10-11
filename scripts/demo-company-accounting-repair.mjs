/** Evidence-only tenant repairs. Never change invoice fiscal content or bank amounts. */
import {createHash} from 'node:crypto';
import {C,A,q,j,sql,guard,context,insert,read,save,has,MARK} from './demo-company-accounting-audit.mjs';
import {cents} from './demo-company-accounting-verify.mjs';
export const uid=key=>{const h=createHash('sha256').update(MARK+'|'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const summary=s=>({
 invoices:hash(s.documenti_fiscali.map(({pdf_url,updated_at,...x})=>x).sort((a,b)=>a.id.localeCompare(b.id))),
 bank:hash(s.bank_transactions.map(x=>({id:x.id,amount:x.amount,date:x.booking_date,account:x.account_id})).sort((a,b)=>a.id.localeCompare(b.id))),
 costs:hash(s.company_costs.map(x=>({id:x.id,amount:x.amount,paid:x.is_paid,date:x.paid_date})).sort((a,b)=>a.id.localeCompare(b.id))),
});
export function build(){
 const s=read('latest'),links=read('link-candidates'),statements=[],manifest={company:C,marker:MARK,baseline:summary(s),linkedPayments:[],classifiedCosts:[],vatCorrections:[],classificationAliases:[],receiptCorrections:[]};
 for(const x of links.resolved){
  if(x.date!==x.bankDate)throw Error('Uncertain payment date');
  statements.push(`update prima_nota_entries p set bank_transaction_id=${q(x.bank)},reconciliation_method='manual' where p.company_id=${q(C)} and p.id=${q(x.pn)} and p.bank_transaction_id is null and exists(select 1 from bank_transactions b where b.company_id=${q(C)} and b.id=${q(x.bank)} and abs(b.amount)=p.amount and b.booking_date=p.entry_date and (b.amount<0)=(p.direction='uscita'));do $$begin if (select bank_transaction_id from prima_nota_entries where company_id=${q(C)} and id=${q(x.pn)}) is distinct from ${q(x.bank)}::uuid then raise exception 'Payment changed concurrently';end if;end $$;`);
  manifest.linkedPayments.push(x);
 }
 const categoryFor=name=>/Gasolio e trasporti/.test(name)?'trasporti_noleggi':/Smaltimenti/.test(name)?'rifiuti':/Sicurezza, DPI|fornitore (acconto|saldo)/.test(name)?'materiali':null;
 for(const x of s.company_costs.filter(x=>!x.category&&x.notes?.startsWith('[DEMO CFO 2026-09 v1]'))){const category=categoryFor(x.name);if(!category)throw Error('Unclassified cost unclear '+x.id);statements.push(`update company_costs set category=${q(category)} where company_id=${q(C)} and id=${q(x.id)} and category is null;`);manifest.classifiedCosts.push({id:x.id,category});}
 const aliases={Attrezzature:'costi_produttivi',Immobili:'costi_produttivi',Veicoli:'costi_produttivi',Software:'costi_amministrativi',Assicurazioni:'costi_produttivi',Utenze:'costi_produttivi',Telefonia:'costi_produttivi',Professionisti:'costi_amministrativi',Servizi:'costi_amministrativi'};
 for(const [category,macro]of Object.entries(aliases)){
  if(s.cg_classificazione_voci.some(x=>x.source_table==='company_costs'&&x.source_value===category&&x.is_active))continue;
  const row={id:uid('classification:'+category),company_id:C,source_table:'company_costs',source_field:'category',source_value:category,voce_chiave:'demo_audit_'+category.toLowerCase(),voce_descrizione:'DEMO - '+category,macro_voce:macro,tipo:category==='Attrezzature'?'V':'F',ordering:600,is_active:true};
  statements.push(insert('cg_classificazione_voci',row));manifest.classificationAliases.push(row);
 }
 // Taxes, salary and contributions are NOT supplier purchases with deductible VAT.
 for(const x of s.company_costs.filter(x=>/^(stipendi|INPS|INAIL|TFR|tfr|f24|imu|interessi)$/.test(x.category||'')&&x.vat_rate>0)){
  if(s.fatture_ricevute.some(f=>f.company_cost_id===x.id)||s.prima_nota_entries.some(p=>p.cost_id===x.id))throw Error('VAT correction requires paid-document review '+x.id);
  const scads=s.scadenze.filter(c=>c.cost_id===x.id);if(scads.some(c=>cents(c.amount)!==cents(x.amount)))throw Error('VAT correction changes cash projection '+x.id);
  statements.push(`update company_costs set vat_rate=0 where company_id=${q(C)} and id=${q(x.id)} and vat_rate=${x.vat_rate};`);manifest.vatCorrections.push({id:x.id,before:x.vat_rate,after:0});
 }
 // One untouched simulated supplier document has a half-cent rounding defect.
 const f=s.fatture_ricevute.find(x=>x.id==='5aae4b29-3294-4e9b-a171-140db3d6979e');
 if(f&&cents(f.imponibile_totale+f.iva_totale)!==cents(f.totale_documento)){
  if(!f.note?.startsWith('[DEMO HISTORY 2026 v1]')||f.xml_raw||f.openai_id||f.data_ricezione_sdi)throw Error('Protected supplier document');
  const vat=(cents(f.totale_documento)-cents(f.imponibile_totale))/100;
  const details=(f.riepilogo_iva||[]).map(r=>({...r,imposta:vat}));
  statements.push(`update fatture_ricevute set iva_totale=${vat},riepilogo_iva=${j(details)} where company_id=${q(C)} and id=${q(f.id)} and iva_totale=${f.iva_totale};`);manifest.receiptCorrections.push({id:f.id,before:f.iva_totale,after:vat});
 }
 return {manifest,statements};
}
if(process.argv[1]?.endsWith('demo-company-accounting-repair.mjs')){
 guard();const mode=process.argv[2]||'plan';
 if(mode==='plan'){const p=build();if(has('repairs-applied'))throw Error('Preserve completed repair manifest');save('repairs-plan',p);console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(p.manifest).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),statements:p.statements.length}));}
 else{
  const p=read('repairs-plan');if(!['dry','apply'].includes(mode))throw Error('Unknown mode');if(mode==='apply'&&(!has('repairs-dry')||read('repairs-dry').hash!==hash(p)))throw Error('Matching rollback rehearsal required');
  if(mode==='apply'&&has('repairs-applied')){console.log('Already applied - no duplicate writes');process.exit(0);}
  sql(`begin;${context}${p.statements.join('\n')}delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;${mode==='dry'?'rollback':'commit'};`);
  save(mode==='dry'?'repairs-dry':'repairs-applied',{hash:hash(p),at:new Date().toISOString(),manifest:p.manifest});console.log(mode+' OK');
 }
}
