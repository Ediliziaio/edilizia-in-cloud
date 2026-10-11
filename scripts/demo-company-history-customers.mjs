/** Operational customers for the NEW demo graphs only; no portal or outbound mail. */
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {C,A,YEAR,MARK,AS_OF,q,j,sql,guard,read,save,has,uid,insert,plan} from './demo-company-history.mjs';

if(![2023,2024,2026].includes(YEAR))throw Error('2025 replacement is not authorized');
guard();
const m=read('business-manifest'),ids=m.orders.map(o=>q(o.id)).join(',');
function capture(){
  const [row]=sql(`select jsonb_build_object(
    'orders',(select jsonb_agg(to_jsonb(o)) from orders o where company_id=${q(C)} and id in(${ids})),
    'contacts',(select jsonb_agg(to_jsonb(c)) from marketing_contacts c where company_id=${q(C)} and id in(${m.orders.map(o=>q(o.contact))})),
    'native',(select jsonb_agg(to_jsonb(n)) from anagrafiche_native n where company_id=${q(C)} and id in(${m.orders.map(o=>q(o.native))})),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from profiles p where company_id=${q(C)}),
    'roles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from user_roles r join profiles p on p.id=r.user_id where p.company_id=${q(C)}),
    'authTriggers',(select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal)
  ) data`);
  const s=row.data;
  if(s.authTriggers!==0)throw Error('Review new Auth triggers before creating shadow customers');
  if(s.orders.length!==m.orders.length||s.contacts.length!==m.orders.length||s.native.length!==m.orders.length)throw Error('Incomplete demo source graph');
  for(const o of m.orders){
    const order=s.orders.find(x=>x.id===o.id),contact=s.contacts.find(x=>x.id===o.contact),native=s.native.find(x=>x.id===o.native);
    if(!order.internal_notes?.startsWith(MARK)||!contact.notes?.startsWith(MARK)||!native.note?.startsWith(MARK)||!contact.email?.endsWith('@demo.invalid')||!contact.opt_out)throw Error('Non-demo source or deliverable email');
  }
  if(!has('customers-before'))save('customers-before',s,true);
  return s;
}
async function shadow(){
  if(has('customers-applied'))throw Error('Customer links are already applied');
  const s=capture(),log=has('customer-auth')?read('customer-auth'):{company:C,year:YEAR,marker:MARK,users:[]};
  if(log.company!==C||log.year!==YEAR||log.marker!==MARK)throw Error('Wrong checkpoint');
  const existing=sql(`select id,email,raw_user_meta_data,banned_until from auth.users where email in(${s.contacts.map(c=>q(c.email))})`);
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Service credential unavailable');
  const client=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const o of m.orders){
    if(log.users.some(u=>u.contact===o.contact))continue;
    const c=s.contacts.find(x=>x.id===o.contact);let user=existing.find(u=>u.email===c.email);
    if(user&&(user.raw_user_meta_data?.demo_company_id!==C||user.raw_user_meta_data?.demo_marker!==MARK||user.raw_user_meta_data?.demo_contact_id!==o.contact))throw Error('Existing email does not belong to this exact demo graph');
    if(!user){
      // createUser, NOT inviteUserByEmail: like the app's no-portal customer path.
      // The unrecorded random password, Auth ban and blocked profile prevent access.
      const {data,error}=await client.auth.admin.createUser({email:c.email,password:randomBytes(32).toString('hex'),email_confirm:true,ban_duration:'876000h',user_metadata:{first_name:c.first_name,last_name:c.last_name||'',demo_company_id:C,demo_marker:MARK,demo_contact_id:o.contact,portal_disabled:true}});
      if(error||!data.user)throw Error('Shadow customer creation failed: '+(error?.code||'no user'));
      user=data.user;
    }
    const owner=sql(`select id,company_id from profiles where id=${q(user.id)}`);
    if(owner.some(p=>p.company_id!==C))throw Error('Cross-tenant profile collision');
    log.users.push({id:user.id,contact:o.contact,order:o.id,native:o.native,email:c.email});save('customer-auth',log);
    if(log.users.length%8===0||log.users.length===m.orders.length)console.log(`BLOCKED SHADOW ${YEAR} ${log.users.length}/${m.orders.length}`);
  }
}
function links(){
  const s=capture(),log=read('customer-auth');
  if(log.users.length!==m.orders.length||log.company!==C||log.year!==YEAR)throw Error('Auth checkpoint incomplete');
  const batches=[];
  for(const o of m.orders){
    const u=log.users.find(x=>x.contact===o.contact),c=s.contacts.find(x=>x.id===o.contact),d=s.orders.find(x=>x.id===o.id),n=s.native.find(x=>x.id===o.native);
    if(!u||u.order!==o.id||u.native!==o.native||u.email!==c.email||d.customer_id||c.customer_profile_id||n.cliente_id)throw Error('Unexpected existing customer relationship');
    const street=o.address.split(',')[0].trim(),parts=street.match(/^(.*?)\s+(\d+[A-Za-z]?)$/);
    const statements=[`do $$begin if not exists(select 1 from auth.users where id=${q(u.id)} and email=${q(u.email)} and raw_user_meta_data->>'demo_company_id'=${q(C)} and raw_user_meta_data->>'demo_marker'=${q(MARK)} and banned_until>now()) then raise exception 'Wrong or unblocked shadow';end if;end $$;`,
      insert('profiles',{id:u.id,company_id:C,first_name:c.first_name,last_name:c.last_name||'',email:c.email,address:o.address,site_address:o.address,city:c.city,site_city:c.city,province:c.province,site_province:c.province,country:'IT',marketing_contact_id:o.contact,notes:MARK+' Cliente interamente fittizio; accesso portale disabilitato; nessuna comunicazione reale.',portal_disabled:true,is_blocked:true,blocked_by:A,blocked_at:new Date().toISOString(),is_business:false,customer_type:'privato',preferred_briefing_channel:'none',winback_opt_out:true,created_at:c.created_at}),
      insert('user_roles',{id:uid(`customer-role-${o.index}`),user_id:u.id,role:'customer'}),
      `update marketing_contacts set customer_profile_id=${q(u.id)},notes=${q(MARK+' Cliente fittizio collegato alla commessa; profilo tecnico senza portale né invii reali.')} where company_id=${q(C)} and id=${q(o.contact)} and customer_profile_id is null;`,
      `update anagrafiche_native set cliente_id=${q(u.id)},indirizzo_via=${q(parts?.[1]||street)},indirizzo_numero_civico=${q(parts?.[2]||null)},indirizzo_comune=${q(c.city)},indirizzo_provincia=${q(c.province)} where company_id=${q(C)} and id=${q(o.native)} and cliente_id is null;`,
      `update orders set customer_id=${q(u.id)} where company_id=${q(C)} and id=${q(o.id)} and customer_id is null;`,
      `do $$begin if not exists(select 1 from orders o join profiles p on p.id=o.customer_id and p.company_id=o.company_id join marketing_contacts c on c.id=p.marketing_contact_id and c.company_id=p.company_id join anagrafiche_native n on n.cliente_id=p.id and n.company_id=p.company_id where o.company_id=${q(C)} and o.id=${q(o.id)} and p.id=${q(u.id)} and c.id=${q(o.contact)} and c.customer_profile_id=p.id and n.id=${q(o.native)} and p.portal_disabled and p.is_blocked and exists(select 1 from user_roles where user_id=p.id and role='customer')) then raise exception 'Incomplete customer linkage';end if;end $$;`];
    batches.push(statements);
  }
  plan('customers',batches,{company:C,year:YEAR,customers:log.users.length,portalEnabled:false,externalMessages:0});
}
function verify(){
  const [r]=sql(`with demo as(select o.id,o.customer_id,p.id profile_id,p.company_id,p.portal_disabled,p.is_blocked,p.marketing_contact_id,p.preferred_briefing_channel,p.winback_opt_out,c.customer_profile_id,n.cliente_id from orders o left join profiles p on p.id=o.customer_id left join marketing_contacts c on c.id=p.marketing_contact_id and c.company_id=p.company_id left join anagrafiche_native n on n.id in(${m.orders.map(o=>q(o.native))}) and n.cliente_id=p.id and n.company_id=p.company_id where o.company_id=${q(C)} and o.id in(${ids})) select count(*) customers,count(*) filter(where profile_id is null or company_id<>${q(C)} or not portal_disabled or not is_blocked or not winback_opt_out or preferred_briefing_channel<>'none' or customer_profile_id is distinct from profile_id or cliente_id is distinct from profile_id or not exists(select 1 from user_roles r where r.user_id=profile_id and r.role='customer') or not exists(select 1 from auth.users a where a.id=profile_id and a.banned_until>now() and a.raw_user_meta_data->>'demo_marker'=${q(MARK)})) failures from demo`);
  // The same read-only RPC used by the real customer list, under the demo admin.
  const [actual]=sql(`with claims as materialized(select set_config('request.jwt.claim.sub',${q(A)},true),set_config('request.jwt.claims',${j({sub:A,role:'authenticated'})}::text,true)) select get_customers_paginated(p_company_id=>${q(C)},p_search=>${q('DEMO '+YEAR)},p_has_orders=>'with',p_portal_state=>'disabled',p_limit=>100) data from claims`);
  const expected=new Set(read('customer-auth').users.map(u=>u.id)),returned=actual.data.rows.filter(x=>expected.has(x.id));
  const fails=[];if(r.customers!==m.orders.length||r.failures)fails.push('customer graph');
  if(returned.length!==m.orders.length||returned.some(x=>x.order_count!==1||!x.portal_disabled))fails.push('actual customer list RPC');
  save('customers-verified',{company:C,year:YEAR,asOf:AS_OF,...r,rpcCustomers:returned.length,fail:fails});console.log(JSON.stringify({year:YEAR,...r,rpcCustomers:returned.length,fail:fails}));if(fails.length)throw Error('Customer verification failed');
}
const mode=process.argv[3];if(mode==='auth')await shadow();else if(mode==='plan')links();else if(mode==='verify')verify();else throw Error('auth | plan | verify; links dry/apply via history runner');
