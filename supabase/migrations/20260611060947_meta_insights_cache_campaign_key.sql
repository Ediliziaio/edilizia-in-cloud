-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

update public.meta_insights_cache set adset_id = '00000000-0000-0000-0000-000000000000' where adset_id is null;
update public.meta_insights_cache set ad_id = '00000000-0000-0000-0000-000000000000' where ad_id is null;
alter table public.meta_insights_cache
  alter column adset_id set default '00000000-0000-0000-0000-000000000000',
  alter column ad_id set default '00000000-0000-0000-0000-000000000000';
alter table public.meta_insights_cache
  alter column adset_id set not null,
  alter column ad_id set not null;

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

create unique index if not exists meta_insights_cache_campaign_daily_key
  on public.meta_insights_cache (company_id, campaign_id, adset_id, ad_id, date_start, date_stop);
