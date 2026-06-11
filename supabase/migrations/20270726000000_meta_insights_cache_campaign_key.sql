-- FIX SYNC INSIGHTS META ADS: l'upsert del sync usava
-- onConflict (company_id,campaign_id,date_start,date_stop) ma NESSUN unique
-- constraint corrispondeva (l'unico esistente è company+ad_account+date_end+level,
-- usato dall'api-proxy) → errore 42P10 a ogni upsert; il fallback insert
-- falliva poi in silenzio per date_end NOT NULL senza default.
-- Risultato: il sync insights non ha MAI scritto una riga → spend guard e
-- KPI spesa senza dati.

-- Sentinel uuid-zero (colonne uuid): in un indice unico i NULL non
-- collidono mai, quindi il dedupe per adset/ad non funzionerebbe.
update public.meta_insights_cache set adset_id = '00000000-0000-0000-0000-000000000000' where adset_id is null;
update public.meta_insights_cache set ad_id = '00000000-0000-0000-0000-000000000000' where ad_id is null;
alter table public.meta_insights_cache
  alter column adset_id set default '00000000-0000-0000-0000-000000000000',
  alter column ad_id set default '00000000-0000-0000-0000-000000000000';
alter table public.meta_insights_cache
  alter column adset_id set not null,
  alter column ad_id set not null;

-- Dedupe preventivo delle righe campagna (oggi zero, per idempotenza)
delete from public.meta_insights_cache a
using public.meta_insights_cache b
where a.campaign_id is not null
  and a.company_id = b.company_id
  and b.campaign_id = a.campaign_id
  and b.adset_id = a.adset_id
  and b.ad_id = a.ad_id
  and b.date_start = a.date_start
  and b.date_stop is not distinct from a.date_stop
  and a.id < b.id;

-- Indice unico per l'upsert del sync (campaign_id NULL = righe api-proxy,
-- che in un indice unico non collidono mai tra loro: convivono senza vincoli).
create unique index if not exists meta_insights_cache_campaign_daily_key
  on public.meta_insights_cache (company_id, campaign_id, adset_id, ad_id, date_start, date_stop);
