-- Banca dati candidati (area Personale & HR → tab "Candidati").
-- Richiesta utente 2026-09-01: un elenco di candidati diviso per ruolo dove
-- caricare il CV, registrare i colloqui e la valutazione — così i candidati
-- vecchi si ritrovano quando serve. Il test attitudinale (hr_talent_candidates)
-- resta un modulo a parte: qui ci si AGGANCIA, non lo si richiede.

create table if not exists public.hr_candidati (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  cognome text not null default '',
  email text,
  telefono text,
  citta text,
  -- Ruolo per cui si candida: testo libero (muratore, capocantiere, geometra…)
  -- perché ogni impresa ha i suoi nomi; l'elenco si raggruppa su questo.
  ruolo text not null default 'Altro',
  stato text not null default 'nuovo'
    check (stato in ('nuovo','in_valutazione','colloquio','offerta','assunto','scartato','archiviato')),
  fonte text not null default 'manuale'
    check (fonte in ('manuale','campagna','test_attitudinale','segnalazione','sito','altro')),
  valutazione smallint check (valutazione between 1 and 5),
  cv_path text,
  cv_nome text,
  note text,
  talent_candidate_id uuid references public.hr_talent_candidates(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_candidati_company_ruolo_idx on public.hr_candidati (company_id, ruolo);
create index if not exists hr_candidati_company_stato_idx on public.hr_candidati (company_id, stato);

create table if not exists public.hr_candidati_colloqui (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidato_id uuid not null references public.hr_candidati(id) on delete cascade,
  data_colloquio date not null,
  tipo text not null default 'conoscitivo'
    check (tipo in ('telefonico','conoscitivo','tecnico','in_cantiere','finale','altro')),
  esito text check (esito in ('positivo','negativo','da_decidere')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists hr_candidati_colloqui_candidato_idx on public.hr_candidati_colloqui (candidato_id);

-- RLS: come le altre tabelle HR (hr_documenti_admin) — solo staff aziendale,
-- nessun self-read: i candidati non hanno un account.
alter table public.hr_candidati enable row level security;
alter table public.hr_candidati_colloqui enable row level security;

drop policy if exists hr_candidati_admin on public.hr_candidati;
create policy hr_candidati_admin on public.hr_candidati
  for all using (
    company_id = get_my_company_id()
    and (has_role(auth.uid(), 'company_admin'::app_role)
      or has_role(auth.uid(), 'company_staff'::app_role)
      or has_role(auth.uid(), 'super_admin'::app_role))
  );

drop policy if exists hr_candidati_colloqui_admin on public.hr_candidati_colloqui;
create policy hr_candidati_colloqui_admin on public.hr_candidati_colloqui
  for all using (
    company_id = get_my_company_id()
    and (has_role(auth.uid(), 'company_admin'::app_role)
      or has_role(auth.uid(), 'company_staff'::app_role)
      or has_role(auth.uid(), 'super_admin'::app_role))
  );

create or replace function public.hr_candidati_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_hr_candidati_updated_at on public.hr_candidati;
create trigger trg_hr_candidati_updated_at
  before update on public.hr_candidati
  for each row execute function public.hr_candidati_set_updated_at();
