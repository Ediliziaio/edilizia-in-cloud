-- Synthetic fixture only: run after permessi-ufficio-simulazione.sql.
-- The local GoTrue accounts are u1@example.test ... u7@example.test.
begin;
do $$begin if exists(select 1 from public.companies where name not like 'Laboratorio %') then raise exception 'Solo aziende sintetiche';end if;end$$;
-- GoTrue's legacy bootstrap uses per-claim GUCs; PostgREST 16 supplies JSON claims.
create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'sub')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') $$;
update public.companies set onboarding_vertical_completed=true where name like 'Laboratorio %';
update public.staff_permissions set must_change_password=false where company_id='a0000000-0000-4000-a000-000000000001';
update public.staff_permissions set can_view_order_payment_status=true where user_id='10000000-0000-4000-a000-000000000001';
insert into public.hr_profili(company_id,user_id,nome,cognome,attivo)
 select p.company_id,p.id,p.first_name,p.last_name,true from public.profiles p
 where p.company_id='a0000000-0000-4000-a000-000000000001'
 and not exists(select 1 from public.hr_profili h where h.user_id=p.id and h.company_id=p.company_id);
update public.staff_permissions set office_profile=case right(user_id::text,1) when '1' then 'tecnico' when '2' then 'ordini' when '3' then 'commerciale' when '4' then 'amministrazione' when '5' then 'responsabile' when '7' then 'hr' end where company_id='a0000000-0000-4000-a000-000000000001';
-- Keep the CRM switch on for four users: this must NOT hide office orders.
update public.staff_permissions set only_assigned=true where user_id in ('10000000-0000-4000-a000-000000000001','10000000-0000-4000-a000-000000000002','10000000-0000-4000-a000-000000000003','10000000-0000-4000-a000-000000000004');
update public.staff_permissions set can_view_marketing_contacts=true,can_view_marketing_opportunities=true where user_id='10000000-0000-4000-a000-000000000003';
update public.staff_permissions set can_view_order_amounts=false,can_view_order_payment_status=true where user_id='10000000-0000-4000-a000-000000000002';
update public.staff_permissions set can_view_calendar=true,can_view_giornale_lavori=true where user_id='10000000-0000-4000-a000-000000000001';
commit;
