-- I costi stimati delle voci del preventivo con computo (29/10/2026) non stanno
-- più nella bozza: la bozza la legge chiunque veda i preventivi, i costi solo
-- chi ha il permesso «Visualizza costi». Lo schermo li nascondeva già, il
-- database no. Una riga per bozza: {"<id voce>": "12,50", …}.

create table if not exists public.computo_preventivo_costi (
  company_id uuid not null,
  draft_id uuid not null,
  costi jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (company_id, draft_id),
  foreign key (company_id, draft_id) references public.computo_preventivo_drafts(company_id, id) on delete cascade,
  constraint computo_costi_oggetto check (jsonb_typeof(costi) = 'object' and octet_length(costi::text) <= 1048576)
);

alter table public.computo_preventivo_costi enable row level security;
revoke all on public.computo_preventivo_costi from public, anon, authenticated;
grant select, insert, update on public.computo_preventivo_costi to authenticated;
grant all on public.computo_preventivo_costi to service_role;

drop policy if exists blocco_utente_bloccato on public.computo_preventivo_costi;
create policy blocco_utente_bloccato on public.computo_preventivo_costi as restrictive for all to authenticated
  using (not (select public.utente_bloccato()));

drop policy if exists computo_costi_lettura on public.computo_preventivo_costi;
create policy computo_costi_lettura on public.computo_preventivo_costi for select to authenticated using (
  (select public.has_role(auth.uid(), 'super_admin')) or company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
);
-- Scrive chi vede i costi E modifica i preventivi; la bozza dev'essere visibile a chi scrive.
drop policy if exists computo_costi_scrittura on public.computo_preventivo_costi;
create policy computo_costi_scrittura on public.computo_preventivo_costi for insert to authenticated with check (
  ((select public.has_role(auth.uid(), 'super_admin')) or (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))))
  and exists (select 1 from public.computo_preventivo_drafts d where d.company_id = computo_preventivo_costi.company_id and d.id = computo_preventivo_costi.draft_id)
);
drop policy if exists computo_costi_modifica on public.computo_preventivo_costi;
create policy computo_costi_modifica on public.computo_preventivo_costi for update to authenticated using (
  (select public.has_role(auth.uid(), 'super_admin')) or (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
) with check (
  (select public.has_role(auth.uid(), 'super_admin')) or (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);
