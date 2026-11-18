-- I verbali emessi conservano il contratto e l'IVA anche se la commessa cambia.
-- Lo storico precedente alla migrazione continua a usare le date verificabili.
create table public.sal_contratto_emesso (
  sal_id uuid primary key references public.sal_records(id) on delete cascade,
  company_id uuid not null,
  acquisito_il timestamptz not null,
  importo_base numeric not null,
  aliquota_iva numeric,
  varianti jsonb not null
);
alter table public.sal_contratto_emesso enable row level security;
revoke all on public.sal_contratto_emesso from public, anon, authenticated, service_role;
grant select on public.sal_contratto_emesso to service_role;

create function private.sal_conserva_contratto_emesso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stato not in ('emesso', 'approvato', 'firmato') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.stato <> 'bozza' then
    return new;
  end if;
  -- Un'importazione con data storica non deve fotografare il contratto di oggi.
  if new.data_emissione < (statement_timestamp() at time zone 'Europe/Rome')::date then
    return new;
  end if;

  insert into public.sal_contratto_emesso (
    sal_id, company_id, acquisito_il, importo_base, aliquota_iva, varianti
  )
  select new.id, o.company_id, statement_timestamp(), o.total_amount, o.vat_rate,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'status', v.status, 'impatto_economico', v.impatto_economico
      ) order by v.id)
      from public.ordini_variazione v
      where v.order_id = o.id and v.company_id = o.company_id and v.status = 'approvato'
    ), '[]'::jsonb)
  from public.orders o
  where o.id = new.order_id and o.company_id = new.company_id
  on conflict (sal_id) do nothing;

  return new;
end;
$$;
revoke all on function private.sal_conserva_contratto_emesso() from public, anon, authenticated, service_role;
create trigger trg_sal_conserva_contratto_emesso
  after insert or update of stato on public.sal_records
  for each row execute function private.sal_conserva_contratto_emesso();

notify pgrst, 'reload schema';