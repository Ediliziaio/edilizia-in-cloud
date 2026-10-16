-- Profilo esplicito per azienda; nessuna azienda viene abilitata dalla migrazione.
-- Lettura protetta dalle policy esistenti di company_fasi_settings.
-- Configurazione riservata all’amministrazione: nessun nuovo grant/RPC di scrittura.
alter table public.company_fasi_settings
  add column if not exists contract_workflow_profile text not null default 'standard'
  constraint company_fasi_settings_contract_workflow_check
  check (contract_workflow_profile in ('standard', 'manutenzione_stradale_su_ordine'));
