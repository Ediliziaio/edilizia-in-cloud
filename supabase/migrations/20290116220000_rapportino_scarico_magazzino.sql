-- Materiali del rapportino presi dal magazzino: l'ufficio sceglie il prodotto e parte lo scarico sulla commessa.
-- Annullando o correggendo il rapportino la merce rientra allo stesso costo.
set local lock_timeout = '3s';
alter table public.rapportino_materiali_regolarizzati
  add column if not exists movimento_id uuid references public.warehouse_movements(id) on delete set null;

drop function if exists public.materiali_da_regolarizzare(uuid);
create function public.materiali_da_regolarizzare(p_order_id uuid)
returns table(rapportino_id uuid, chiave text, data_lavoro date, nome text, quantita numeric, unita text, fase_id text, fornitore text, provenienza text)
language plpgsql stable security definer set search_path to '' as $$
declare v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) then
    raise exception 'Non hai accesso a questa commessa' using errcode = '42501';
  end if;
  return query
    with m as (
      select r.id as rid, r.data_lavoro as dl, e as v,
             coalesce(nullif(btrim(e->>'nome'), ''), nullif(btrim(e->>'descrizione'), '')) as n
        from public.campo_rapportini r, jsonb_array_elements(case when jsonb_typeof(r.materiali_usati) = 'array' then r.materiali_usati else '[]'::jsonb end) e
       where r.order_id = p_order_id and r.stato = 'approvato' and r.annullato_at is null and jsonb_typeof(e) = 'object'
    )
    select m.rid, lower(m.n) || '|' || coalesce(m.v->>'quantita', ''), m.dl, m.n,
           case when m.v->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m.v->>'quantita', ',', '.')::numeric end,
           coalesce(nullif(m.v->>'unita', ''), nullif(m.v->>'unita_misura', '')),
           m.v->>'fase_id', nullif(btrim(m.v->>'fornitore'), ''), nullif(m.v->>'provenienza', '')
      from m
     where m.n is not null
       and nullif(m.v->>'order_item_id', '') is null
       and nullif(m.v->>'stock_item_id', '') is null
       and coalesce(m.v->>'provenienza', '') <> 'consumo'
       and coalesce((m.v->>'da_furgone')::boolean, false) = false
       and not exists (select 1 from public.rapportino_materiali_regolarizzati x
                        where x.rapportino_id = m.rid and x.chiave = lower(m.n) || '|' || coalesce(m.v->>'quantita', ''))
     order by m.dl, m.n;
end; $$;
revoke all on function public.materiali_da_regolarizzare(uuid) from public, anon;
grant execute on function public.materiali_da_regolarizzare(uuid) to authenticated;

create or replace function public.materiali_scarica_magazzino(p_order_id uuid, p_righe jsonb)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  v_company uuid; v_riga record; v_mat record; ws public.warehouse_stock; v_mov uuid; n integer := 0;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_company) then
    raise exception 'Non hai il permesso di scaricare il magazzino su questa commessa' using errcode = '42501';
  end if;
  if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Scegli almeno un materiale' using errcode = '22023';
  end if;
  for v_riga in select (e->>'rapportino_id')::uuid as rid, e->>'chiave' as chiave, nullif(e->>'stock_item_id', '')::uuid as stock, (e->>'quantita')::numeric as q
                  from jsonb_array_elements(p_righe) e loop
    select * into v_mat from public.materiali_da_regolarizzare(p_order_id) c where c.rapportino_id = v_riga.rid and c.chiave = v_riga.chiave limit 1;
    if v_mat.rapportino_id is null then continue; end if;
    if v_riga.q is null or v_riga.q <= 0 or v_riga.q <> trunc(v_riga.q) then
      raise exception 'Il magazzino conta pezzi interi: controlla la quantità di %', v_mat.nome using errcode = '22023';
    end if;
    select * into ws from public.warehouse_stock s where s.id = v_riga.stock and s.company_id = v_company for update;
    if ws.id is null then raise exception 'Scegli il prodotto di magazzino per %', v_mat.nome using errcode = '22023'; end if;
    if coalesce(ws.quantity, 0) < v_riga.q then
      raise exception 'Giacenza insufficiente per %: disponibili %, richiesti %', ws.name, coalesce(ws.quantity, 0), v_riga.q using errcode = '23514';
    end if;
    update public.warehouse_stock set quantity = quantity - v_riga.q, updated_at = now() where id = ws.id;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id)
    values (ws.id, 'scarico', v_riga.q, 'Dal rapportino del ' || to_char(v_mat.data_lavoro, 'DD/MM/YYYY') || ': ' || v_mat.nome, auth.uid(), p_order_id, v_company, ws.warehouse_id)
    returning id into v_mov;
    insert into public.rapportino_materiali_regolarizzati (rapportino_id, chiave, movimento_id, ignorato)
    values (v_riga.rid, v_riga.chiave, v_mov, false);
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.materiali_scarica_magazzino(uuid, jsonb) from public, anon;
grant execute on function public.materiali_scarica_magazzino(uuid, jsonb) to authenticated;

create or replace function public.rapportino_scarichi_ripristina() returns trigger language plpgsql security definer set search_path to '' as $$
declare x record; v_chiavi text[];
begin
  if new.annullato_at is null and new.materiali_usati is not distinct from old.materiali_usati then return null; end if;
  select coalesce(array_agg(lower(coalesce(nullif(btrim(e->>'nome'), ''), nullif(btrim(e->>'descrizione'), ''))) || '|' || coalesce(e->>'quantita', '')), '{}')
    into v_chiavi
    from jsonb_array_elements(case when jsonb_typeof(new.materiali_usati) = 'array' then new.materiali_usati else '[]'::jsonb end) e
   where jsonb_typeof(e) = 'object';
  for x in select g.chiave, m.stock_item_id, m.quantity, m.unit_cost, m.warehouse_id
             from public.rapportino_materiali_regolarizzati g
             join public.warehouse_movements m on m.id = g.movimento_id
            where g.rapportino_id = new.id and (new.annullato_at is not null or not (g.chiave = any (v_chiavi))) loop
    update public.warehouse_stock set quantity = coalesce(quantity, 0) + x.quantity, updated_at = now() where id = x.stock_item_id;
    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost, rientro_commessa)
    values (x.stock_item_id, 'carico', x.quantity, 'Rientro: rapportino annullato o corretto', auth.uid(), new.order_id, new.company_id, x.warehouse_id, x.unit_cost, true);
    delete from public.rapportino_materiali_regolarizzati g where g.rapportino_id = new.id and g.chiave = x.chiave;
  end loop;
  return null;
end; $$;
revoke all on function public.rapportino_scarichi_ripristina() from public, anon, authenticated;
drop trigger if exists trg_rapportino_scarichi_ripristina on public.campo_rapportini;
create trigger trg_rapportino_scarichi_ripristina after update of annullato_at, materiali_usati on public.campo_rapportini
  for each row execute function public.rapportino_scarichi_ripristina();
