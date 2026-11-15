-- Riepilogo commesse: ogni azienda sceglie i 4 riquadri e cosa mostra il grafico «Andamento commesse».
-- Una riga per azienda; senza riga valgono i riquadri di sempre (commesse, venduto, incassato, da incassare).
-- Si legge con la policy (chi vede le commesse), si scrive solo con riepilogo_commesse_salva,
-- che vuole il permesso di modificare le impostazioni delle commesse.
-- Le cifre non passano da qui: questa tabella dice solo QUALI riquadri; chi non ha i permessi
-- degli importi, dei costi o dei margini continua a non riceverle (il filtro è nella pagina e nelle viste).

create table if not exists public.company_riepilogo_commesse (
  company_id uuid primary key references public.companies(id) on delete cascade,
  riquadri text[] not null default array['commesse', 'venduto', 'incassato', 'da_incassare'],
  grafico_serie text[] not null default array['venduto', 'incassato'],
  grafico_vista text not null default 'importi',
  grafico_forma text not null default 'linee',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.company_riepilogo_commesse drop constraint if exists riepilogo_commesse_riquadri;
alter table public.company_riepilogo_commesse add constraint riepilogo_commesse_riquadri check (
  cardinality(riquadri) between 1 and 4
  and riquadri <@ array['commesse', 'venduto', 'incassato', 'da_incassare', 'ticket_medio', 'costi', 'margine',
                        'aperte', 'in_ritardo', 'assistenza', 'completate']::text[]);
alter table public.company_riepilogo_commesse drop constraint if exists riepilogo_commesse_grafico;
alter table public.company_riepilogo_commesse add constraint riepilogo_commesse_grafico check (
  cardinality(grafico_serie) between 1 and 3
  and grafico_serie <@ array['venduto', 'incassato', 'da_incassare']::text[]
  and grafico_vista in ('importi', 'numero')
  and grafico_forma in ('linee', 'barre'));

comment on table public.company_riepilogo_commesse is
  'Scelta per azienda dei riquadri del riepilogo commesse e del grafico accanto. Si scrive con riepilogo_commesse_salva.';

alter table public.company_riepilogo_commesse enable row level security;
revoke all on public.company_riepilogo_commesse from anon, authenticated;
grant select on public.company_riepilogo_commesse to authenticated;

drop policy if exists riepilogo_commesse_lettura on public.company_riepilogo_commesse;
create policy riepilogo_commesse_lettura on public.company_riepilogo_commesse for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

create or replace function public.riepilogo_commesse_salva(
  p_company_id uuid, p_riquadri text[], p_grafico_serie text[], p_grafico_vista text, p_grafico_forma text)
returns public.company_riepilogo_commesse
language plpgsql
security definer
set search_path = public
as $$
declare
  v_riquadri text[];
  v_serie text[];
  v_riga public.company_riepilogo_commesse;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare il riepilogo delle commesse.' using errcode = '42501';
  end if;
  -- Senza doppioni, nell'ordine scelto.
  select coalesce(array_agg(r order by pos), '{}') into v_riquadri
    from (select r, min(pos) pos from unnest(coalesce(p_riquadri, '{}')) with ordinality u(r, pos) group by r) s;
  select coalesce(array_agg(r order by pos), '{}') into v_serie
    from (select r, min(pos) pos from unnest(coalesce(p_grafico_serie, '{}')) with ordinality u(r, pos) group by r) s;

  insert into public.company_riepilogo_commesse
    (company_id, riquadri, grafico_serie, grafico_vista, grafico_forma, updated_by, updated_at)
  values (p_company_id, v_riquadri, v_serie, p_grafico_vista, p_grafico_forma, auth.uid(), now())
  on conflict (company_id) do update
    set riquadri = excluded.riquadri, grafico_serie = excluded.grafico_serie,
        grafico_vista = excluded.grafico_vista, grafico_forma = excluded.grafico_forma,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_riga;
  return v_riga;
exception when check_violation then
  raise exception 'Scelta non valida: da 1 a 4 riquadri e almeno una serie del grafico.' using errcode = '22023';
end;
$$;

revoke all on function public.riepilogo_commesse_salva(uuid, text[], text[], text, text) from public, anon;
grant execute on function public.riepilogo_commesse_salva(uuid, text[], text[], text, text) to authenticated;
