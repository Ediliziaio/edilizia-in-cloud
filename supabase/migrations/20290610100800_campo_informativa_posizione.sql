-- Informativa sulla posizione prima della timbratura (26/11/2026, piano campo completo, punto 4.2).
--
-- La timbratura allega la posizione del telefono: è un dato personale e, per l'art. 4 dello Statuto dei
-- lavoratori, uno strumento che può servire al controllo a distanza. Prima di raccoglierla la persona deve
-- essere informata. Qui si registra la presa visione: chi, quale testo (versione), quando. Finché non c'è,
-- l'app non chiede la posizione (si timbra lo stesso, senza). Il testo dell'informativa sta nell'app
-- (InformativaPosizione.tsx) ed è da far approvare a un legale; cambiandolo si alza la versione e la
-- presa visione si chiede di nuovo.
-- L'accordo sindacale o l'autorizzazione dell'Ispettorato restano un adempimento dell'azienda (piano 4.2, ufficio).

create table if not exists public.campo_informative (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('posizione_timbratura')),
  versione text not null,
  accettata_il timestamptz not null default now(),
  primary key (user_id, company_id, tipo, versione)
);
alter table public.campo_informative enable row level security;
revoke all on public.campo_informative from public, anon, authenticated;

-- L'ufficio vede chi l'ha letta (permesso: amministratore dell'azienda).
drop policy if exists campo_informative_ufficio on public.campo_informative;
create policy campo_informative_ufficio on public.campo_informative for select to authenticated
  using (public.e_amministratore_di(company_id));
grant select on public.campo_informative to authenticated;

create or replace function public.campo_informativa_letta(p_tipo text, p_versione text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (select 1 from public.campo_informative i
                 where i.user_id = auth.uid() and i.company_id = public.get_my_company_id()
                   and i.tipo = p_tipo and i.versione = p_versione);
$$;

create or replace function public.campo_informativa_accetta(p_tipo text, p_versione text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare v_azienda uuid := public.get_my_company_id();
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  if p_tipo is distinct from 'posizione_timbratura' or nullif(btrim(p_versione), '') is null or length(p_versione) > 20 then
    raise exception 'Informativa non valida.' using errcode = '22023';
  end if;
  insert into public.campo_informative (user_id, company_id, tipo, versione)
  values (auth.uid(), v_azienda, p_tipo, p_versione)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.campo_informativa_letta(text, text) from public, anon;
revoke all on function public.campo_informativa_accetta(text, text) from public, anon;
grant execute on function public.campo_informativa_letta(text, text) to authenticated;
grant execute on function public.campo_informativa_accetta(text, text) to authenticated;
