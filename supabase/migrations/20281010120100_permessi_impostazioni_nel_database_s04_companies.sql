-- Permessi delle Impostazioni nel database — companies: una sola regola per modificare l'azienda, colonne riservate alla piattaforma
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Modifica la propria azienda l'amministratore oppure chi ha «Profilo» in modifica (can_edit_settings_profile): è la regola della
-- pagina Profilo aziendale. Il permesso aggregato can_edit_settings non decide più niente su companies.
-- Le colonne di piattaforma (piano, prova, Stripe, crediti AI, limiti, ciclo di vita, titolare, nome/email/settore, moduli a pagamento)
-- le scrivono solo il super admin (console), le edge function (service role) e le funzioni del database: dal browser il trigger
-- companies_campi_protetti risponde 42501. Le impostazioni di sicurezza (IP consentiti, 2FA, blocco dopo N tentativi, regole delle
-- password) le cambia solo un amministratore dell'azienda, come la pagina CompanySecuritySettings.
-- Il White-Label si può spegnere dal browser; si accende solo se il piano c'è (company_branding.whitelabel_tier).
-- Chi scrive oggi dall'app: CompanyProfileForm, SettingsBranding/useBrandSettings (colori), CompanySecuritySettings (amministratore).

set local lock_timeout = '3s';

drop policy if exists "Company admins can update their own company" on public.companies;
drop policy if exists companies_aggiorna_propria on public.companies;
create policy companies_aggiorna_propria on public.companies
  for update to authenticated
  using (id = (select public.get_user_company_id((select auth.uid())))
         and ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
              or id in (select unnest(public.aziende_con_permesso('can_edit_settings_profile')))))
  with check (id = (select public.get_user_company_id((select auth.uid())))
         and ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
              or id in (select unnest(public.aziende_con_permesso('can_edit_settings_profile')))));

create or replace function public.companies_campi_protetti()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $f$
declare
  nuovo jsonb;
  vecchio jsonb;
  solo_piattaforma constant text[] := array[
    'name', 'email', 'sector',
    'status', 'trial_ends_at', 'trial_extensions_count', 'subscription_plan_id', 'billing_comped',
    'stripe_customer_id', 'stripe_subscription_status', 'payment_failure_count', 'dunning_status',
    'last_payment_failure_at', 'dunning_started_at', 'last_payment_failure_reason',
    'consecutive_payment_failures', 'last_failure_at', 'failure_alert_sent_at',
    'payment_method', 'payment_notes', 'stripe_connect_account_id', 'stripe_connect_enabled',
    'ai_piano', 'ai_crediti', 'ai_crediti_bonus', 'ai_rinnovo_at',
    'computo_ai_monthly_count', 'computo_ai_monthly_limit', 'computo_ai_reset_date',
    'storage_override_mb', 'render_monthly_override',
    'white_label_monthly_price', 'white_label_enabled_at', 'white_label_enabled_by',
    'is_platform_admin_company', 'parent_company_id', 'reseller_wholesale_pct', 'reseller_limit', 'referred_by',
    'deleted_at', 'deleted_by', 'deletion_reason', 'status_before_delete', 'deletion_export_path',
    'titolare_user_id', 'tesoreria_enabled', 'fleet_track_enabled', 'fv_modulo_attivo', 'fv_data_attivazione',
    'messaging_beta_enabled'
  ];
  solo_amministratore constant text[] := array[
    'enforce_2fa', 'enforce_2fa_roles', 'allowed_ips', 'password_expiry_days', 'max_failed_attempts',
    'lockout_duration_minutes', 'security_notifications', 'password_min_length', 'password_require_uppercase',
    'password_require_numbers', 'password_require_special'
  ];
  c text;
begin
  -- Edge function (service role), funzioni SECURITY DEFINER e script passano; il browser no.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    return new;
  end if;
  nuovo := to_jsonb(new);
  vecchio := to_jsonb(old);
  foreach c in array solo_piattaforma loop
    if nuovo -> c is distinct from vecchio -> c then
      raise exception 'Il campo % lo gestisce EdiliziaInCloud: scrivi all''assistenza.', c using errcode = '42501';
    end if;
  end loop;
  -- Il White-Label si accende solo se il piano c'è (lo scrive la console / il server sul tier); spegnerlo si può.
  if new.white_label_enabled is true and old.white_label_enabled is not true
     and not exists (select 1 from public.company_branding b
                      where b.company_id = new.id and b.whitelabel_tier is not null and b.whitelabel_tier <> 'none') then
    raise exception 'Il White-Label lo attiva EdiliziaInCloud: scrivi all''assistenza.' using errcode = '42501';
  end if;
  if not public.e_amministratore_di(new.id) then
    foreach c in array solo_amministratore loop
      if nuovo -> c is distinct from vecchio -> c then
        raise exception 'Il campo % lo cambia solo un amministratore dell''azienda.', c using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end
$f$;

drop trigger if exists trg_companies_campi_protetti on public.companies;
create trigger trg_companies_campi_protetti
  before update on public.companies
  for each row execute function public.companies_campi_protetti();
