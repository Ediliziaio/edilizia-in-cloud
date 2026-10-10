/** Read-only audit of the saved tenant integration and private PDF archives. */
import { C, q, read, save, sql, guard, uid, MARK } from './demo-company-55m.mjs';
guard();
const docs=read('commercial-documents-apply'),manifest=read('integration2-manifest');
const ids=kind=>docs.completed.filter(x=>x.kind===kind).map(x=>q(x.id)).join(',');
const missing=(table,column,kind)=>`(select count(*) from ${table} where company_id=${q(C)} and id in(${ids(kind)}) and ${column} is null)`;
const [row]=sql(`select jsonb_build_object(
 'missingQuotePdfs',${missing('quotes','pdf_storage_path','quote')},
 'missingIssuedPdfs',${missing('documenti_fiscali','pdf_url','invoice')},
 'missingDdtPdfs',${missing('ddt_ricezione','ddt_file_url','ddt')},
 'missingReceivedPdfs',${missing('fatture_ricevute','pdf_storage_path','received')},
 'missingPayrollPdfs',${missing('hr_cedolini','pdf_url','payroll')},
 'newJobAttachments',(select count(*) from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and a.id in(${docs.completed.filter(x=>!['payroll'].includes(x.kind)).map(x=>q(uid('integration2-attachment-'+x.kind+'-'+x.id))).join(',')})),
 'pdfsPublicToCustomer',(select count(*) from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and a.file_url like '%/demo-55m/%' and a.visible_to_customer),
 'quotesMissingContact',(select count(*) from quotes where company_id=${q(C)} and id in(${ids('quote')}) and contact_id is null),
 'jobsWithoutQuote',(select count(*) from orders where company_id=${q(C)} and total_amount>0 and quote_id is null),
 'invalidSalTotals',(select count(*) from sal_records r where r.company_id=${q(C)} and r.id in(${manifest.sal.map(x=>q(x.id)).join(',')}) and abs(r.importo_totale-(select sum(v.importo_sal) from sal_voci v where v.sal_id=r.id))>.009),
 'missingHrDays',(select count(*) from (select distinct profilo_id,data_evento from hr_timbrature where company_id=${q(C)}) t where not exists(select 1 from hr_giornate g where g.company_id=${q(C)} and g.profilo_id=t.profilo_id and g.data=t.data_evento)),
 'crossTenantBankMirrors',(select count(*) from prima_nota_entries p join bank_transactions b on b.id=p.bank_transaction_id where p.company_id=${q(C)} and p.notes like ${q(MARK+'%')} and (b.company_id<>p.company_id or b.amount<>case when p.direction='entrata' then p.amount else -p.amount end)),
 'costi',(select sum(importo) from v_cg_costi_classificati where company_id=${q(C)} and anno=2025),
 'ricavi',(select sum(total-tax_amount) from invoices where company_id=${q(C)} and issue_date between '2025-01-01' and '2025-12-31' and deleted_at is null and status not in('draft','cancelled')),
 'pn',(select count(*) from prima_nota_entries where company_id=${q(C)}),
 'margini',(select jsonb_agg(jsonb_build_object('id',id,'consuntivo',consuntivo) order by id) from v_ordine_marginalita where company_id=${q(C)})
) audit`);
const result=row.audit,before=read('integration2-economic-before');
const errors=[];
for(const k of ['missingQuotePdfs','missingIssuedPdfs','missingDdtPdfs','missingReceivedPdfs','missingPayrollPdfs','pdfsPublicToCustomer','quotesMissingContact','jobsWithoutQuote','invalidSalTotals','missingHrDays','crossTenantBankMirrors'])if(Number(result[k])!==0)errors.push(k);
for(const k of ['costi','ricavi','pn'])if(Number(result[k])!==Number(before[k]))errors.push(k+' changed');
const marginMap=new Map(before.margini.map(x=>[x.id,x.consuntivo]));
if(result.margini.some(x=>Number(x.consuntivo)!==Number(marginMap.get(x.id))))errors.push('Job cost changed');
if(docs.completed.length!==1239)errors.push('Incomplete PDF checkpoint');
if(Number(result.newJobAttachments)!==551)errors.push('Incomplete job archive');
const report={company:C,checkedAt:new Date().toISOString(),pdfCount:docs.completed.length,byKind:docs.completed.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),...result,errors,limitations:[
 'The shared legacy cash-flow RPC is unchanged. The locally corrected prospective model uses documented residual commitments; historical cash uses actual ledger entries, not today’s bank balance.',
 'Six immutable issued native invoices retain a one-cent VAT rounding discrepancy. The PDF discloses it; no fiscal guard was bypassed.',
 'Local supplier read model now joins actual OdA, received invoices, allocations and cash; credit notes and shared-cost payments remain explicitly for review, not invented.',
 'Annual purchase costs remain in existing packages, with 24 physical SKUs and matching deliveries, returns and report usage added separately. No duplicate financial material expense was posted.',
 'Report photos are labelled shared synthetic illustrations, not actual site evidence. Previous PDF revisions are retained separately.',
 '2025 is the 5.5m exercise; 2026 is not rebuilt to the same annual target.',
 'Reports/SAL/acceptance are simulated or unsigned; no real fiscal sending, payment, certificate or signature.',
 'No full-page exhaustive QA claim; representative UI chains and tenant-wide data invariants tested.',
]};
save('integration2-final-verified',report);
console.log(JSON.stringify({...report,margini:{count:result.margini.length,unchanged:!errors.includes('Job cost changed')}},null,2));
if(errors.length)process.exitCode=1;
