/** Historical personal calendars must remain selectable in the actual CRM UI. */
import {C,q,guard} from './demo-company-accounting-audit.mjs';
import {save as closureSave,has as closureHas,run} from './demo-company-closure.mjs';
import {read,protectedSQL} from './demo-company-operations.mjs';
const stage='operations-calendar-visibility',p=read('plan'),ids=p.manifest.calendars.map(c=>q(c.id)).join(',');guard();
if(p.company!==C||p.manifest.calendars.length!==9)throw Error('Wrong visibility scope');
const mode=process.argv[2]||'plan';
if(mode==='plan'){
 if(closureHas(stage+'-plan'))throw Error('Preserve original visibility plan');
 const checks=`do $$begin if (select count(*) from marketing_calendars where company_id=${q(C)} and id in(${ids}) and calendar_type='personal' and external_provider is null and external_connection_id is null and not default_meeting_enabled and not reminder_24h and not reminder_1h and description like '[DEMO OPERATIONS 2024-2026 v1]%')<>9 then raise exception 'Unexpected agenda configuration';end if;end $$;`;
 closureSave(stage+'-plan',{company:C,batches:[[checks,`update marketing_calendars set is_active=true where company_id=${q(C)} and id in(${ids}) and not is_active;`,`do $$begin if (${protectedSQL()}) is distinct from ${q(read('before').protected)} then raise exception 'Agenda visibility changed financial graph';end if;end $$;`]],manifest:{calendars:p.manifest.calendars.map(c=>c.id),originalActiveFlags:p.manifest.calendars.map(c=>({id:c.id,is_active:c.is_active})),reason:'CRM queries is_active=true; historical appointments must be selectable too.'}},true);console.log({calendars:9,pastCalendarsToUnhide:6});
}else if(['dry','apply'].includes(mode))run(stage,mode);else throw Error('plan | dry | apply');
