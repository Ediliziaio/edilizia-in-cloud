-- Only the isolated reconstruction runner executes this fixture. All rows roll back.
begin;
set local session_replication_role=replica;
insert into public.companies(id,name,email,status,payment_method) values('af000000-0000-4000-a000-000000000001','Laboratorio retribuzioni CI','ci@example.test','active','comped');
insert into auth.users(id) values('af000000-0000-4000-a000-000000000002');
insert into public.profiles(id,company_id,first_name,last_name,email) values('af000000-0000-4000-a000-000000000002','af000000-0000-4000-a000-000000000001','HR','Collaudo','hr-ci@example.test');
insert into public.user_roles(user_id,role) values('af000000-0000-4000-a000-000000000002','company_staff');
insert into public.staff_permissions(user_id,company_id,permessi_dettagliati,can_view_employees,can_view_persone,can_view_costs,can_view_orders,can_view_order_payment_status,can_view_order_amounts,can_manage_purchasing,can_view_margins) values('af000000-0000-4000-a000-000000000002','af000000-0000-4000-a000-000000000001',true,true,true,false,true,true,false,false,false);
insert into public.employees(id,company_id,first_name,last_name,gross_salary,net_salary,costo_orario) values('af000000-0000-4000-a000-000000000003','af000000-0000-4000-a000-000000000001','Persona','Collaudo',2800,2100,35);
insert into public.orders(id,company_id,description,total_amount,order_type,valorizzazione) values('af000000-0000-4000-a000-000000000004','af000000-0000-4000-a000-000000000001','Commessa verifica incassi',10000,'appaltatore_lavoro','a_misura');
insert into public.order_installments(id,order_id,label,amount,is_paid) values('af000000-0000-4000-a000-000000000005','af000000-0000-4000-a000-000000000004','Rata privata',3000,true);
set local session_replication_role=origin;
set local request.jwt.claims='{"role":"authenticated","sub":"af000000-0000-4000-a000-000000000002"}';
set local request.jwt.claim.sub='af000000-0000-4000-a000-000000000002';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $test$
declare payments jsonb;
begin
 payments:=public.commessa_quadro_pagamenti('af000000-0000-4000-a000-000000000004');
 if payments is null or (payments->'rate'->0->>'is_paid') is distinct from 'true' then raise exception 'Payment status unavailable to status-only user';end if;
 if (payments->'rate'->0) ? 'amount' or payments->'sal_cliente'<>'[]'::jsonb or payments->'uscite'<>'[]'::jsonb then raise exception 'Payment status exposes financial amounts';end if;
 if payments->'incassi_unita' is distinct from 'null'::jsonb or payments->'crediti_misura' is distinct from 'null'::jsonb then raise exception 'New financial branches exposed without amount permission';end if;
 if exists(select 1 from public.employees where id='af000000-0000-4000-a000-000000000003') then raise exception 'Raw personnel wages visible without cost permission';end if;
 if not exists(select 1 from public.employees_visibili where id='af000000-0000-4000-a000-000000000003' and first_name='Persona' and gross_salary is null and net_salary is null and costo_orario is null and inps_rate is null and retribuzione_lorda_annua is null and profilo_costo is null) then raise exception 'Operational personnel projection missing or exposes costs';end if;
 if public.costo_orario_dipendente('af000000-0000-4000-a000-000000000003') is not null then raise exception 'Individual rate RPC exposed without cost permission';end if;
 begin
  update public.employees_visibili set gross_salary=99999 where id='af000000-0000-4000-a000-000000000003';
  raise exception 'Unauthorized HR write accepted';
 exception when insufficient_privilege then null;
 end;
end $test$;
reset role;
do $test$begin
 if (select gross_salary from public.employees where id='af000000-0000-4000-a000-000000000003')<>2800 then raise exception 'Unauthorized write changed wage';end if;
end $test$;
update public.staff_permissions set can_view_costs=true where user_id='af000000-0000-4000-a000-000000000002';
set local role authenticated;
do $test$begin
 if not exists(select 1 from public.employees_visibili where id='af000000-0000-4000-a000-000000000003' and gross_salary=2800 and costo_orario=35) then raise exception 'Authorized HR cannot read individual costs';end if;
end $test$;
reset role;
update public.staff_permissions set can_view_employees=false,can_view_persone=false where user_id='af000000-0000-4000-a000-000000000002';
set local role authenticated;
do $test$begin
 if exists(select 1 from public.employees where id='af000000-0000-4000-a000-000000000003') then raise exception 'Cost permission alone exposes individual wages';end if;
end $test$;
reset role;
set local request.jwt.claims='{"role":"service_role"}';
set local request.jwt.claim.sub='';
set local request.jwt.claim.role='service_role';
set local role service_role;
do $test$begin
 if not exists(select 1 from public.employees_visibili where id='af000000-0000-4000-a000-000000000003' and gross_salary=2800) then raise exception 'Trusted backend lost personnel projection access';end if;
 if not exists(select 1 from public.v_ordine_marginalita where id='af000000-0000-4000-a000-000000000004') then raise exception 'Trusted backend lost economic projection access';end if;
end $test$;
reset role;
rollback;
