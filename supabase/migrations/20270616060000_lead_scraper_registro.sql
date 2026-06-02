-- Lead Scraper · Firmografici reali dal Registro Imprese (via openapi.it)
-- Aggiunge fatturato, n° dipendenti, anno di fondazione e forma giuridica ai
-- risultati, per filtrare i lead per dimensione/codice ATECO edilizia (41/42/43).

alter table public.lead_scraper_results
  add column if not exists fatturato        numeric,
  add column if not exists dipendenti       integer,
  add column if not exists anno_fondazione  integer,
  add column if not exists forma_giuridica  text;

comment on column public.lead_scraper_results.fatturato is 'Fatturato/ricavi ultimo bilancio (EUR) da Registro Imprese';
comment on column public.lead_scraper_results.dipendenti is 'Numero dipendenti da Registro Imprese';
comment on column public.lead_scraper_results.anno_fondazione is 'Anno di costituzione/inizio attività';
comment on column public.lead_scraper_results.forma_giuridica is 'Forma giuridica (SRL, SPA, ditta individuale, ...)';

-- Indici per i filtri firmografici (parziali: solo righe valorizzate).
create index if not exists idx_lss_results_ateco
  on public.lead_scraper_results (ateco) where ateco is not null;
create index if not exists idx_lss_results_dipendenti
  on public.lead_scraper_results (dipendenti) where dipendenti is not null;
create index if not exists idx_lss_results_fatturato
  on public.lead_scraper_results (fatturato) where fatturato is not null;
