-- Inventario dell'app operaio con disponibilità e zona di stoccaggio.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function private.campo_magazzino_inventario_dettaglio(
  p_azienda uuid, p_cerca text, p_offset int, p_solo_disponibili boolean
)
returns table(
  id uuid, name text, description text, internal_code text, unita_misura text,
  disponibile numeric, warehouse_id uuid, magazzino text, ubicazione text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.campo_magazzino_livello(p_azienda) = 'nessuno' then
    raise exception 'Inventario non autorizzato' using errcode = '42501';
  end if;

  return query
    with magazzini as materialized (
      select w.id, w.name from public.warehouses w
      where w.company_id = p_azienda and w.is_active
        and private.campo_magazzino_ubicazione(p_azienda, w.id)
    )
    select s.id, s.name, s.description, s.internal_code, s.unita_misura,
      coalesce(s.quantity_available, s.quantity, 0), s.warehouse_id, w.name, nullif(btrim(z.name), '')
    from public.warehouse_stock s
    left join magazzini w on w.id = s.warehouse_id
    left join public.warehouse_sections z on z.id = s.section_id and z.company_id = p_azienda
      and (z.warehouse_id is null or z.warehouse_id = w.id)
    where s.company_id = p_azienda
      and (w.id is not null or (s.warehouse_id is null and (select private.campo_magazzino_ubicazione(p_azienda, null))))
      and (not coalesce(p_solo_disponibili, false) or coalesce(s.quantity_available, s.quantity, 0) > 0)
      and (
        nullif(btrim(p_cerca), '') is null
        or strpos(lower(concat_ws(' ', s.name, s.description, s.internal_code, s.barcode, w.name, z.name)),
          lower(left(btrim(p_cerca), 100))) > 0
      )
    order by s.name, s.id
    limit 60 offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.campo_magazzino_inventario_dettaglio(
  p_azienda uuid, p_cerca text, p_offset int, p_solo_disponibili boolean
)
returns table(
  id uuid, name text, description text, internal_code text, unita_misura text,
  disponibile numeric, warehouse_id uuid, magazzino text, ubicazione text
)
language sql stable set search_path = ''
as $$ select * from private.campo_magazzino_inventario_dettaglio(p_azienda, p_cerca, p_offset, p_solo_disponibili); $$;

revoke all on function private.campo_magazzino_inventario_dettaglio(uuid, text, int, boolean),
  public.campo_magazzino_inventario_dettaglio(uuid, text, int, boolean) from public, anon;
grant execute on function private.campo_magazzino_inventario_dettaglio(uuid, text, int, boolean),
  public.campo_magazzino_inventario_dettaglio(uuid, text, int, boolean) to authenticated, service_role;
