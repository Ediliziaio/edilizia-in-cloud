-- BOZZA LOCALE, NON APPLICATA: collaudo PGlite, non certificazione dello schema remoto.
-- Sostituisce il trigger di avanzamento esistente: non affiancargli un secondo motore.
-- Ordine della fixture: protocollo rapportini, poi questo file; non riapplicare
-- il protocollo generico dopo aver sostituito il motore atomico.
-- Prima della promozione verificare RLS, trigger manodopera/sottofasi e lock concorrenti
-- su PostgreSQL con più connessioni. Nessun backfill o correzione dello storico.
-- Non implementa outbox, idempotenza degli invii, file Storage o riconciliazione ore.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_rapportino_uuid_collegamento(p_value text)
returns uuid language plpgsql immutable strict security invoker set search_path = public
as $$ begin
  if p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Riferimento del rapportino non valido: verifica il collegamento' using errcode = '22023';
  end if;
  return p_value::uuid;
end $$;
revoke all on function public.campo_rapportino_uuid_collegamento(text) from public, anon, authenticated;

create or replace function public.campo_rapportino_verifica_collegamenti()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v jsonb; s jsonb; v_id uuid; v_sub uuid; v_seen uuid[] := '{}';
  v_sub_seen uuid[]; v_value text; v_number numeric;
  v_people text[] := '{}'; v_person text;
begin
  -- I PDF/metadati non modificano il contenuto: i rapporti storici incompleti
  -- restano consultabili. L'approvazione e le modifiche operative vengono verificate.
  if tg_op = 'UPDATE' then
    if (new.company_id, new.order_id, new.user_id, new.data_lavoro, new.stato, new.approvato,
        new.descrizione_lavori, new.ore_lavorate, new.ore_straordinario, new.presenze,
        new.foto_urls, new.fasi_lavorate, new.materiali_usati, new.percentuale_avanzamento,
        new.lavoro_completato, new.firma_cliente_url, new.firma_cliente_nome) is not distinct from
       (old.company_id, old.order_id, old.user_id, old.data_lavoro, old.stato, old.approvato,
        old.descrizione_lavori, old.ore_lavorate, old.ore_straordinario, old.presenze,
        old.foto_urls, old.fasi_lavorate, old.materiali_usati, old.percentuale_avanzamento,
        old.lavoro_completato, old.firma_cliente_url, old.firma_cliente_nome)
    then return new; end if;
    if old.stato = 'approvato' and (new.company_id, new.order_id, new.user_id, new.data_lavoro)
        is distinct from (old.company_id, old.order_id, old.user_id, old.data_lavoro) then
      raise exception 'Non spostare un rapporto approvato: revoca prima sulla commessa originale' using errcode = '22023';
    end if;
    if old.stato = 'approvato' and new.stato = 'approvato' then
      raise exception 'Rapportino già approvato: serve una revisione verificata, non una modifica silenziosa' using errcode = '22023';
    end if;
  end if;
  if not exists(select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id) then
    raise exception 'Commessa e azienda non corrispondono' using errcode = '42501';
  end if;
  if coalesce(new.ore_lavorate, 0) < 0 or coalesce(new.ore_straordinario, 0) < 0
     or coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0) not between 0 and 24 then
    raise exception 'Ore ordinarie e straordinario devono essere tra 0 e 24 per persona' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(new.presenze, '[]'::jsonb)) <> 'array' then
    raise exception 'Le presenze devono essere un elenco valido' using errcode = '22023';
  end if;
  for v in select value from jsonb_array_elements(coalesce(new.presenze, '[]'::jsonb)) loop
    if jsonb_typeof(v) <> 'object' or coalesce(v->>'ore', '') !~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' then
      raise exception 'Ore della presenza non valide' using errcode = '22023';
    end if;
    v_number := (v->>'ore')::numeric;
    if v_number <= 0 or v_number > 24 then raise exception 'Ore della presenza fuori intervallo' using errcode = '22023'; end if;
    if nullif(v->>'employee_id', '') is not null and nullif(v->>'subappaltatore_id', '') is not null then
      raise exception 'La presenza deve identificare una sola persona o ditta' using errcode = '22023';
    end if;
    v_person := null;
    if nullif(v->>'employee_id', '') is not null then
      v_id := public.campo_rapportino_uuid_collegamento(v->>'employee_id');
      if not exists(select 1 from public.employees e where e.id = v_id and e.company_id = new.company_id) then
        raise exception 'Il dipendente non appartiene all’azienda' using errcode = '22023';
      end if;
      v_person := 'employee:' || v_id::text;
    elsif nullif(v->>'subappaltatore_id', '') is not null then
      v_person := 'external:' || public.campo_rapportino_uuid_collegamento(v->>'subappaltatore_id')::text;
    end if;
    -- I nomi senza ID nello storico non diventano identità o costi inventati.
    if v_person is not null then
      if v_person = any(v_people) then raise exception 'Persona ripetuta nelle presenze' using errcode = '22023'; end if;
      v_people := array_append(v_people, v_person);
    end if;
  end loop;
  if jsonb_typeof(coalesce(new.fasi_lavorate, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(new.materiali_usati, '[]'::jsonb)) <> 'array' then
    raise exception 'Lavorazioni e materiali devono essere elenchi validi' using errcode = '22023';
  end if;
  if coalesce(new.percentuale_avanzamento, 0) not between 0 and 100 then
    raise exception 'Avanzamento non valido: usa una percentuale da 0 a 100' using errcode = '22023';
  end if;
  for v in select value from jsonb_array_elements(coalesce(new.fasi_lavorate, '[]'::jsonb)) loop
    if jsonb_typeof(v) <> 'object' or nullif(v->>'phase_id', '') is null then
      raise exception 'Lavorazione senza identificativo valido' using errcode = '22023';
    end if;
    v_id := public.campo_rapportino_uuid_collegamento(v->>'phase_id');
    if v_id = any(v_seen) then raise exception 'Lavorazione duplicata nel rapportino' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_id);
    if not exists(select 1 from public.order_work_phases f where f.id = v_id and f.order_id = new.order_id and f.company_id = new.company_id) then
      raise exception 'Una lavorazione non appartiene a questa commessa o azienda' using errcode = '22023';
    end if;
    -- Le voci storiche possono contenere soltanto ore, senza percentuale.
    if v ? 'percentuale' and v->'percentuale' <> 'null'::jsonb then
      v_value := v->>'percentuale';
      if v_value !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Avanzamento della lavorazione non valido' using errcode = '22023'; end if;
      v_number := v_value::numeric;
      if v_number not between 0 and 100 then raise exception 'Avanzamento della lavorazione fuori intervallo' using errcode = '22023'; end if;
    end if;
    if v ? 'sottofasi_fatte' and v->'sottofasi_fatte' <> 'null'::jsonb then
      if jsonb_typeof(v->'sottofasi_fatte') <> 'array' then raise exception 'Sottofasi non valide' using errcode = '22023'; end if;
      v_sub_seen := '{}';
      for s in select value from jsonb_array_elements(v->'sottofasi_fatte') loop
        if jsonb_typeof(s) <> 'string' then raise exception 'Sottofase senza identificativo valido' using errcode = '22023'; end if;
        v_sub := public.campo_rapportino_uuid_collegamento(s #>> '{}');
        if v_sub = any(v_sub_seen) or not exists(select 1 from public.order_work_subphases x where x.id = v_sub and x.phase_id = v_id) then
          raise exception 'Sottofase duplicata o appartenente a un’altra lavorazione' using errcode = '22023';
        end if;
        v_sub_seen := array_append(v_sub_seen, v_sub);
      end loop;
    end if;
  end loop;
  for v in select value from jsonb_array_elements(coalesce(new.materiali_usati, '[]'::jsonb)) loop
    if jsonb_typeof(v) <> 'object' or coalesce(v->>'quantita', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Quantità materiale non valida: non viene sostituita con un pezzo' using errcode = '22023';
    end if;
    if (v->>'quantita')::numeric <= 0 then raise exception 'La quantità materiale deve essere maggiore di zero' using errcode = '22023'; end if;
    -- Unità assente nei vecchi documenti resta assente, senza inventarla.
    if v ? 'unita' and (jsonb_typeof(v->'unita') <> 'string' or nullif(btrim(v->>'unita'), '') is null) then
      raise exception 'Scegli l’unità del materiale' using errcode = '22023';
    end if;
    if nullif(v->>'fase_id', '') is not null then
      v_id := public.campo_rapportino_uuid_collegamento(v->>'fase_id');
      if not exists(select 1 from public.order_work_phases f where f.id = v_id and f.order_id = new.order_id and f.company_id = new.company_id) then
        raise exception 'La fase del materiale non appartiene alla commessa' using errcode = '22023';
      end if;
    end if;
    if nullif(v->>'order_item_id', '') is not null then
      v_id := public.campo_rapportino_uuid_collegamento(v->>'order_item_id');
      if not exists(select 1 from public.order_items i where i.id = v_id and i.order_id = new.order_id) then
        raise exception 'L’articolo del materiale non appartiene alla commessa' using errcode = '22023';
      end if;
    end if;
    if nullif(v->>'stock_item_id', '') is not null then
      v_id := public.campo_rapportino_uuid_collegamento(v->>'stock_item_id');
      if not exists(select 1 from public.warehouse_stock w where w.id = v_id and w.company_id = new.company_id) then
        raise exception 'L’articolo di magazzino non appartiene all’azienda' using errcode = '22023';
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.campo_rapportino_verifica_collegamenti() from public, anon, authenticated;
drop trigger if exists trg_campo_rapportino_collegamenti on public.campo_rapportini;
create trigger trg_campo_rapportino_collegamenti before insert or update on public.campo_rapportini
for each row execute function public.campo_rapportino_verifica_collegamenti();

-- Stesso punto di ingresso del server attuale, ma nessun catch che trasformi
-- un errore in approvazione riuscita. Il rollback include gli altri trigger della transazione.
create or replace function public.fn_rapportino_applica_avanzamento()
returns trigger language plpgsql security definer set search_path = public set lock_timeout = '3s'
as $$
declare v jsonb; v_fase uuid; f public.order_work_phases%rowtype;
  v_dichiarata integer; v_nuova integer; v_stato text;
begin
  if not (new.stato = 'approvato' and old.stato is distinct from 'approvato') then return new; end if;
  if coalesce(new.lavoro_completato, false) or nullif(btrim(new.firma_cliente_url), '') is not null then return new; end if;
  -- Le spunte esistenti ricalcolano la fase dal figlio: stesso ordine di lock,
  -- figli prima dei genitori. Non introdurre il ciclo fase -> spunta -> fase.
  perform 1 from public.order_work_subphases s where s.id in (
    select public.campo_rapportino_uuid_collegamento(x #>> '{}')
    from jsonb_array_elements(coalesce(new.fasi_lavorate, '[]'::jsonb)) j
    cross join lateral jsonb_array_elements(case when jsonb_typeof(j->'sottofasi_fatte') = 'array'
      then j->'sottofasi_fatte' else '[]'::jsonb end) x
  ) order by s.id for update;
  -- Lock delle sole fasi dichiarate, in ordine stabile, prima di modificarle.
  -- Nessuna chiamata AI/HTTP o elaborazione PDF dentro la transazione.
  perform 1 from public.order_work_phases x
    where x.id in (select public.campo_rapportino_uuid_collegamento(j->>'phase_id') from jsonb_array_elements(coalesce(new.fasi_lavorate, '[]'::jsonb)) j)
    order by x.id for update;
  for v in select value from jsonb_array_elements(coalesce(new.fasi_lavorate, '[]'::jsonb)) order by value->>'phase_id' loop
    v_fase := public.campo_rapportino_uuid_collegamento(v->>'phase_id');
    select * into f from public.order_work_phases where id = v_fase and order_id = new.order_id and company_id = new.company_id;
    if not found then raise exception 'Lavorazione cambiata durante l’approvazione: aggiorna il controllo' using errcode = '22023'; end if;
    if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
      -- Anche le spunte devono essere ancora disponibili dopo il preflight.
      if exists(select 1 from jsonb_array_elements_text(v->'sottofasi_fatte') t(id)
        where not exists(select 1 from public.order_work_subphases s where s.id = t.id::uuid and s.phase_id = v_fase)) then
        raise exception 'Sottofase cambiata durante l’approvazione' using errcode = '22023';
      end if;
      update public.order_work_subphases s set fatta = true
        where s.phase_id = v_fase and not s.fatta and s.id in (select x::uuid from jsonb_array_elements_text(v->'sottofasi_fatte') t(x));
      continue;
    end if;
    continue when exists(select 1 from public.order_work_subphases s where s.phase_id = v_fase);
    v_dichiarata := round(coalesce((v->>'percentuale')::numeric, 0))::integer;
    v_nuova := greatest(coalesce(f.percentuale, 0), v_dichiarata);
    v_stato := case when v_nuova >= 100 then 'completata'
      when v_nuova > 0 and f.status <> 'completata' then 'in_corso' else f.status end;
    if v_nuova is distinct from f.percentuale or v_stato is distinct from f.status then
      update public.order_work_phases set percentuale = v_nuova, status = v_stato, updated_at = now()
        where id = v_fase and order_id = new.order_id and company_id = new.company_id;
    end if;
  end loop;
  if coalesce(new.fasi_lavorate, '[]'::jsonb) = '[]'::jsonb then
    update public.orders set percentuale_avanzamento = greatest(coalesce(percentuale_avanzamento, 0), coalesce(new.percentuale_avanzamento, 0))
      where id = new.order_id and company_id = new.company_id and coalesce(percentuale_avanzamento, 0) < coalesce(new.percentuale_avanzamento, 0);
  end if;
  return new;
end $$;
revoke all on function public.fn_rapportino_applica_avanzamento() from public, anon, authenticated;
-- Un solo trigger applicativo, compreso l'avanzamento generico della bozza protocollo.
drop trigger if exists trg_campo_rapportino_avanzamento_approvato on public.campo_rapportini;
drop trigger if exists trg_rapportino_applica_avanzamento on public.campo_rapportini;
create trigger trg_rapportino_applica_avanzamento after update of stato on public.campo_rapportini
for each row execute function public.fn_rapportino_applica_avanzamento();
commit;
