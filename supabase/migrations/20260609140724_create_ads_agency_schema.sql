-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create schema if not exists ads_agency;

create table if not exists ads_agency.clienti (
  id bigint generated always as identity primary key,
  sigla text unique not null,
  nome text not null,
  ad_account_id text,
  piattaforma_default text default 'meta',
  cpl_target numeric,
  stato text default 'attivo',
  note text,
  created_at timestamptz default now()
);

create table if not exists ads_agency.kpi_daily (
  id bigint generated always as identity primary key,
  data date not null,
  cliente_sigla text not null,
  cliente_nome text not null,
  piattaforma text not null default 'meta',
  ad_account_id text,
  spesa numeric default 0,
  lead integer default 0,
  cpl numeric,
  cpm numeric,
  ctr numeric,
  cpc numeric,
  costo_link_click numeric,
  frequenza numeric,
  copertura integer,
  click integer,
  impression integer,
  campagne_attive integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint kpi_daily_unique unique (data, cliente_sigla, piattaforma)
);

create index if not exists kpi_daily_cliente_data_idx on ads_agency.kpi_daily (cliente_sigla, data);
create index if not exists kpi_daily_data_idx on ads_agency.kpi_daily (data);

alter table ads_agency.clienti enable row level security;
alter table ads_agency.kpi_daily enable row level security;

insert into ads_agency.clienti (sigla, nome, ad_account_id, piattaforma_default, stato)
values ('RENOVA', 'Renova Solution', '247084191603872', 'meta', 'attivo')
on conflict (sigla) do nothing;
