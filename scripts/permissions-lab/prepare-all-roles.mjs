import {sql,assertLocalFixture,userId,companyId,orderId} from './backend.mjs';
assertLocalFixture();
const specs=[
 [10,3,'salesperson','Venditore',{can_view_orders:false,can_edit_orders:false,can_edit_marketing_contacts:true,can_edit_marketing_opportunities:true}],
 [11,3,'call_center','Call Center',{can_view_orders:false,can_edit_orders:false,can_edit_marketing_contacts:true,can_edit_marketing_opportunities:true}],
 [12,6,'subcontractor','Subappaltatore',{}],
 [13,1,'company_staff','Magazzino',{only_my_warehouse:true,can_edit_orders:false}],
 [14,1,'company_staff','Sola lettura',{sola_lettura:true,can_edit_orders:false}],
];
for(const [n,source,role,name,flags]of specs){
 const id=userId(n),from=userId(source);
 const overrides=JSON.stringify({...flags,id:undefined,user_id:id,company_id:companyId});
 sql(`begin;set local session_replication_role=replica;
 do $$declare cols text; v jsonb;begin
 if not exists(select 1 from auth.users where id='${id}') then
 select string_agg(quote_ident(attname),',' order by attnum)into cols from pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped and attgenerated='';
 select to_jsonb(u)||jsonb_build_object('id','${id}','email','u${n}@example.test') into v from auth.users u where id='${userId(1)}';
 execute 'insert into auth.users('||cols||') select '||cols||' from jsonb_populate_record(null::auth.users,$1)' using v;end if;
 if not exists(select 1 from staff_permissions where user_id='${id}') then
 select string_agg(quote_ident(attname),',' order by attnum)into cols from pg_attribute where attrelid='staff_permissions'::regclass and attnum>0 and not attisdropped and attgenerated='';
 select to_jsonb(p)||'${overrides}'::jsonb||jsonb_build_object('id',gen_random_uuid()) into v from staff_permissions p where user_id='${from}';
 execute 'insert into staff_permissions('||cols||') select '||cols||' from jsonb_populate_record(null::staff_permissions,$1)' using v;end if;end$$;
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)select gen_random_uuid(),'${id}','${id}',jsonb_build_object('sub','${id}','email','u${n}@example.test'),'email',now(),now() where not exists(select 1 from auth.identities where user_id='${id}');
 insert into profiles(id,company_id,first_name,last_name,email)values('${id}','${companyId}','${name}','Simulato','u${n}@example.test')on conflict(id)do nothing;
 insert into user_roles(user_id,role)values('${id}','${role}')on conflict do nothing;
 commit;`);
}
sql(`begin;set local session_replication_role=replica;
insert into order_campo_assignments(company_id,order_id,user_id,role_type)select '${companyId}','${orderId}','${userId(12)}','subcontractor' where not exists(select 1 from order_campo_assignments where order_id='${orderId}' and user_id='${userId(12)}');
insert into orders(id,company_id,description,assigned_to,total_amount) values('d0000000-0000-4000-a000-000000000004','${companyId}','Commessa del magazzino limitato','${userId(13)}',12000) on conflict(id)do nothing;
commit;`);
console.log('Ruoli aggiuntivi sintetici pronti, nessuna modifica agli utenti originali');
