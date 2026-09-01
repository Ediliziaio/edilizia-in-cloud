-- Pipeline di selezione personalizzabile (richiesta utente 2026-09-01):
-- ogni azienda definisce le SUE fasi (primo colloquio, secondo colloquio,
-- prova in cantiere…) e i candidati si muovono di fase in fase nel kanban.
-- Gli esiti finali (assunto/scartato/archiviato) restano sullo stato del
-- candidato: la fase dice DOVE sei nel processo, l'esito COME è finita.

create table if not exists public.hr_selezione_fasi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  posizione integer not null default 0,
  colore text,
  created_at timestamptz not null default now(),
  unique (company_id, nome)
);

alter table public.hr_candidati
  add column if not exists fase_id uuid references public.hr_selezione_fasi(id) on delete set null;

create index if not exists hr_candidati_company_fase_idx on public.hr_candidati (company_id, fase_id);

alter table public.hr_selezione_fasi enable row level security;

drop policy if exists hr_selezione_fasi_admin on public.hr_selezione_fasi;
create policy hr_selezione_fasi_admin on public.hr_selezione_fasi
  for all using (
    company_id = get_my_company_id()
    and (has_role(auth.uid(), 'company_admin'::app_role)
      or has_role(auth.uid(), 'company_staff'::app_role)
      or has_role(auth.uid(), 'super_admin'::app_role))
  );
