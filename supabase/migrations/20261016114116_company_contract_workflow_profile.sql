-- La fondazione delle impostazioni fasi arriva nel 20281007140000.
DO $contract_profile_dependency$
BEGIN
 IF to_regclass('public.company_fasi_settings') IS NOT NULL THEN
alter table public.company_fasi_settings add column if not exists contract_workflow_profile text not null default 'standard' constraint company_fasi_settings_contract_workflow_check check (contract_workflow_profile in ('standard', 'manutenzione_stradale_su_ordine'));
 END IF;
END $contract_profile_dependency$;
