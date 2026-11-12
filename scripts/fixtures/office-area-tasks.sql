-- Transactional fixture for the network-isolated complete history runner.
begin;
set local session_replication_role=replica;
insert into companies(id,name,email,status,payment_method) values('ae000000-0000-4000-a000-000000000001','Laboratorio aree CI','aree@example.test','active','comped');
insert into auth.users(id) select ('ae000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid from generate_series(2,4)n;
insert into profiles(id,company_id,first_name,last_name,email) select id,'ae000000-0000-4000-a000-000000000001','Utente','Area',id||'@example.test' from auth.users where id::text like 'ae000000-%';
insert into user_roles(user_id,role) select id,'company_staff' from profiles where company_id='ae000000-0000-4000-a000-000000000001';
insert into staff_permissions(user_id,company_id,permessi_dettagliati,can_view_orders,can_view_team_tasks,can_edit_orders,can_view_costs) select id,company_id,true,true,false,false,false from profiles where company_id='ae000000-0000-4000-a000-000000000001';
insert into company_uffici(id,company_id,nome) values('ae000000-0000-4000-a000-000000000005','ae000000-0000-4000-a000-000000000001','Area tecnica CI');
insert into ufficio_membri(ufficio_id,profile_id,company_id) select 'ae000000-0000-4000-a000-000000000005',id,company_id from profiles where id in ('ae000000-0000-4000-a000-000000000002','ae000000-0000-4000-a000-000000000003');
insert into tasks(id,company_id,created_by,title,ufficio_id,status) values('ae000000-0000-4000-a000-000000000006','ae000000-0000-4000-a000-000000000001','ae000000-0000-4000-a000-000000000004','Titolo riservato','ae000000-0000-4000-a000-000000000005','da_fare');
set local session_replication_role=origin;
set local request.jwt.claims='{"role":"authenticated","sub":"ae000000-0000-4000-a000-000000000002"}';
set local request.jwt.claim.sub='ae000000-0000-4000-a000-000000000002';
set local role authenticated;
do $$begin
 if not exists(select 1 from tasks_personali_e_aree where id='ae000000-0000-4000-a000-000000000006' and area_mia) then raise exception 'Office queue not visible to member';end if;
 perform attivita_prendi_in_carico('ae000000-0000-4000-a000-000000000006');
 begin
 update tasks set title='Riscritto' where id='ae000000-0000-4000-a000-000000000006';
 raise exception 'Non-creator office member rewrote task';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claims='{"role":"authenticated","sub":"ae000000-0000-4000-a000-000000000003"}';
set local request.jwt.claim.sub='ae000000-0000-4000-a000-000000000003';
set local role authenticated;
do $$begin
 begin
 perform attivita_prendi_in_carico('ae000000-0000-4000-a000-000000000006');
 raise exception 'Second actor stole claimed task';
 exception when serialization_failure then null;end;
 if not exists(select 1 from tasks_personali_e_aree where id='ae000000-0000-4000-a000-000000000006') then raise exception 'Claim hid task from colleagues';end if;
end $$;
reset role;
delete from ufficio_membri where profile_id='ae000000-0000-4000-a000-000000000002';
set local request.jwt.claims='{"role":"authenticated","sub":"ae000000-0000-4000-a000-000000000002"}';
set local request.jwt.claim.sub='ae000000-0000-4000-a000-000000000002';
set local role authenticated;
do $$begin
 if exists(select 1 from tasks where id='ae000000-0000-4000-a000-000000000006') then raise exception 'Revoked member still sees task';end if;
end $$;
reset role;
do $$begin
 if exists(select 1 from notifications where entity_id='ae000000-0000-4000-a000-000000000006' and (title like '%Titolo riservato%' or body like '%Titolo riservato%')) then raise exception 'Office broadcast leaked title';end if;
end $$;
rollback;
