-- Permessi delle Impostazioni nel database — company_branding: il piano White-Label e il dominio proprio li attiva EdiliziaInCloud
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Dal browser (anche l'amministratore) si scrivono colori, nome, sottodominio e file del marchio (SettingsBranding, useBrandingByDomain).
-- Piano White-Label e dominio proprio (whitelabel_tier, custom_domain, cname, verificato, data) li scrivono solo il super admin
-- (console, TabWhiteLabel) e le edge function provision/verify/remove-custom-domain (service role): dal browser il trigger risponde 42501.
-- Una riga nuova dal browser nasce sempre a 'none'. Il dominio proprio è unico (senza distinguere maiuscole).

set local lock_timeout = '3s';

create or replace function public.company_branding_campi_piano()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $f$
begin
  -- Edge function (service role), funzioni SECURITY DEFINER e script passano; il browser no.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.whitelabel_tier := 'none';
    new.custom_domain := null;
    new.custom_domain_cname := null;
    new.custom_domain_verified := false;
    new.custom_domain_verified_at := null;
    return new;
  end if;
  if new.whitelabel_tier is distinct from old.whitelabel_tier
     or new.custom_domain is distinct from old.custom_domain
     or new.custom_domain_cname is distinct from old.custom_domain_cname
     or new.custom_domain_verified is distinct from old.custom_domain_verified
     or new.custom_domain_verified_at is distinct from old.custom_domain_verified_at then
    raise exception 'Il piano White-Label e il dominio proprio li attiva EdiliziaInCloud: scrivi all''assistenza.'
      using errcode = '42501';
  end if;
  return new;
end
$f$;

drop trigger if exists trg_company_branding_campi_piano on public.company_branding;
create trigger trg_company_branding_campi_piano
  before insert or update on public.company_branding
  for each row execute function public.company_branding_campi_piano();

create unique index if not exists company_branding_custom_domain_unico
  on public.company_branding (lower(custom_domain)) where custom_domain is not null;
