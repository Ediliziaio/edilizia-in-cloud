/** Complete synthetic attendance/payroll, tenant only. Never fiscal payroll. */
import {C,A,MARK,uid,q,j,read,save,insert,sql,guard} from './demo-company-55m.mjs';
import {existsSync} from 'node:fs';
const stage=process.argv[2]||'attendance';
if(existsSync(`tmp/demo-integrated/annual-55m/${stage}-applied.json`))throw Error('Applied plan is immutable');
guard();const r=read('resources-manifest'),b=read('business-manifest'),before=read('before'),round=n=>Math.round(n*100)/100;
const profiles=sql(`select * from hr_profili where company_id=${q(C)}`),punches=sql(`select profilo_id,data_evento,order_id from hr_timbrature where company_id=${q(C)} and data_evento between '2025-01-01' and '2026-09-30'`);
save('hr-profiles-current',profiles);
const day=(y,m,n)=>`${y}-${String(m).padStart(2,'0')}-${String(n).padStart(2,'0')}`,end=(y,m)=>new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10);
const dates=(y,m)=>Array.from({length:Number(end(y,m).slice(-2))},(_,i)=>day(y,m,i+1));
const holidays=new Set(['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26','2025-04-21','2026-04-06']);
const weekday=d=>![0,6].includes(new Date(d+'T12:00:00Z').getUTCDay());
const holiday=d=>holidays.has(d.slice(5))||holidays.has(d);
const vacation=d=>d.slice(5)>='08-11'&&d.slice(5)<='08-22'||d.slice(5)>='12-24';
const timestamp=(d,t)=>{const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Rome',timeZoneName:'shortOffset'}).formatToParts(new Date(d+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;return d+'T'+t+(offset==='GMT+2'?'+02:00':'+01:00');};
const hByEmployee=new Map();
for(const e of r.staff){const choices=profiles.filter(h=>h.employee_id===e.id&&h.attivo);const h=choices.find(h=>h.nome===e.first_name&&h.cognome===e.last_name)||choices[0];if(!h)throw Error('Missing active HR profile '+e.id);hByEmployee.set(e.id,h);}
const occupied=new Set([...punches.map(t=>t.profilo_id+'|'+t.data_evento),...read('existing-hr-days').map(d=>d.profilo_id+'|'+d.data)]),jobs=new Map();
for(const o of b.orders)for(const report of o.reports)for(const p of report.presences){const key=p.employee_id+'|'+report.date;if(jobs.has(key))throw Error('Duplicated worker-day');jobs.set(key,{order:o.id,report:report.id,hours:p.ore});}
const batches=[],manifest={company:C,marker:MARK,days:[],payroll:[]};
if(stage==='attendance'){
  let pending=[],ids=[];const flush=()=>{if(!pending.length)return;batches.push([...pending,`do $$begin if exists(select 1 from hr_giornate where company_id=${q(C)} and profilo_id in(${[...new Set(ids)].map(q).join(',')}) and note like ${q(MARK+'%')} and ore_lavorate>8.01) then raise exception 'Overlapping synthetic attendance';end if;end $$;`]);pending=[];ids=[];};
  for(let y=2025;y<=2026;y++)for(let m=1;m<=(y===2025?12:9);m++){
    for(const e of r.staff){const h=hByEmployee.get(e.id);for(const date of dates(y,m)){
      if(date<e.data_assunzione)continue;const key=h.id+'|'+date,job=jobs.get(e.id+'|'+date);
      if(occupied.has(key)){manifest.days.push({employee:e.id,profile:h.id,date,preserved:true});continue;}
      let status=!weekday(date)?'non_lavorativo':holiday(date)?'festivita':vacation(date)?'ferie':'presente';
      // No fictitious illness on a day already declared productive by a report.
      if(status==='presente'&&!job&&date.slice(8)==='17'&&m===2&&r.staff.indexOf(e)%7===0)status='malattia';
      manifest.days.push({employee:e.id,profile:h.id,date,status,order:job?.order||null,hours:status==='presente'?8:0});
      if(status==='presente'){
        for(const [type,time]of [['entrata','08:00:00'],['pausa_inizio','12:00:00'],['pausa_fine','13:00:00'],['uscita','17:00:00']])pending.push(insert('hr_timbrature',{id:uid('hr-'+e.id+'-'+date+'-'+type),company_id:C,profilo_id:h.id,tipo:type,timestamp:timestamp(date,time),order_id:job?.order||null,sede_id:job?null:r.siteId,fonte:'manuale',validata:true,validata_da:A,note:MARK+' Timbratura sintetica: '+(job?'rapportino '+job.report:e.area==='cantiere'?'logistica, preparazione e manutenzione in sede (non costo produttivo di commessa)':'attività ufficio/commerciale')+'. Nessun GPS reale.'}));
        pending.push(`update hr_giornate set stato='presente',source='manual',note=${q(MARK+' Giornata sintetica coerente con le quattro timbrature.')},anomalia=false,anomalia_motivo=null where company_id=${q(C)} and profilo_id=${q(h.id)} and data=${q(date)};`);
      }else pending.push(insert('hr_giornate',{id:uid('day-'+e.id+'-'+date),company_id:C,profilo_id:h.id,data:date,stato:status,ore_previste:weekday(date)&&!holiday(date)?8:0,ore_lavorate:0,ore_straordinario:0,ore_pausa:0,ore_mancanti:0,anomalia:false,source:'manual',note:MARK+' Calendario e assenza sintetici, nessuna timbratura inventata durante ferie/festivi.'}));
      ids.push(h.id);if(pending.length>=250)flush();
    }}flush();
  }
  save('attendance-manifest',manifest);
  // Representative rollback checks, followed by invariant-guarded real batches.
  save('attendance-sample-plan',{company:C,marker:MARK,batches:batches.filter((_,i)=>i===0||i===batches.length-1||i%20===0)});
}
if(stage==='payroll'){
  const days=sql(`select * from hr_giornate where company_id=${q(C)} and data between '2025-01-01' and '2026-09-30'`);
  for(let y=2025;y<=2026;y++)for(let m=1;m<=(y===2025?12:9);m++){
    const statements=[],month=day(y,m,1).slice(0,7),monthly=[];
    for(const e of r.staff){if(e.data_assunzione>end(y,m))continue;const h=hByEmployee.get(e.id),ds=days.filter(d=>d.profilo_id===h.id&&d.data.startsWith(month)),worked=round(ds.reduce((s,d)=>s+Number(d.ore_lavorate),0)),absence=ds.filter(d=>['ferie','malattia','permesso'].includes(d.stato)).reduce((s,d)=>s+Number(d.ore_previste),0);
      if(ds.length!==dates(y,m).filter(d=>d>=e.data_assunzione).length)throw Error('Incomplete month before payroll '+e.id+' '+month);
      const overtime=round(ds.reduce((s,d)=>s+Number(d.ore_straordinario),0)),gross=round(Number(e.gross_salary)*(m===12?2:1)+overtime*Number(e.gross_salary)/173*1.25),employeeContribution=round(gross*.0919),tax=round((gross-employeeContribution)*.18),net=round(gross-employeeContribution-tax),employer=round(gross*.28),payDate=end(y,m),id=uid('payslip-'+e.id+'-'+month),warnings=['DEMO NON FISCALE: trattenute, contributi e maggiorazione straordinari 25% sono ipotesi sintetiche, non calcolo paghe certificato.'];
      statements.push(insert('hr_cedolini',{id,company_id:C,employee_id:e.id,anno:y,mese:m,lordo:gross,contributi_dipendente:employeeContribution,ritenute_irpef:tax,netto:net,contributi_datore:employer,ore_lavorate:worked,ore_ordinarie:round(worked-overtime),ore_straordinario:overtime,ore_straordinario_25:overtime,ore_assenza_giustificate:absence,ore_assenza_non_giustificate:0,stato:'pagato',data_emissione:payDate,data_pagamento:payDate,generation_method:'manual',validation_warnings:warnings,note:MARK+' Simulazione stipendio; '+(m===12?'include tredicesima nello stesso mese. ':'')+'Ore da presenze HR salvate. Salario aziendale e imputazione ore commessa sono viste dello stesso costo, non due spese.'}));
      // Keep the audit connection to the source reports without guessing ARRAY serialization.
      statements.push(`update hr_cedolini set source_rapportini_ids=coalesce((select array_agg(distinct cr.id) from campo_rapportini cr where cr.company_id=${q(C)} and cr.data_lavoro between ${q(day(y,m,1))} and ${q(end(y,m))} and cr.approvato and exists(select 1 from jsonb_array_elements(coalesce(cr.presenze,'[]'::jsonb)) p where p->>'employee_id'=${q(e.id)})),'{}'::uuid[]) where id=${q(id)} and company_id=${q(C)};`);
      monthly.push({id,employee:e.id,month,gross,net,tax,employeeContribution,employer,worked,absence,area:e.area});manifest.payroll.push(monthly.at(-1));
    }
    // Replace unlinked aggregate prototypes in this tenant; immutable before
    // snapshot preserves them, and no existing payment/document is rewritten.
    for(const [category,key]of [['stipendi','gross'],['INPS','employer']]){
      const amount=round(monthly.reduce((s,p)=>s+p[key],0)),old=before.company_costs.find(c=>c.category===category&&c.due_date?.startsWith(month)&&!before.prima_nota_entries.some(p=>p.cost_id===c.id)&&!before.scadenze.some(s=>s.cost_id===c.id)),id=old?.id||uid('salary-cost-'+category+'-'+month);
      if(old)statements.push(`update company_costs set name=${q('DEMO · '+category+' '+month)},amount=${amount},due_date=${q(end(y,m))},paid_date=${q(end(y,m))},is_paid=true,recurrence='once',recurrence_auto=false,notes=${q(MARK+' Riconciliazione dai cedolini sintetici; sostituisce il precedente riepilogo dimostrativo, non costo aggiuntivo.')} where id=${q(id)} and company_id=${q(C)} and amount=${Number(old.amount)} and notes is not distinct from ${q(old.notes)};`);
      else statements.push(insert('company_costs',{id,company_id:C,name:'DEMO · '+category+' '+month,cost_type:'fixed',amount,vat_rate:0,recurrence:'once',recurrence_auto:false,due_date:end(y,m),paid_date:end(y,m),is_paid:true,category,notes:MARK+' Riepilogo dei medesimi cedolini sintetici, non costo ulteriore.'}));
      statements.push(insert('scadenze',{id:uid('salary-scad-'+category+'-'+month),company_id:C,tipo:'costo_aziendale',description:'DEMO · '+category+' '+month,amount,due_date:end(y,m),status:'pagata',paid_amount:amount,paid_date:end(y,m),cost_id:id,is_auto_generated:false,notes:MARK}));
    }
    // Realistically distinct net wage, withholding remittance and employer
    // contributions sum to gross + employer cost, not gross plus net again.
    const paidNetBefore=before.prima_nota_entries.filter(p=>p.direction==='uscita'&&p.entry_date?.startsWith(month)&&/stipendi|paghe|stipendio/i.test(p.description+' '+p.category)).reduce((s,p)=>s+Number(p.amount),0);
    for(const [label,amount,category]of [['Stipendi netti',round(monthly.reduce((s,p)=>s+p.net,0)-paidNetBefore),'stipendi'],['Trattenute simulate',round(monthly.reduce((s,p)=>s+p.tax+p.employeeContribution,0)),'altro'],['Contributi datore simulati',round(monthly.reduce((s,p)=>s+p.employer,0)),'altro']]){if(amount<0)throw Error('Existing wage cash exceeds simulated wages');statements.push(insert('prima_nota_entries',{id:uid('salary-cash-'+label+'-'+month),company_id:C,direction:'uscita',category,description:'DEMO · '+label+' '+month,amount,entry_date:end(y,m),payment_method:'bonifico',created_by:A,is_auto:false,notes:MARK+' Evento di cassa sintetico, non bonifico o F24 reale. Eventuali stipendi già presenti detratti dall’integrazione.'}));}
    statements.push(`do $$begin if (select count(*) from hr_cedolini where company_id=${q(C)} and anno=${y} and mese=${m} and note like ${q(MARK+'%')})<>${monthly.length} then raise exception 'Payroll incomplete';end if;end $$;`);batches.push(statements);
  }save('payroll-manifest',manifest);
}
save(`${stage}-plan`,{company:C,marker:MARK,batches});console.log({stage,batches:batches.length,statements:batches.reduce((s,b)=>s+b.length,0),days:manifest.days.length,payslips:manifest.payroll.length});
