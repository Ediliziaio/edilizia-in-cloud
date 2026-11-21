-- Quantità dei materiali del cantiere per l'app operaio.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.campo_materiali_cantiere(p_azienda uuid, p_cantiere uuid, p_offset int)
returns table(stock_item_id uuid, nome text, unita_misura text, consegnato numeric, residuo numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null
    or coalesce(private.campo_magazzino_livello(p_azienda), 'nessuno') not in ('inventario', 'prelievi')
    or not exists (
      select 1 from public.orders o
      where o.id = p_cantiere and o.company_id = p_azienda and o.deleted_at is null
        and public.campo_lavoro_su_commessa(o.id)
    )
  then
    raise exception 'Materiali del cantiere non accessibili' using errcode = '42501';
  end if;

  return query
  with movimenti as (
    select m.stock_item_id,
      sum(m.quantity::numeric) filter (where m.movement_type = 'scarico') as entrata,
      coalesce(sum(m.quantity::numeric) filter (where m.rientro_commessa and m.movement_type = 'carico'), 0) as resa
    from public.warehouse_movements m
    where m.company_id = p_azienda and m.order_id = p_cantiere
      and (m.movement_type = 'scarico' or (m.movement_type = 'carico' and m.rientro_commessa))
      and (m.order_item_id is null or coalesce(m.notes, '') not like 'Divisione tra le fasi:%')
      and m.quantity > 0 and m.quantity::text not in ('NaN', 'Infinity', '-Infinity')
    group by m.stock_item_id
  ),
  articoli as (
    select s.id, s.name, nullif(btrim(s.unita_misura), '') as unita, m.entrata, m.resa
    from movimenti m
    join public.warehouse_stock s on s.id = m.stock_item_id and s.company_id = p_azienda
    where m.entrata > 0 and private.campo_magazzino_ubicazione(p_azienda, s.warehouse_id)
    order by s.name, s.id
    limit 31 offset greatest(0, coalesce(p_offset, 0))
  ),
  voci_approvate as (
    select a.id,
      replace(btrim(v.voce->>'quantita'), ',', '.') as testo_quantita,
      nullif(btrim(v.voce->>'unita'), '') as unita_dichiarata,
      a.unita as unita_articolo
    from public.campo_rapportini r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.materiali_usati) = 'array' then r.materiali_usati else '[]'::jsonb end
    ) v(voce)
    left join public.order_items i on i.order_id = p_cantiere and i.id::text = v.voce->>'order_item_id'
    join articoli a on a.id::text = coalesce(nullif(v.voce->>'stock_item_id', ''), i.stock_item_id::text)
    where r.company_id = p_azienda and r.order_id = p_cantiere and r.stato = 'approvato'
  ),
  quantita_approvate as (
    select v.id,
      case when length(v.testo_quantita) <= 40 and v.testo_quantita ~ '^[0-9]+([.][0-9]+)?$'
           then v.testo_quantita::numeric end as quantita,
      v.unita_dichiarata is null or (
        v.unita_articolo is not null
        and public.unita_confrontabile(v.unita_dichiarata) = public.unita_confrontabile(v.unita_articolo)
      ) as coerente
    from voci_approvate v
  ),
  usi as (
    select q.id, sum(q.quantita) as usato,
      bool_or(q.quantita is null or q.quantita <= 0 or not q.coerente) as da_verificare
    from quantita_approvate q
    group by q.id
  )
  select a.id, a.name, a.unita, a.entrata,
    case when not coalesce(u.da_verificare, false) and a.entrata >= a.resa + coalesce(u.usato, 0)
      then a.entrata - a.resa - coalesce(u.usato, 0) end
  from articoli a
  left join usi u on u.id = a.id
  order by a.name, a.id;
end;
$$;

create or replace function public.campo_materiali_cantiere(p_azienda uuid, p_cantiere uuid, p_offset int)
returns table(stock_item_id uuid, nome text, unita_misura text, consegnato numeric, residuo numeric)
language sql stable set search_path = ''
as $$ select * from private.campo_materiali_cantiere(p_azienda, p_cantiere, p_offset); $$;

revoke all on function private.campo_materiali_cantiere(uuid, uuid, int),
  public.campo_materiali_cantiere(uuid, uuid, int) from public, anon;
grant execute on function private.campo_materiali_cantiere(uuid, uuid, int),
  public.campo_materiali_cantiere(uuid, uuid, int) to authenticated;

notify pgrst, 'reload schema';
