-- Pro (oggi 247 €/mese) ed Enterprise includono il White-Label Full.
-- Il prezzo non determina l'accesso: cambiare il listino non cambia i diritti.
-- Il tier manuale resta separato per conservare add-on e contratti Agency
-- quando si passa a un piano che non include il White-Label.
set local lock_timeout = '5s';

alter table public.company_branding
  add column whitelabel_manual_tier text not null default 'none'
  check (whitelabel_manual_tier in ('none', 'basic', 'full', 'agency'));

update public.company_branding b
set whitelabel_manual_tier = case
  when b.whitelabel_tier <> 'none' then b.whitelabel_tier
  when c.white_label_enabled then 'basic'
  else 'none'
end
from public.companies c where c.id = b.company_id;

-- La protezione preesistente resta in vigore anche per il nuovo campo interno.
create or replace function public.company_branding_campi_piano()
returns trigger language plpgsql set search_path = public, pg_temp as $f$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.has_role(auth.uid(), 'super_admin'::public.app_role) then return new; end if;
  if tg_op = 'INSERT' then
    new.whitelabel_tier := 'none';
    new.whitelabel_manual_tier := 'none';
    new.custom_domain := null;
    new.custom_domain_cname := null;
    new.custom_domain_verified := false;
    new.custom_domain_verified_at := null;
    return new;
  end if;
  if new.whitelabel_tier is distinct from old.whitelabel_tier
     or new.whitelabel_manual_tier is distinct from old.whitelabel_manual_tier
     or new.custom_domain is distinct from old.custom_domain
     or new.custom_domain_cname is distinct from old.custom_domain_cname
     or new.custom_domain_verified is distinct from old.custom_domain_verified
     or new.custom_domain_verified_at is distinct from old.custom_domain_verified_at then
    raise exception 'Il piano White-Label e il dominio proprio li attiva EdiliziaInCloud: scrivi all''assistenza.' using errcode = '42501';
  end if;
  return new;
end
$f$;

-- Trigger, non RPC: lavora soltanto sulla riga già autorizzata da RLS e
-- dal trigger trg_company_branding_campi_piano, che viene eseguito prima.
create function public.company_branding_effective_tier()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
declare included boolean;
begin
  if tg_op = 'INSERT' then
    new.whitelabel_manual_tier := new.whitelabel_tier;
  elsif new.whitelabel_tier is distinct from old.whitelabel_tier then
    new.whitelabel_manual_tier := new.whitelabel_tier;
  end if;
  select coalesce(p.slug in ('pro', 'enterprise'), false) into included
  from public.companies c left join public.subscription_plans p on p.id = c.subscription_plan_id
  where c.id = new.company_id;
  new.whitelabel_tier := case
    when new.whitelabel_manual_tier = 'agency' then 'agency'
    when included then 'full'
    else new.whitelabel_manual_tier end;
  if included then new.is_active := true;
  elsif new.whitelabel_tier = 'none' then new.is_active := false;
  end if;
  return new;
end
$f$;
revoke execute on function public.company_branding_effective_tier() from public, anon, authenticated;
create trigger trg_company_branding_effective_tier
before insert or update on public.company_branding
for each row execute function public.company_branding_effective_tier();

-- Qualunque canale assegni il piano (checkout, webhook o console) passa qui.
-- Nessun colore o file del marchio viene modificato.
create function public.company_plan_sync_whitelabel()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  insert into public.company_branding (company_id, whitelabel_tier)
  values (new.id, case when new.white_label_enabled then 'basic' else 'none' end)
  on conflict (company_id) do update
    set whitelabel_tier = company_branding.whitelabel_tier;
  return new;
end
$f$;
revoke execute on function public.company_plan_sync_whitelabel() from public, anon, authenticated;
create trigger trg_company_plan_sync_whitelabel
  after insert or update of subscription_plan_id on public.companies
  for each row execute function public.company_plan_sync_whitelabel();

-- Attiva anche le aziende che hanno già Pro o Enterprise.
insert into public.company_branding (company_id, whitelabel_tier)
select c.id, case when c.white_label_enabled then 'basic' else 'none' end
from public.companies c join public.subscription_plans p on p.id = c.subscription_plan_id
where p.slug in ('pro', 'enterprise')
on conflict (company_id) do update set whitelabel_tier = company_branding.whitelabel_tier;

update public.subscription_plans
set features = features || '["White-Label incluso: logo, colori, nome e dominio personalizzato"]'::jsonb
where slug = 'pro'
  and not features @> '["White-Label incluso: logo, colori, nome e dominio personalizzato"]'::jsonb;
