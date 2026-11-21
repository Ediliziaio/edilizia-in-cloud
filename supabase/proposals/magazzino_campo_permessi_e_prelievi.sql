-- Proposta da collaudare localmente prima del rilascio coordinato di database e app.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.staff_permissions add column if not exists magazzino_campo text
  check (magazzino_campo in ('nessuno', 'inventario', 'prelievi'));

-- Un magazzino assegnato limita la scelta, anche se all'utente è consentito prelevare.
-- Una giacenza storica senza ubicazione rimane disponibile agli utenti senza tale limite.
create or replace function private.campo_magazzino_ubicazione(p_azienda uuid, p_magazzino uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (p_magazzino is null or exists (
    select 1 from public.warehouses w where w.id = p_magazzino and w.company_id = p_azienda and w.is_active
  )) and (
    public.e_amministratore_di(p_azienda)
    or p_magazzino = any(public.get_my_warehouse_ids())
    or (
      not exists (
        select 1 from public.warehouse_assignments a
        join public.warehouses w on w.id = a.warehouse_id
        where a.user_id = auth.uid() and a.active and w.company_id = p_azienda
      ) and not exists (
        select 1 from public.staff_permissions s
        where s.user_id = auth.uid() and s.company_id = p_azienda and s.only_my_warehouse
      )
    )
  );
$$;

create or replace function private.campo_magazzino_livello(p_azienda uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  v_livello text;
begin
  if auth.uid() is null or p_azienda is null or p_azienda is distinct from public.get_my_company_id()
      or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return 'nessuno';
  end if;

  select s.magazzino_campo into v_livello from public.staff_permissions s
  where s.user_id = auth.uid() and s.company_id = p_azienda;

  if v_livello is null then
    v_livello := case
      when public.has_permission_for_company(auth.uid(), 'can_view_warehouse', p_azienda) then 'prelievi'
      when exists (
        select 1 from public.warehouses w where w.company_id = p_azienda and w.is_active
          and w.id = any(public.get_my_warehouse_ids())
      ) then 'inventario'
      else 'nessuno'
    end;
  end if;
  if v_livello = 'prelievi' and public.utente_sola_lettura(p_azienda) then
    return 'inventario';
  end if;
  return v_livello;
end;
$$;

create or replace function private.campo_magazzino_config(p_azienda uuid)
returns table(livello text, conferma boolean)
language sql stable security definer set search_path = ''
as $$
  select p.livello, coalesce(c.magazzino_prelievo_conferma, true)
  from (select private.campo_magazzino_livello(p_azienda) as livello) p
  left join public.companies c on c.id = p_azienda and p.livello = 'prelievi';
$$;

create or replace function public.campo_magazzino_config(p_azienda uuid)
returns table(livello text, conferma boolean) language sql stable set search_path = ''
as $$ select * from private.campo_magazzino_config(p_azienda); $$;

create or replace function private.campo_magazzino_inventario(p_azienda uuid, p_cerca text, p_offset int)
returns table(
  id uuid, name text, description text, internal_code text, unita_misura text,
  disponibile numeric, warehouse_id uuid, magazzino text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.campo_magazzino_livello(p_azienda) = 'nessuno' then
    raise exception 'Inventario non autorizzato' using errcode = '42501';
  end if;
  return query
    with ubicazioni as materialized (
      select w.id, w.name from public.warehouses w
      where w.company_id = p_azienda and w.is_active
        and private.campo_magazzino_ubicazione(p_azienda, w.id)
    )
    select s.id, s.name, s.description, s.internal_code, s.unita_misura,
           coalesce(s.quantity_available, s.quantity, 0), s.warehouse_id, w.name
    from public.warehouse_stock s
    left join ubicazioni w on w.id = s.warehouse_id
    where s.company_id = p_azienda
      and (w.id is not null or (s.warehouse_id is null and (select private.campo_magazzino_ubicazione(p_azienda, null))))
      and (
        nullif(btrim(p_cerca), '') is null
        or strpos(lower(concat_ws(' ', s.name, s.description, s.internal_code, s.barcode)),
                  lower(left(btrim(p_cerca), 100))) > 0
      )
    order by s.name, s.id
    limit 60 offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.campo_magazzino_inventario(p_azienda uuid, p_cerca text, p_offset int)
returns table(
  id uuid, name text, description text, internal_code text, unita_misura text,
  disponibile numeric, warehouse_id uuid, magazzino text
)
language sql stable set search_path = ''
as $$ select * from private.campo_magazzino_inventario(p_azienda, p_cerca, p_offset); $$;

create or replace function private.campo_magazzino_cantieri(p_azienda uuid)
returns table(id uuid, order_code text, description text, indirizzo_lavori text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.campo_magazzino_livello(p_azienda) <> 'prelievi' then
    raise exception 'Prelievi non autorizzati' using errcode = '42501';
  end if;
  return query
    select o.id, o.order_code, o.description, o.indirizzo_lavori
    from public.orders o
    where o.company_id = p_azienda and o.deleted_at is null
      and coalesce(lower(btrim(o.status::text)), '') not in ('completato', 'chiuso', 'annullato', 'completed', 'cancelled')
      and public.campo_lavoro_su_commessa(o.id)
    order by o.order_code, o.id;
end;
$$;

create or replace function public.campo_magazzino_cantieri(p_azienda uuid)
returns table(id uuid, order_code text, description text, indirizzo_lavori text)
language sql stable set search_path = ''
as $$ select * from private.campo_magazzino_cantieri(p_azienda); $$;

-- Le richieste in attesa non riservano la giacenza. Lo scarico la ricontrolla sotto lock,
-- anche quando avviene in ufficio, e non consuma la quantità riservata agli ordini.
create or replace function public._prelievo_campo_scarica(
  p_company uuid, p_warehouse uuid, p_order uuid, p_righe jsonb, p_uid uuid, p_note text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_riga jsonb;
  v_stock public.warehouse_stock;
  v_qta numeric;
begin
  set local lock_timeout = '3s';
  for v_riga in select value from jsonb_array_elements(p_righe) order by value->>'stock_item_id' loop
    v_qta := (v_riga->>'quantita')::numeric;
    if v_qta is null or v_qta <= 0 or v_qta = 'NaN'::numeric then
      raise exception 'Indica una quantità positiva per ogni articolo' using errcode = '22023';
    end if;
    select * into v_stock from public.warehouse_stock s
    where s.id = (v_riga->>'stock_item_id')::uuid and s.company_id = p_company for update;
    if not found then raise exception 'Articolo non trovato in magazzino'; end if;
    if (p_warehouse is not null and v_stock.warehouse_id is distinct from p_warehouse)
      or (v_riga ? 'warehouse_id' and v_stock.warehouse_id is distinct from (v_riga->>'warehouse_id')::uuid) then
      raise exception 'L''articolo % è stato spostato in un altro magazzino', v_stock.name;
    end if;
    if coalesce(v_stock.quantity_available, v_stock.quantity, 0) < v_qta then
      raise exception 'Giacenza insufficiente per %. Disponibili %, richiesti %',
        v_stock.name, coalesce(v_stock.quantity_available, v_stock.quantity, 0), v_qta;
    end if;
    update public.warehouse_stock set quantity = quantity - v_qta, updated_at = now() where id = v_stock.id;
    insert into public.warehouse_movements(stock_item_id, movement_type, quantity, performed_by, company_id, warehouse_id, order_id, notes)
      values (v_stock.id, 'scarico', v_qta, p_uid, p_company, v_stock.warehouse_id, p_order,
              coalesce(nullif(p_note, ''), 'Prelievo da cantiere'));
  end loop;
end;
$$;

create or replace function private.campo_magazzino_preleva(
  p_azienda uuid, p_cantiere uuid, p_magazzino uuid, p_righe jsonb, p_note text, p_richiesta_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(p_richiesta_id, gen_random_uuid());
  v_stato text;
  v_righe jsonb;
  v_numero int;
  v_magazzini int;
  v_magazzino uuid;
  v_note text := nullif(btrim(p_note), '');
  v_configurato boolean;
begin
  set local lock_timeout = '3s';
  if private.campo_magazzino_livello(p_azienda) <> 'prelievi' then
    raise exception 'Prelievi non autorizzati' using errcode = '42501';
  end if;

  if p_richiesta_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  end if;
  -- Il retry di una richiesta già registrata restituisce l'esito salvato.
  select p.stato into v_stato from public.prelievi_campo p
  where p.id = v_id and p.company_id = p_azienda and p.operaio_id = v_uid;
  if found then return jsonb_build_object('id', v_id, 'stato', v_stato); end if;

  select exists (
    select 1 from public.staff_permissions s where s.user_id = v_uid and s.company_id = p_azienda and s.magazzino_campo is not null
  ) into v_configurato;
  if p_richiesta_id is not null or v_configurato or p_cantiere is not null then
    if not exists (
      select 1 from public.orders o where o.id = p_cantiere and o.company_id = p_azienda and o.deleted_at is null
        and coalesce(lower(btrim(o.status::text)), '') not in ('completato', 'chiuso', 'annullato', 'completed', 'cancelled')
        and (public.campo_lavoro_su_commessa(o.id) or (p_richiesta_id is null and not v_configurato))
    ) then
      raise exception 'Scegli un cantiere aperto che ti è stato assegnato' using errcode = '42501';
    end if;
  end if;
  if jsonb_typeof(p_righe) is distinct from 'array' then
    raise exception 'Aggiungi almeno un articolo' using errcode = '22023';
  end if;
  if jsonb_array_length(p_righe) not between 1 and 100 then
    raise exception 'Aggiungi da 1 a 100 articoli per prelievo' using errcode = '22023';
  end if;

  -- Nome, unità, ubicazione e disponibilità provengono dalle schede reali.
  -- Il conteggio finale respinge righe duplicate e righe non valide.
  with richieste as (
    select (r->>'stock_item_id')::uuid as id, sum((r->>'quantita')::numeric) as qta
    from jsonb_array_elements(p_righe) r
    where case when jsonb_typeof(r->'quantita') = 'number' then (r->>'quantita')::numeric > 0 else false end
    group by (r->>'stock_item_id')::uuid
  )
  select jsonb_agg(
           jsonb_build_object('stock_item_id', s.id, 'name', s.name, 'unita', s.unita_misura,
                              'quantita', r.qta, 'warehouse_id', s.warehouse_id) order by s.id
         ), count(*), count(distinct coalesce(s.warehouse_id::text, '')), min(s.warehouse_id::text)::uuid
    into v_righe, v_numero, v_magazzini, v_magazzino
    from richieste r
    join public.warehouse_stock s on s.id = r.id and s.company_id = p_azienda
    where private.campo_magazzino_ubicazione(p_azienda, s.warehouse_id)
      and (p_richiesta_id is null and p_magazzino is null or s.warehouse_id is not distinct from p_magazzino)
      and r.qta <= coalesce(s.quantity_available, s.quantity, 0);

  if v_numero <> jsonb_array_length(p_righe) then
    raise exception 'Controlla gli articoli, il magazzino e le quantità disponibili' using errcode = '22023';
  end if;

  select case when c.magazzino_prelievo_conferma is false then 'consegnato' else 'richiesto' end
    into v_stato from public.companies c where c.id = p_azienda;
  insert into public.prelievi_campo(id, company_id, warehouse_id, order_id, operaio_id, righe, note, stato, approvato_da, approvato_at)
  values (v_id, p_azienda, case when v_magazzini = 1 then v_magazzino end, p_cantiere, v_uid, v_righe, v_note, v_stato,
          case when v_stato = 'consegnato' then v_uid end, case when v_stato = 'consegnato' then now() end)
  on conflict (id) do nothing;
  if not found then
    select p.stato into v_stato from public.prelievi_campo p
    where p.id = v_id and p.company_id = p_azienda and p.operaio_id = v_uid;
    if not found then raise exception 'Prelievo non autorizzato' using errcode = '42501'; end if;
  elsif v_stato = 'consegnato' then
    perform public._prelievo_campo_scarica(p_azienda, p_magazzino, p_cantiere, v_righe, v_uid, v_note);
  end if;
  return jsonb_build_object('id', v_id, 'stato', v_stato);
end;
$$;

create or replace function public.campo_magazzino_preleva(
  p_azienda uuid, p_cantiere uuid, p_magazzino uuid, p_righe jsonb, p_note text, p_richiesta_id uuid
)
returns jsonb language plpgsql set search_path = ''
as $$
begin
  if p_richiesta_id is null then raise exception 'Identificativo prelievo mancante' using errcode = '22023'; end if;
  return private.campo_magazzino_preleva(p_azienda, p_cantiere, p_magazzino, p_righe, p_note, p_richiesta_id);
end;
$$;

-- Anche i client già installati passano dalle stesse verifiche.
create or replace function public.prelievo_campo_registra(
  p_order_id uuid, p_warehouse_id uuid, p_righe jsonb, p_note text default null
)
returns jsonb language sql set search_path = ''
as $$
  select private.campo_magazzino_preleva(public.get_my_company_id(), p_order_id, p_warehouse_id, p_righe, p_note, null);
$$;

create or replace function private.campo_magazzino_ddt(p_prelievo_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_azienda uuid := public.get_my_company_id();
begin
  if private.campo_magazzino_livello(v_azienda) <> 'prelievi' then
    raise exception 'Richiesta DDT non autorizzata' using errcode = '42501';
  end if;
  update public.prelievi_campo p set ddt_richiesto = true
   where p.id = p_prelievo_id and p.company_id = v_azienda and p.stato = 'consegnato'
     and (p.operaio_id = auth.uid() or public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_azienda));
  if not found then raise exception 'Prelievo consegnato non trovato' using errcode = '42501'; end if;
end;
$$;

create or replace function public.prelievo_campo_richiedi_ddt(p_prelievo_id uuid)
returns void language sql set search_path = ''
as $$ select private.campo_magazzino_ddt(p_prelievo_id); $$;

-- L'ufficio usa la stessa azienda selezionata dalla schermata Magazzino.
create or replace function private.campo_magazzino_decidi(p_prelievo_id uuid, p_approva boolean, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_azienda uuid := public.get_my_company_id();
  v_uid uuid := auth.uid();
  v_prelievo public.prelievi_campo;
  v_stato text := case when p_approva then 'consegnato' else 'rifiutato' end;
begin
  if v_uid is null or v_azienda is null or public.utente_bloccato() or public.utente_sola_lettura(v_azienda)
     or not public.has_permission_for_company(v_uid, 'can_edit_warehouse', v_azienda) then
    raise exception 'Gestione dei prelievi non autorizzata' using errcode = '42501';
  end if;
  select * into v_prelievo from public.prelievi_campo
    where id = p_prelievo_id and company_id = v_azienda for update;
  if not found or v_prelievo.stato <> 'richiesto' then raise exception 'Prelievo non trovato o già gestito'; end if;

  if p_approva then
    perform public._prelievo_campo_scarica(v_azienda, v_prelievo.warehouse_id, v_prelievo.order_id,
                                            v_prelievo.righe, v_prelievo.operaio_id, v_prelievo.note);
  end if;
  update public.prelievi_campo
  set stato = v_stato, approvato_da = v_uid, approvato_at = now(),
      motivo_rifiuto = case when not p_approva then nullif(btrim(p_motivo), '') end
  where id = v_prelievo.id;
  return jsonb_build_object('id', v_prelievo.id, 'stato', v_stato);
end;
$$;

create or replace function public.prelievo_campo_approva(p_prelievo_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.campo_magazzino_decidi(p_prelievo_id, true, null); $$;

create or replace function public.prelievo_campo_rifiuta(p_prelievo_id uuid, p_motivo text default null)
returns jsonb language sql set search_path = ''
as $$ select private.campo_magazzino_decidi(p_prelievo_id, false, p_motivo); $$;

revoke all on function private.campo_magazzino_decidi(uuid, boolean, text), public.prelievo_campo_approva(uuid),
  public.prelievo_campo_rifiuta(uuid, text) from public, anon;
grant execute on function private.campo_magazzino_decidi(uuid, boolean, text), public.prelievo_campo_approva(uuid),
  public.prelievo_campo_rifiuta(uuid, text) to authenticated, service_role;

revoke all on function private.campo_magazzino_ubicazione(uuid, uuid), private.campo_magazzino_livello(uuid) from public, anon, authenticated;
revoke all on function public._prelievo_campo_scarica(uuid, uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;

revoke all on function private.campo_magazzino_config(uuid), public.campo_magazzino_config(uuid),
  private.campo_magazzino_inventario(uuid, text, int), public.campo_magazzino_inventario(uuid, text, int),
  private.campo_magazzino_cantieri(uuid), public.campo_magazzino_cantieri(uuid),
  private.campo_magazzino_preleva(uuid, uuid, uuid, jsonb, text, uuid), public.campo_magazzino_preleva(uuid, uuid, uuid, jsonb, text, uuid),
  public.prelievo_campo_registra(uuid, uuid, jsonb, text), private.campo_magazzino_ddt(uuid),
  public.prelievo_campo_richiedi_ddt(uuid) from public, anon;

grant execute on function private.campo_magazzino_config(uuid), public.campo_magazzino_config(uuid),
  private.campo_magazzino_inventario(uuid, text, int), public.campo_magazzino_inventario(uuid, text, int),
  private.campo_magazzino_cantieri(uuid), public.campo_magazzino_cantieri(uuid),
  private.campo_magazzino_preleva(uuid, uuid, uuid, jsonb, text, uuid), public.campo_magazzino_preleva(uuid, uuid, uuid, jsonb, text, uuid),
  public.prelievo_campo_registra(uuid, uuid, jsonb, text), private.campo_magazzino_ddt(uuid),
  public.prelievo_campo_richiedi_ddt(uuid) to authenticated, service_role;

-- Le registrazioni passano dalle RPC. L'operaio legge solo i propri prelievi.
drop policy if exists prelievi_campo_company on public.prelievi_campo;
drop policy if exists prelievi_campo_lettura on public.prelievi_campo;
create policy prelievi_campo_lettura on public.prelievi_campo for select to authenticated
using (company_id = (select public.get_my_company_id())
  and (operaio_id = (select auth.uid())
    or public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id)));

-- Gli account operai configurati usano la proiezione dell'inventario senza prezzi.
drop policy if exists magazzino_campo_accesso_operai on public.warehouse_stock;
create policy magazzino_campo_accesso_operai on public.warehouse_stock as restrictive for all to authenticated
using (not (select public.has_role(auth.uid(), 'employee'::public.app_role))
  or not exists (
    select 1 from public.staff_permissions s
    where s.user_id = (select auth.uid()) and s.company_id = warehouse_stock.company_id and s.magazzino_campo is not null
  )
  or public.e_amministratore_di(company_id));

notify pgrst, 'reload schema';
