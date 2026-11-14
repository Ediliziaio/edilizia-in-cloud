-- 20290322135000_generale_dati_operazione.sql
--
-- I dati di una commessa generale (piano 2026-11-14-macro-commessa-per-tipologia, lotto T1).
-- Alla creazione si chiedevano solo nome, cliente e valore, e dopo non c'era un posto per il resto:
-- il cliente non si poteva più cambiare, indirizzo e date non esistevano (0 generali su 18 con
-- l'inizio lavori), e i dati propri di ogni tipologia (le figure di un appalto, il titolo edilizio
-- di uno sviluppo, l'immobile acquistato di una compravendita) non avevano un campo.
--
-- 1. commesse_generali.dati (jsonb): i dati per tipologia, a sezioni con chiavi conosciute.
-- 2. commessa_generale_dati_salva(generale, dati): cliente, indirizzo e date vanno sulla riga di
--    orders della generale (come per ogni commessa: liste, calendario e ricerche li leggono già);
--    le sezioni in commesse_generali.dati. Solo chi modifica le commesse.
-- 3. commessa_generale_riepilogo restituisce anche indirizzo, inizio, fine e dati (senza prezzi
--    a chi non vede gli importi).

alter table public.commesse_generali add column if not exists dati jsonb not null default '{}'::jsonb;

comment on column public.commesse_generali.dati is
  'Dati per tipologia (20290322135000): responsabile, note, appalto{…}, area{…}, titolo{…}, tecnici{…}, immobile{…}, ristrutturazione{…}, rivendita{…}. Si scrive con commessa_generale_dati_salva.';

create or replace function public.commessa_generale_dati_salva(p_generale_id uuid, p_dati jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_chiave text;
  v_valore jsonb;
  v_campo record;
  v_cliente_id uuid;
  v_cliente text;
  v_inizio date;
  v_fine date;
  v_sezioni constant text[] := array['appalto', 'area', 'titolo', 'tecnici', 'immobile', 'ristrutturazione', 'rivendita'];
  v_testi constant text[] := array['responsabile', 'note'];
  v_nuovi jsonb;
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato()
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g join public.orders o on o.id = g.order_id
                  where g.order_id = p_generale_id and o.deleted_at is null) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_dati) is distinct from 'object' then
    raise exception 'Dati non leggibili.' using errcode = '22023';
  end if;
  if pg_column_size(p_dati) > 16000 then
    raise exception 'Troppi dati in una volta.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  -- Cliente, indirizzo e date: sulla riga della generale in orders.
  if p_dati ? 'cliente_id' then
    v_cliente_id := nullif(p_dati->>'cliente_id', '')::uuid;
    if v_cliente_id is not null then
      select coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''))
        into v_cliente
        from public.profiles p
       where p.id = v_cliente_id and p.company_id = v_azienda and p.deleted_at is null;
      if not found then
        raise exception 'Cliente non trovato.' using errcode = 'P0002';
      end if;
    end if;
    update public.orders set customer_id = v_cliente_id, client_name = v_cliente, updated_at = now() where id = p_generale_id;
  end if;
  if p_dati ? 'indirizzo' then
    update public.orders set work_address = left(nullif(btrim(p_dati->>'indirizzo'), ''), 300), updated_at = now() where id = p_generale_id;
  end if;
  if p_dati ? 'inizio' or p_dati ? 'fine' then
    select o.work_start_date, o.work_end_date into v_inizio, v_fine from public.orders o where o.id = p_generale_id;
    if p_dati ? 'inizio' then v_inizio := nullif(p_dati->>'inizio', '')::date; end if;
    if p_dati ? 'fine' then v_fine := nullif(p_dati->>'fine', '')::date; end if;
    if v_inizio is not null and v_fine is not null and v_fine < v_inizio then
      raise exception 'La fine dei lavori viene prima dell''inizio.' using errcode = '22023';
    end if;
    update public.orders set work_start_date = v_inizio, work_end_date = v_fine, updated_at = now() where id = p_generale_id;
  end if;

  -- Le sezioni: chiavi conosciute, valori semplici. null toglie la sezione.
  select g.dati into v_nuovi from public.commesse_generali g where g.order_id = p_generale_id;
  for v_chiave, v_valore in select key, value from jsonb_each(p_dati) loop
    continue when v_chiave in ('cliente_id', 'indirizzo', 'inizio', 'fine');
    if v_chiave = any (v_testi) then
      if jsonb_typeof(v_valore) not in ('string', 'null') then
        raise exception 'Il campo % va scritto come testo.', v_chiave using errcode = '22023';
      end if;
      v_nuovi := case when jsonb_typeof(v_valore) = 'null' or btrim(v_valore #>> '{}') = '' then v_nuovi - v_chiave
                      else jsonb_set(v_nuovi, array[v_chiave], to_jsonb(left(btrim(v_valore #>> '{}'), 2000))) end;
    elsif v_chiave = any (v_sezioni) then
      if jsonb_typeof(v_valore) = 'null' then
        v_nuovi := v_nuovi - v_chiave;
        continue;
      end if;
      if jsonb_typeof(v_valore) <> 'object' then
        raise exception 'La sezione % non è leggibile.', v_chiave using errcode = '22023';
      end if;
      for v_campo in select key, value from jsonb_each(v_valore) loop
        if jsonb_typeof(v_campo.value) not in ('string', 'number', 'boolean', 'null') then
          raise exception 'Il campo %.% non è un valore semplice.', v_chiave, v_campo.key using errcode = '22023';
        end if;
      end loop;
      -- Chi non vede gli importi non li tocca: si tengono quelli che c'erano.
      if not v_importi then
        v_valore := (v_valore - 'prezzo' - 'prezzo_obiettivo')
                    || coalesce(jsonb_strip_nulls(jsonb_build_object(
                         'prezzo', v_nuovi->v_chiave->'prezzo',
                         'prezzo_obiettivo', v_nuovi->v_chiave->'prezzo_obiettivo')), '{}'::jsonb);
      end if;
      v_nuovi := jsonb_set(v_nuovi, array[v_chiave], jsonb_strip_nulls(v_valore));
    else
      raise exception 'Campo sconosciuto: %.', v_chiave using errcode = '22023';
    end if;
  end loop;
  update public.commesse_generali set dati = v_nuovi, updated_at = now() where order_id = p_generale_id;
end;
$$;

comment on function public.commessa_generale_dati_salva(uuid, jsonb) is
  'Salva i dati di una commessa generale: cliente, indirizzo e date su orders, le sezioni per tipologia in commesse_generali.dati. 20290322135000.';

revoke all on function public.commessa_generale_dati_salva(uuid, jsonb) from public, anon;
grant execute on function public.commessa_generale_dati_salva(uuid, jsonb) to authenticated, service_role;

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
  vecchio constant text := '''valore'', case when v_importi then g.valore_riferimento end)';
  nuovo constant text := '''valore'', case when v_importi then g.valore_riferimento end,
           ''indirizzo'', coalesce(nullif(btrim(o.work_address), ''''), nullif(btrim(o.indirizzo_lavori), '''')),
           ''inizio'', o.work_start_date, ''fine'', o.work_end_date,
           ''dati'', case when v_importi then g.dati
                        else g.dati #- ''{immobile,prezzo}'' #- ''{rivendita,prezzo_obiettivo}'' end)';
begin
  if position('''dati'', case when v_importi' in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'commessa_generale_riepilogo: non trovo i dati della generale';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
