-- Credenziali Zucchetti Digital Hub / FatelWeb su billing_integrations.
--
-- Il pannello Digital Hub ha QUATTRO valori (URL del servizio, utente, password,
-- company), mentre gli altri provider ne hanno due (company_external_id + api_key).
-- Mappatura per Zucchetti: password = api_key, company = company_external_id,
-- e servono due colonne in più:
--   provider_username  → l'utente (es. palmas.r.l.a@…)
--   provider_base_url  → l'URL del servizio (es. https://digitalhub2.zucchetti.it/fatelw/services/fatelwV2)
-- Nullable e generiche: utili anche a futuri provider con utente separato o URL per-azienda.
--
-- Applicata il 23/10/2026 (apply_migration + versione riallineata). Il connettore
-- resta «beta» finché non è collaudato sul sandbox Zucchetti.

alter table public.billing_integrations
  add column if not exists provider_username text,
  add column if not exists provider_base_url text;
