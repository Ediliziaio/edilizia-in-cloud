-- ============================================================
-- Auto-sync "valore opportunità" dai preventivi collegati.
-- Regola: marketing_opportunities.value = totale del preventivo
--   ACCETTATO più recente collegato all'opportunità; se nessuno
--   è accettato, totale del preventivo più recente (qualsiasi
--   stato, con totale > 0). Se non ci sono preventivi collegati
--   con totale, il valore manuale NON viene toccato.
-- Fonti preventivo: quotes (generico), rst_progetti
--   (ristrutturazione), fv_progetti (fotovoltaico), sr_progetti
--   (serramenti). Trigger su INSERT/UPDATE/DELETE -> ricalcolo,
--   così funziona da qualunque client (frontend, edge, AI).
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================

create index if not exists idx_quotes_opportunity_id        on public.quotes(opportunity_id)          where opportunity_id    is not null;
create index if not exists idx_rst_progetti_opportunita_id   on public.rst_progetti(opportunita_id)    where opportunita_id    is not null;
create index if not exists idx_fv_progetti_opportunita_crm   on public.fv_progetti(opportunita_crm_id) where opportunita_crm_id is not null;
create index if not exists idx_sr_progetti_opportunita_id    on public.sr_progetti(opportunita_id)     where opportunita_id    is not null;

create or replace function public.recompute_opportunity_value(p_opp uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  won_states text[] := array['accettato','accettata','firmato','firmata','approvato','approvata','da_consegnare','consegnato','venduto','vinto'];
  v_total   numeric;
  v_company uuid;
begin
  if p_opp is null then
    return;
  end if;

  with cand as (
    select q.total::numeric                                  as total,
           (lower(coalesce(q.status,'')) = any(won_states))  as accepted,
           coalesce(q.updated_at, q.created_at)              as ts,
           q.company_id                                      as company_id
    from public.quotes q
    where q.opportunity_id = p_opp and coalesce(q.total,0) > 0
    union all
    select coalesce(r.totale, r.totale_imponibile)::numeric,
           (lower(coalesce(r.stato,'')) = any(won_states)),
           coalesce(r.updated_at, r.created_at),
           r.company_id
    from public.rst_progetti r
    where r.opportunita_id = p_opp and coalesce(r.totale, r.totale_imponibile, 0) > 0
    union all
    select coalesce(f.costo_totale_netto, f.finanziamento_totale_dovuto_eur)::numeric,
           (lower(coalesce(f.stato,'')) = any(won_states)),
           coalesce(f.updated_at, f.created_at),
           f.company_id
    from public.fv_progetti f
    where f.opportunita_crm_id = p_opp and coalesce(f.costo_totale_netto, f.finanziamento_totale_dovuto_eur, 0) > 0
    union all
    select coalesce(s.totale_max, s.totale_min)::numeric,
           (lower(s.stato::text) = any(won_states)),
           coalesce(s.updated_at, s.created_at),
           s.company_id
    from public.sr_progetti s
    where s.opportunita_id = p_opp and coalesce(s.totale_max, s.totale_min, 0) > 0
  )
  select total, company_id
    into v_total, v_company
  from cand
  order by accepted desc, ts desc nulls last
  limit 1;

  if v_total is not null then
    update public.marketing_opportunities
       set value = v_total
     where id = p_opp
       and company_id = v_company          -- guard cross-tenant
       and value is distinct from v_total;
  end if;
end;
$fn$;

-- Trigger generica: TG_ARGV[0] = nome colonna che lega all'opportunità
create or replace function public.trg_recompute_opp_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $tg$
declare
  col     text := tg_argv[0];
  new_opp uuid;
  old_opp uuid;
begin
  if tg_op <> 'INSERT' then
    old_opp := (to_jsonb(old) ->> col)::uuid;
  end if;
  if tg_op <> 'DELETE' then
    new_opp := (to_jsonb(new) ->> col)::uuid;
  end if;

  if old_opp is not null and old_opp is distinct from new_opp then
    perform public.recompute_opportunity_value(old_opp);
  end if;
  if new_opp is not null then
    perform public.recompute_opportunity_value(new_opp);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$tg$;

drop trigger if exists trg_quotes_opp_value on public.quotes;
create trigger trg_quotes_opp_value
  after insert or update or delete on public.quotes
  for each row execute function public.trg_recompute_opp_value('opportunity_id');

drop trigger if exists trg_rst_opp_value on public.rst_progetti;
create trigger trg_rst_opp_value
  after insert or update or delete on public.rst_progetti
  for each row execute function public.trg_recompute_opp_value('opportunita_id');

drop trigger if exists trg_fv_opp_value on public.fv_progetti;
create trigger trg_fv_opp_value
  after insert or update or delete on public.fv_progetti
  for each row execute function public.trg_recompute_opp_value('opportunita_crm_id');

drop trigger if exists trg_sr_opp_value on public.sr_progetti;
create trigger trg_sr_opp_value
  after insert or update or delete on public.sr_progetti
  for each row execute function public.trg_recompute_opp_value('opportunita_id');

-- Backfill retroattivo su tutte le opportunità con preventivi collegati
do $bf$
declare r record;
begin
  for r in
    select distinct opp from (
      select opportunity_id    as opp from public.quotes        where opportunity_id    is not null
      union select opportunita_id       from public.rst_progetti where opportunita_id     is not null
      union select opportunita_crm_id   from public.fv_progetti  where opportunita_crm_id is not null
      union select opportunita_id       from public.sr_progetti  where opportunita_id     is not null
    ) x
  loop
    perform public.recompute_opportunity_value(r.opp);
  end loop;
end;
$bf$;
