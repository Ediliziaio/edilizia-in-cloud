-- Moduli di candidatura pubblici (richiesta utente 2026-09-02): come i moduli
-- lead del sito, ma per i candidati — l'impresa crea il modulo, mette il link
-- sul proprio sito (o in un annuncio) e chi si candida finisce dritto nella
-- banca dati candidati, in prima fase della pipeline, con fonte "sito".
-- Il token è il segmento pubblico dell'URL: non indovinabile, revocabile
-- spegnendo il modulo. Nessuna policy anon: la pagina pubblica passa da una
-- edge function con service role.

create table if not exists public.hr_candidatura_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  titolo text not null,
  descrizione text,
  -- Ruoli proposti nel menu del modulo; vuoto = campo libero.
  ruoli text[] not null default '{}',
  attivo boolean not null default true,
  total_views integer not null default 0,
  total_submissions integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists hr_candidatura_forms_company_idx on public.hr_candidatura_forms (company_id);

alter table public.hr_candidatura_forms enable row level security;

drop policy if exists hr_candidatura_forms_admin on public.hr_candidatura_forms;
create policy hr_candidatura_forms_admin on public.hr_candidatura_forms
  for all using (
    company_id = get_my_company_id()
    and (has_role(auth.uid(), 'company_admin'::app_role)
      or has_role(auth.uid(), 'company_staff'::app_role)
      or has_role(auth.uid(), 'super_admin'::app_role))
  );
