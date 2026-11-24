-- Magazzino dell'area operai (24/11/2026, richiesta del founder: «semplice e intuitivo, poter vedere i vari
-- magazzini»).
--
-- 1. campo_magazzino_magazzini(p_azienda): i magazzini che la persona può vedere, con quanti articoli
--    disponibili ha ciascuno, per i pulsanti in cima all'inventario. Stesse regole dell'inventario
--    (private.campo_magazzino_livello e private.campo_magazzino_ubicazione).
-- 2. campo_magazzino_inventario_dettaglio con un quinto argomento p_magazzino: l'inventario di un solo
--    magazzino. Il corpo è quello di prima con un filtro in più; la versione a quattro argomenti resta e
--    chiama la nuova con p_magazzino null, così chi la usa oggi non cambia.

create or replace function private.campo_magazzino_inventario_dettaglio(
  p_azienda uuid, p_cerca text, p_offset integer, p_solo_disponibili boolean, p_magazzino uuid)
returns table(id uuid, name text, description text, internal_code text, unita_misura text, disponibile numeric,
              warehouse_id uuid, magazzino text, ubicazione text)
language plpgsql
stable security definer
set search_path to ''
as $function$
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
      and (p_magazzino is null or s.warehouse_id = p_magazzino)
      and (not coalesce(p_solo_disponibili, false) or coalesce(s.quantity_available, s.quantity, 0) > 0)
      and (
        nullif(btrim(p_cerca), '') is null
        or strpos(lower(concat_ws(' ', s.name, s.description, s.internal_code, s.barcode, w.name, z.name)),
          lower(left(btrim(p_cerca), 100))) > 0
      )
    order by s.name, s.id
    limit 60 offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

create or replace function private.campo_magazzino_inventario_dettaglio(
  p_azienda uuid, p_cerca text, p_offset integer, p_solo_disponibili boolean)
returns table(id uuid, name text, description text, internal_code text, unita_misura text, disponibile numeric,
              warehouse_id uuid, magazzino text, ubicazione text)
language sql
stable security definer
set search_path to ''
as $function$ select * from private.campo_magazzino_inventario_dettaglio(p_azienda, p_cerca, p_offset, p_solo_disponibili, null::uuid); $function$;

create or replace function public.campo_magazzino_inventario_dettaglio(
  p_azienda uuid, p_cerca text, p_offset integer, p_solo_disponibili boolean, p_magazzino uuid)
returns table(id uuid, name text, description text, internal_code text, unita_misura text, disponibile numeric,
              warehouse_id uuid, magazzino text, ubicazione text)
language sql
stable
set search_path to ''
as $function$ select * from private.campo_magazzino_inventario_dettaglio(p_azienda, p_cerca, p_offset, p_solo_disponibili, p_magazzino); $function$;

create or replace function private.campo_magazzino_magazzini(p_azienda uuid)
returns table(id uuid, nome text, articoli_disponibili bigint)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if private.campo_magazzino_livello(p_azienda) = 'nessuno' then
    raise exception 'Inventario non autorizzato' using errcode = '42501';
  end if;
  return query
    select w.id, w.name,
      (select count(*) from public.warehouse_stock s
        where s.company_id = p_azienda and s.warehouse_id = w.id and coalesce(s.quantity_available, s.quantity, 0) > 0)
    from public.warehouses w
    where w.company_id = p_azienda and w.is_active
      and private.campo_magazzino_ubicazione(p_azienda, w.id)
    order by w.name, w.id;
end;
$function$;

create or replace function public.campo_magazzino_magazzini(p_azienda uuid)
returns table(id uuid, nome text, articoli_disponibili bigint)
language sql
stable
set search_path to ''
as $function$ select * from private.campo_magazzino_magazzini(p_azienda); $function$;

revoke all on function private.campo_magazzino_inventario_dettaglio(uuid, text, integer, boolean, uuid) from public, anon;
revoke all on function public.campo_magazzino_inventario_dettaglio(uuid, text, integer, boolean, uuid) from public, anon;
revoke all on function private.campo_magazzino_magazzini(uuid) from public, anon;
revoke all on function public.campo_magazzino_magazzini(uuid) from public, anon;
grant execute on function private.campo_magazzino_inventario_dettaglio(uuid, text, integer, boolean, uuid) to authenticated;
grant execute on function public.campo_magazzino_inventario_dettaglio(uuid, text, integer, boolean, uuid) to authenticated;
grant execute on function private.campo_magazzino_magazzini(uuid) to authenticated;
grant execute on function public.campo_magazzino_magazzini(uuid) to authenticated;
