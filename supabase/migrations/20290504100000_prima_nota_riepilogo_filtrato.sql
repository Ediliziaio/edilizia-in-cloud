-- Saldo e serie mensile con gli stessi filtri e le stesse policy dell'elenco.
-- I totali si calcolano prima del limite di righe applicato dall'API.
create or replace function public.prima_nota_riepilogo_filtrato(
  p_company_id uuid,
  p_from_date date default null,
  p_to_date date default null,
  p_direction text default null,
  p_category text default null,
  p_is_auto boolean default null,
  p_auto_source text default null,
  p_description_pattern text default null,
  p_bank_account_id uuid default null,
  p_conto_liquidita_id uuid default null,
  p_account_label_pattern text default null,
  p_monthly boolean default false
)
returns table(mese date, entrate numeric, uscite numeric, saldo numeric, entry_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.mese, t.entrate, t.uscite, t.entrate - t.uscite, t.entry_count
  from (
    select
      case when p_monthly then date_trunc('month', e.entry_date::timestamp)::date end as mese,
      coalesce(sum(e.amount) filter (where e.direction = 'entrata'), 0) as entrate,
      coalesce(sum(e.amount) filter (where e.direction = 'uscita'), 0) as uscite,
      count(*) as entry_count
    from public.prima_nota_entries e
    where e.company_id = p_company_id
      and (p_from_date is null or e.entry_date >= p_from_date)
      and (p_to_date is null or e.entry_date <= p_to_date)
      and (p_direction is null or e.direction = p_direction)
      and (p_category is null or e.category = p_category)
      and (p_is_auto is null or e.is_auto = p_is_auto)
      and (p_auto_source is null or e.auto_source = p_auto_source)
      and (p_description_pattern is null or e.description ilike replace(p_description_pattern, '*', '%'))
      and (p_bank_account_id is null or e.bank_account_id = p_bank_account_id)
      and (p_conto_liquidita_id is null or e.conto_liquidita_id = p_conto_liquidita_id)
      and (p_account_label_pattern is null or e.account_label ilike replace(p_account_label_pattern, '*', '%'))
    group by 1
  ) t
  order by t.mese;
$$;

revoke all on function public.prima_nota_riepilogo_filtrato(uuid, date, date, text, text, boolean, text, text, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.prima_nota_riepilogo_filtrato(uuid, date, date, text, text, boolean, text, text, uuid, uuid, text, boolean) to authenticated;
