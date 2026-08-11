-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Granularità "Listino & Prezzi": toggle dedicati per Scontistica,
-- Finanziamenti e Bundle. Default false = nessun cambiamento per gli utenti
-- esistenti: chi ha can_view/edit_settings_pricing continua a vedere tutto
-- (il fallback vive in usePermissions: pricing pieno = master).
alter table public.staff_permissions
  add column if not exists can_view_settings_scontistica boolean not null default false,
  add column if not exists can_edit_settings_scontistica boolean not null default false,
  add column if not exists can_view_settings_finanziamenti boolean not null default false,
  add column if not exists can_edit_settings_finanziamenti boolean not null default false,
  add column if not exists can_view_settings_bundle boolean not null default false,
  add column if not exists can_edit_settings_bundle boolean not null default false;
