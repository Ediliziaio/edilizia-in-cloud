-- Dal sopralluogo alle misure definitive sulla riga (08/11/2026), piano articoli su misura, fase 4.
--
-- Tre valori che non si sovrascrivono: provvisoria, rilevata, da ordinare.
-- Un rilievo e un componente danno una riga sola, anche con doppio clic o due schede: lo
-- garantisce l'indice unico. Le parti create dividendo una riga fra le fasi (diviso_da)
-- ne restano fuori: portano le stesse misure della riga da cui nascono, e ricevono i
-- suoi aggiornamenti.
-- Tutte le scritture passano da qui e lasciano traccia in order_item_misure_storico.
--
-- Solo colonne facoltative, una tabella nuova e funzioni: nessuna riga esistente viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_items
  add column if not exists diviso_da uuid,
  add column if not exists misura_forma text,
  add column if not exists gioco_posa_mm numeric,
  add column if not exists costo_stimato_iniziale numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_misura_forma_check') then
    alter table public.order_items add constraint order_items_misura_forma_check
      check (misura_forma is null or misura_forma in ('LxH', 'LxPxH', 'mq', 'ml', 'm', 'pz'));
  end if;
end $$;

comment on column public.order_items.diviso_da is 'Riga da cui nasce questa parte, quando un articolo è diviso fra le fasi. Le parti seguono le misure della riga di partenza.';
comment on column public.order_items.misura_forma is 'Come si misura: LxH, LxPxH, mq, ml, m, pz.';
comment on column public.order_items.gioco_posa_mm is 'Gioco di posa tolto dalla misura rilevata quando è stata confermata. Vuoto o zero = nessuno.';
comment on column public.order_items.costo_stimato_iniziale is 'Il costo stimato prima che lo scarto di misura lo ricalcolasse: la stima iniziale non si perde.';

create unique index if not exists order_items_rilievo_componente_unico
  on public.order_items (survey_element_id, coalesce(componente, ''))
  where survey_element_id is not null and diviso_da is null;

create index if not exists order_items_diviso_da_idx
  on public.order_items (diviso_da) where diviso_da is not null;

alter table public.company_fasi_settings
  add column if not exists misure_gioco_posa_mm numeric not null default 0,
  add column if not exists misure_soglia_scarto_mm numeric not null default 5;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_fasi_misure_valori_check') then
    alter table public.company_fasi_settings add constraint company_fasi_misure_valori_check
      check (misure_gioco_posa_mm >= 0 and misure_gioco_posa_mm <= 200
         and misure_soglia_scarto_mm >= 0 and misure_soglia_scarto_mm <= 500);
  end if;
end $$;

comment on column public.company_fasi_settings.misure_gioco_posa_mm is 'Quanto togliere da larghezza e altezza quando la misura rilevata è del foro. Zero = nessun gioco.';
comment on column public.company_fasi_settings.misure_soglia_scarto_mm is 'Oltre questa differenza dalla misura provvisoria lo scarto si evidenzia e il costo stimato si ricalcola.';

create table if not exists public.order_item_misure_storico (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  evento text not null check (evento in ('rilevato', 'sostituito', 'tenuto_precedente', 'confermato', 'modificato', 'sfrido')),
  survey_id uuid references public.surveys(id) on delete set null,
  survey_element_id uuid references public.survey_elements(id) on delete set null,
  misure_prima jsonb,
  misure_dopo jsonb,
  stato_prima text,
  stato_dopo text,
  dati jsonb,
  creato_da uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists order_item_misure_storico_riga_idx
  on public.order_item_misure_storico (order_item_id, created_at desc);
create index if not exists order_item_misure_storico_azienda_idx
  on public.order_item_misure_storico (company_id);
create index if not exists order_item_misure_storico_ordine_idx
  on public.order_item_misure_storico (order_id);

alter table public.order_item_misure_storico enable row level security;
revoke all on public.order_item_misure_storico from public, anon, authenticated;
grant select on public.order_item_misure_storico to authenticated;
grant all on public.order_item_misure_storico to service_role;
drop policy if exists misure_storico_lettura on public.order_item_misure_storico;
create policy misure_storico_lettura on public.order_item_misure_storico
  for select to authenticated
  using (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno());

-- ── Calcoli ─────────────────────────────────────────────────────────────────

-- Solo le chiavi note, solo numeri positivi.
create or replace function public.misure_normalizza(p jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(k, trim_scale(round(v::numeric, 4))), '{}'::jsonb)
    from jsonb_each_text(coalesce(p, '{}'::jsonb)) e(k, v)
   where k in ('larghezza_mm', 'altezza_mm', 'profondita_mm', 'quantita')
     and v ~ '^[0-9]+(\.[0-9]+)?$'
     and v::numeric > 0;
$function$;

-- Il valore provvisorio di un asse: nei dati esistono sia larghezza sia larghezza_mm.
create or replace function public.misure_valore(p jsonb, k text)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when x ~ '^-?[0-9]+(\.[0-9]+)?$' then x::numeric end
    from (select coalesce(
      p->>k,
      p->>regexp_replace(k, '_mm$', ''),
      case when k = 'quantita' then coalesce(p->>'mq', p->>'ml') end
    ) as x) s;
$function$;

create or replace function public.misure_scarto(p_prima jsonb, p_dopo jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'prev', public.misure_valore(p_prima, k),
           'def', v::numeric,
           'delta', trim_scale(round(v::numeric - public.misure_valore(p_prima, k), 4))
         )), '{}'::jsonb)
    from jsonb_each_text(coalesce(p_dopo, '{}'::jsonb)) e(k, v);
$function$;

-- La base del costo per una misura a dimensioni: L × H, oppure L × P se la profondità c'è.
create or replace function public.misure_superficie(p jsonb)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select public.misure_valore(p, 'larghezza_mm')
       * coalesce(public.misure_valore(p, 'profondita_mm'), public.misure_valore(p, 'altezza_mm'));
$function$;

-- ── Chi può fare cosa ───────────────────────────────────────────────────────

create or replace function public.sopralluogo_puo_lavorare(p_survey uuid, p_scrive boolean)
 returns boolean
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_azienda uuid;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return false;
  end if;
  select s.company_id into v_azienda from public.surveys s where s.id = p_survey and s.deleted_at is null;
  if v_azienda is null then
    return false;
  end if;
  if not (v_azienda = public.get_my_company_id() or public.is_survey_assignee(p_survey) or public.is_super_admin()) then
    return false;
  end if;
  if survey_private.field_actor() and not survey_private.field_allowed(p_survey, p_scrive) then
    return false;
  end if;
  return not (p_scrive and public.utente_sola_lettura(v_azienda));
end;
$function$;

-- ── Scrittura di una riga ───────────────────────────────────────────────────

-- Solo da dentro: chi chiama ha già controllato i permessi e tiene il blocco.
create or replace function public.misure_riga_scrivi(
  p_item uuid, p_nuove jsonb, p_tipo text, p_forma text, p_unita text,
  p_survey uuid, p_elemento uuid, p_componente text, p_evento text
)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.order_items;
  v_azienda uuid;
  v_base jsonb;
  v_cambiate boolean;
  v_stato text;
  v_scarto jsonb;
begin
  select * into r from public.order_items where id = p_item for update;
  select o.company_id into v_azienda from public.orders o where o.id = r.order_id;

  v_cambiate := r.misure_rilevate is distinct from p_nuove;
  if not v_cambiate
     and r.survey_id is not distinct from coalesce(p_survey, r.survey_id)
     and r.survey_element_id is not distinct from coalesce(p_elemento, r.survey_element_id)
     and r.componente is not distinct from coalesce(p_componente, r.componente)
     and r.misura_tipo is not distinct from coalesce(p_tipo, r.misura_tipo)
     and r.misura_forma is not distinct from coalesce(p_forma, r.misura_forma)
     and r.measure_status in ('rilevato', 'confermato') then
    return false;
  end if;

  v_base := coalesce(r.misure_preventivo,
    case when p_nuove ? 'quantita' then jsonb_build_object('quantita', coalesce(r.quantita_netta, r.quantity)) end);
  v_scarto := public.misure_scarto(v_base, p_nuove);
  -- Una misura cambiata va riconfermata; una uguale resta com'era.
  v_stato := case when v_cambiate or r.measure_status is distinct from 'confermato' then 'rilevato' else 'confermato' end;

  update public.order_items oi
     set misure_rilevate = p_nuove,
         measure_variance = v_scarto,
         measure_status = v_stato,
         misure_da_ordinare = case when v_stato = 'rilevato' then null else oi.misure_da_ordinare end,
         gioco_posa_mm = case when v_stato = 'rilevato' then null else oi.gioco_posa_mm end,
         survey_id = coalesce(p_survey, oi.survey_id),
         survey_element_id = coalesce(p_elemento, oi.survey_element_id),
         componente = coalesce(p_componente, oi.componente),
         misura_tipo = coalesce(p_tipo, oi.misura_tipo),
         misura_forma = coalesce(p_forma, oi.misura_forma),
         unita_misura = coalesce(oi.unita_misura, p_unita)
   where oi.id = p_item or oi.diviso_da = p_item;

  if v_cambiate or p_evento = 'sostituito' or r.measure_status is distinct from v_stato then
    insert into public.order_item_misure_storico
      (company_id, order_id, order_item_id, evento, survey_id, survey_element_id,
       misure_prima, misure_dopo, stato_prima, stato_dopo)
    values
      (v_azienda, r.order_id, p_item, p_evento, coalesce(p_survey, r.survey_id), coalesce(p_elemento, r.survey_element_id),
       r.misure_rilevate, p_nuove, r.measure_status, v_stato);
  end if;
  return true;
end;
$function$;

-- ── L'elenco per il tecnico: niente cifre ───────────────────────────────────

create or replace function public.sopralluogo_posizioni_commessa(p_survey uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  s public.surveys;
begin
  if not public.sopralluogo_puo_lavorare(p_survey, false) then
    raise exception 'Non puoi vedere questo sopralluogo' using errcode = '42501';
  end if;
  select * into s from public.surveys where id = p_survey;
  return jsonb_build_object(
    'order_id', s.order_id,
    'ruolo_misure', s.ruolo_misure,
    'gioco_posa_mm', coalesce((select f.misure_gioco_posa_mm from public.company_fasi_settings f where f.company_id = s.company_id), 0),
    'soglia_scarto_mm', coalesce((select f.misure_soglia_scarto_mm from public.company_fasi_settings f where f.company_id = s.company_id), 5),
    'righe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'name', oi.name, 'riferimento', oi.riferimento, 'componente', oi.componente,
        'quantity', oi.quantity, 'unita_misura', oi.unita_misura,
        'misure_preventivo', oi.misure_preventivo, 'misure_rilevate', oi.misure_rilevate,
        'measure_status', oi.measure_status, 'misura_tipo', oi.misura_tipo, 'misura_forma', oi.misura_forma,
        'survey_id', oi.survey_id, 'survey_element_id', oi.survey_element_id, 'gruppo_id', oi.gruppo_id
      ) order by oi.position, oi.created_at)
      from public.order_items oi
      where oi.order_id = s.order_id
        and oi.measure_status is not null
        and oi.diviso_da is null
    ), '[]'::jsonb)
  );
end;
$function$;

-- ── Il rilievo sulle righe: elenco, abbinamento, creazione, secondo sopralluogo ──
--
-- p_voci = [{ order_item_id?, survey_element_id?, componente?, misure, misura_tipo?, misura_forma?,
--             unita?, scelta?: 'tieni_nuovo'|'tieni_precedente',
--             crea?: { name, quantity?, unita_misura? },
--             elemento?: { area, element_type, element_label?, values, quantity? } }]
-- Il blocco sul sopralluogo mette in fila doppio clic e due schede.
create or replace function public.sopralluogo_applica_misure(p_survey uuid, p_voci jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s public.surveys;
  v jsonb;
  r public.order_items;
  v_item uuid;
  v_elemento uuid;
  v_area uuid;
  v_comp text;
  v_nuove jsonb;
  v_scelta text;
  v_evento text;
  v_tipo_elemento text;
  v_esistente uuid;
  v_quantita numeric;
  v_applicate int := 0;
  v_create int := 0;
  v_invariate int := 0;
  v_tenute int := 0;
  v_ordini uuid[] := '{}';
begin
  if p_voci is null or jsonb_typeof(p_voci) <> 'array' or jsonb_array_length(p_voci) = 0 then
    raise exception 'Nessuna misura da salvare' using errcode = '22023';
  end if;
  if jsonb_array_length(p_voci) > 500 then
    raise exception 'Troppe misure in una volta' using errcode = '22023';
  end if;
  if not public.sopralluogo_puo_lavorare(p_survey, true) then
    raise exception 'Non puoi modificare questo sopralluogo' using errcode = '42501';
  end if;
  select * into s from public.surveys where id = p_survey for update;
  if s.order_id is null then
    raise exception 'Collega prima il sopralluogo a una commessa' using errcode = '22023';
  end if;

  perform set_config('app.materiali_sistema', 'on', true);

  for v in select value from jsonb_array_elements(p_voci) loop
    v_item := nullif(v->>'order_item_id', '')::uuid;
    v_elemento := nullif(v->>'survey_element_id', '')::uuid;
    v_comp := nullif(btrim(coalesce(v->>'componente', '')), '');
    v_scelta := v->>'scelta';
    v_nuove := public.misure_normalizza(v->'misure');
    if v_nuove = '{}'::jsonb then
      raise exception 'Scrivi almeno una misura valida' using errcode = '22023';
    end if;

    -- Dall'elenco del tecnico: l'elemento del rilievo si crea o si aggiorna qui.
    if v_elemento is null and v ? 'elemento' then
      if v_item is null then
        raise exception 'Manca la posizione della commessa' using errcode = '22023';
      end if;
      select oi.survey_element_id into v_elemento from public.order_items oi
       where oi.id = v_item and oi.survey_id = p_survey and oi.order_id = s.order_id;
      if v_elemento is not null then
        update public.survey_elements e
           set "values" = e."values" || coalesce(v->'elemento'->'values', '{}'::jsonb)
         where e.id = v_elemento and e.survey_id = p_survey
           and not (e."values" @> coalesce(v->'elemento'->'values', '{}'::jsonb));
      else
        select a.id into v_area from public.survey_areas a
         where a.survey_id = p_survey and a.name = coalesce(v->'elemento'->>'area', 'Posizioni della commessa')
         order by a.position limit 1;
        if v_area is null then
          insert into public.survey_areas (survey_id, name, position)
          values (p_survey, coalesce(v->'elemento'->>'area', 'Posizioni della commessa'),
                  coalesce((select max(a.position) + 1 from public.survey_areas a where a.survey_id = p_survey), 0))
          returning id into v_area;
        end if;
        insert into public.survey_elements (survey_id, area_id, element_type, element_label, position, "values", quantity)
        values (p_survey, v_area, v->'elemento'->>'element_type', v->'elemento'->>'element_label',
                coalesce((select max(e.position) + 1 from public.survey_elements e where e.area_id = v_area), 0),
                coalesce(v->'elemento'->'values', '{}'::jsonb),
                greatest(coalesce((v->'elemento'->>'quantity')::int, 1), 1))
        returning id into v_elemento;
      end if;
    end if;

    if v_elemento is null then
      raise exception 'Manca l''elemento del rilievo' using errcode = '22023';
    end if;
    select e.element_type into v_tipo_elemento from public.survey_elements e
     where e.id = v_elemento and e.survey_id = p_survey;
    if v_tipo_elemento is null then
      raise exception 'Elemento estraneo al sopralluogo' using errcode = '22023';
    end if;

    -- Rilievo importato di nuovo: aggiorna, non aggiunge.
    select oi.id into v_esistente from public.order_items oi
     where oi.survey_element_id = v_elemento
       and coalesce(oi.componente, '') = coalesce(v_comp, '')
       and oi.diviso_da is null
     limit 1;

    if v_item is null then
      v_item := v_esistente;
    elsif v_esistente is not null and v_esistente <> v_item then
      raise exception 'Questo rilievo è già collegato a un''altra riga' using errcode = '23505';
    end if;

    if v_item is null then
      if v->'crea' is null or nullif(btrim(coalesce(v->'crea'->>'name', '')), '') is null then
        raise exception 'Scegli la riga da collegare o approva la creazione' using errcode = '22023';
      end if;
      if not public.materiali_puo('can_edit_orders', s.company_id) then
        raise exception 'Per creare le righe serve il permesso di modificare la commessa' using errcode = '42501';
      end if;
      v_quantita := coalesce(nullif(v_nuove->>'quantita', '')::numeric, nullif(v->'crea'->>'quantity', '')::numeric, 1);
      insert into public.order_items
        (order_id, name, quantity, quantita_netta, unita_misura, natura_riga, position, riferimento, gruppo_id,
         purchase_price, unit_price)
      values
        (s.order_id, left(v->'crea'->>'name', 500), v_quantita,
         case when v_nuove ? 'quantita' then v_quantita end,
         nullif(v->'crea'->>'unita_misura', ''), 'materiale',
         coalesce((select max(oi.position) + 1 from public.order_items oi where oi.order_id = s.order_id), 0),
         nullif(v->'crea'->>'riferimento', ''),
         md5(p_survey::text || v_tipo_elemento || coalesce(v_comp, ''))::uuid,
         0, 0)
      returning id into v_item;
      v_create := v_create + 1;
    end if;

    select * into r from public.order_items where id = v_item for update;
    if r.id is null or r.order_id <> s.order_id then
      raise exception 'Riga estranea alla commessa' using errcode = '22023';
    end if;
    if r.diviso_da is not null and exists (select 1 from public.order_items h where h.id = r.diviso_da) then
      raise exception 'Questa riga è una parte divisa: si aggiorna con la riga di partenza' using errcode = '22023';
    end if;

    v_evento := 'rilevato';
    -- Secondo sopralluogo: niente righe nuove, si sceglie cosa tenere.
    if r.survey_id is not null and r.survey_id <> p_survey and r.misure_rilevate is not null then
      if v_scelta is null or v_scelta not in ('tieni_nuovo', 'tieni_precedente') then
        raise exception 'La riga «%» ha già le misure di un altro sopralluogo: scegli quali tenere', r.name using errcode = '22023';
      end if;
      if v_scelta = 'tieni_precedente' then
        if not exists (select 1 from public.order_item_misure_storico h
                        where h.order_item_id = r.id and h.evento = 'tenuto_precedente'
                          and h.survey_element_id = v_elemento and h.misure_dopo is not distinct from v_nuove) then
          insert into public.order_item_misure_storico
            (company_id, order_id, order_item_id, evento, survey_id, survey_element_id,
             misure_prima, misure_dopo, stato_prima, stato_dopo)
          values
            (s.company_id, r.order_id, r.id, 'tenuto_precedente', p_survey, v_elemento,
             r.misure_rilevate, v_nuove, r.measure_status, r.measure_status);
        end if;
        v_tenute := v_tenute + 1;
        continue;
      end if;
      v_evento := 'sostituito';
    end if;

    if public.misure_riga_scrivi(r.id, v_nuove, nullif(v->>'misura_tipo', ''), nullif(v->>'misura_forma', ''),
                                 nullif(v->>'unita', ''), p_survey, v_elemento, v_comp, v_evento) then
      v_applicate := v_applicate + 1;
    else
      v_invariate := v_invariate + 1;
    end if;

    if exists (select 1 from public.purchase_order_items p
                 join public.purchase_orders po on po.id = p.purchase_order_id
                where p.order_item_id = r.id and po.status <> 'annullato') then
      v_ordini := v_ordini || r.id;
    end if;
  end loop;

  perform set_config('app.materiali_sistema', '', true);

  return jsonb_build_object('applicate', v_applicate, 'create', v_create, 'invariate', v_invariate,
                            'tenute', v_tenute, 'con_ordine', to_jsonb(v_ordini));
end;
$function$;

-- ── Una misura scritta a mano dalla commessa ────────────────────────────────

create or replace function public.riga_misure_salva(p_item uuid, p_misure jsonb, p_tipo text default null, p_forma text default null)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order uuid;
  v_azienda uuid;
  v_nuove jsonb := public.misure_normalizza(p_misure);
  v_ok boolean;
begin
  select oi.order_id, o.company_id into v_order, v_azienda
    from public.order_items oi join public.orders o on o.id = oi.order_id
   where oi.id = p_item;
  if v_azienda is null
     or public.utente_sola_lettura(v_azienda)
     or not (public.materiali_puo('can_edit_orders', v_azienda) or public.materiali_puo('can_validate_bom', v_azienda)) then
    raise exception 'Non puoi modificare queste misure' using errcode = '42501';
  end if;
  if v_nuove = '{}'::jsonb then
    raise exception 'Scrivi almeno una misura valida' using errcode = '22023';
  end if;
  perform set_config('app.materiali_sistema', 'on', true);
  v_ok := public.misure_riga_scrivi(p_item, v_nuove, p_tipo, p_forma, null, null, null, null, 'modificato');
  perform set_config('app.materiali_sistema', '', true);
  return v_ok;
end;
$function$;

-- ── La conferma ─────────────────────────────────────────────────────────────

create or replace function public.misure_conferma(p_order uuid, p_righe uuid[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_azienda uuid;
  v_gioco numeric;
  v_soglia numeric;
  r public.order_items;
  v_forma text;
  v_gioco_riga numeric;
  v_da_ordinare jsonb;
  v_quantita numeric;
  v_con_ordine boolean;
  v_scarto numeric;
  v_oltre boolean;
  v_base numeric;
  v_sup_prima numeric;
  v_sup_dopo numeric;
  v_costo numeric;
  v_iniziale numeric;
  v_rapporto numeric;
  v_confermate int := 0;
  v_gia int := 0;
  v_saltate int := 0;
  v_scarti jsonb := '[]'::jsonb;
begin
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null
     or public.utente_sola_lettura(v_azienda)
     or not public.materiali_puo('can_validate_bom', v_azienda) then
    raise exception 'Per confermare le misure serve il permesso di validare i materiali' using errcode = '42501';
  end if;

  select coalesce(f.misure_gioco_posa_mm, 0), coalesce(f.misure_soglia_scarto_mm, 5) into v_gioco, v_soglia
    from public.company_fasi_settings f where f.company_id = v_azienda;
  v_gioco := coalesce(v_gioco, 0);
  v_soglia := coalesce(v_soglia, 5);

  perform set_config('app.materiali_sistema', 'on', true);

  for r in
    select * from public.order_items oi
     where oi.order_id = p_order
       and oi.measure_status is not null
       and oi.diviso_da is null
       and (p_righe is null or oi.id = any (p_righe))
     order by oi.id
     for update
  loop
    if r.measure_status = 'confermato' then
      v_gia := v_gia + 1;
      continue;
    end if;
    if r.measure_status <> 'rilevato' or r.misure_rilevate is null then
      v_saltate := v_saltate + 1;
      continue;
    end if;

    v_forma := coalesce(r.misura_forma,
      case when r.misure_rilevate ? 'quantita' then 'pz'
           when r.misure_rilevate ? 'profondita_mm' then 'LxPxH'
           else 'LxH' end);
    v_con_ordine := exists (select 1 from public.purchase_order_items p
                              join public.purchase_orders po on po.id = p.purchase_order_id
                             where p.order_item_id = r.id and po.status <> 'annullato');

    -- La misura che legge il fornitore. Il gioco vale solo se è stato misurato il foro.
    v_gioco_riga := case when r.misura_tipo = 'foro' and v_forma in ('LxH', 'LxPxH') then v_gioco else 0 end;
    v_da_ordinare := r.misure_rilevate;
    if v_gioco_riga > 0 then
      if v_da_ordinare ? 'larghezza_mm' then
        v_da_ordinare := v_da_ordinare || jsonb_build_object('larghezza_mm', greatest((v_da_ordinare->>'larghezza_mm')::numeric - v_gioco_riga, 1));
      end if;
      if v_da_ordinare ? 'altezza_mm' then
        v_da_ordinare := v_da_ordinare || jsonb_build_object('altezza_mm', greatest((v_da_ordinare->>'altezza_mm')::numeric - v_gioco_riga, 1));
      end if;
    end if;

    v_quantita := null;
    if r.misure_rilevate ? 'quantita' then
      v_quantita := round((r.misure_rilevate->>'quantita')::numeric * (1 + coalesce(r.sfrido, 0) / 100), 4);
      v_da_ordinare := v_da_ordinare || jsonb_build_object('quantita', trim_scale(v_quantita));
    end if;

    select coalesce(max(abs((x.value->>'delta')::numeric)) filter (where x.key like '%\_mm'), 0)
      into v_scarto
      from jsonb_each(coalesce(r.measure_variance, '{}'::jsonb)) x
     where x.value->>'delta' is not null;
    v_oltre := v_scarto > v_soglia
      or coalesce(abs((r.measure_variance->'quantita'->>'delta')::numeric), 0) >= 0.01;

    -- Costo stimato: solo prima dell'ordine, mai se l'ha scritto una persona o viene da un documento.
    v_costo := r.purchase_price;
    v_iniziale := r.costo_stimato_iniziale;
    if not v_con_ordine
       and v_forma in ('LxH', 'LxPxH')
       and coalesce(r.prezzo_fonte, 'listino') = 'listino'
       and r.origine_materiale is distinct from 'manuale' then
      v_base := coalesce(r.costo_stimato_iniziale, r.purchase_price);
      v_sup_prima := public.misure_superficie(r.misure_preventivo);
      v_sup_dopo := public.misure_superficie(r.misure_rilevate);
      if v_oltre and coalesce(v_base, 0) > 0 and coalesce(v_sup_prima, 0) > 0 and coalesce(v_sup_dopo, 0) > 0 then
        v_rapporto := v_sup_dopo / v_sup_prima;
        v_costo := round(v_base * v_rapporto, 4);
        v_iniziale := v_base;
      elsif not v_oltre and r.costo_stimato_iniziale is not null then
        v_costo := r.costo_stimato_iniziale;
        v_iniziale := null;
      end if;
    end if;

    update public.order_items oi
       set measure_status = 'confermato',
           misure_da_ordinare = v_da_ordinare,
           misura_forma = coalesce(oi.misura_forma, v_forma),
           gioco_posa_mm = v_gioco_riga,
           purchase_price = case when oi.id = r.id then v_costo else oi.purchase_price end,
           costo_stimato_iniziale = case when oi.id = r.id then v_iniziale else oi.costo_stimato_iniziale end,
           prezzo_aggiornato_il = case when oi.id = r.id and v_costo is distinct from r.purchase_price then now() else oi.prezzo_aggiornato_il end,
           quantita_netta = case when v_quantita is not null and not v_con_ordine then (r.misure_rilevate->>'quantita')::numeric else oi.quantita_netta end
     where oi.id = r.id or oi.diviso_da = r.id;

    -- Una riga divisa fra le fasi mantiene la proporzione: la testa prende il resto.
    if v_quantita is not null and not v_con_ordine and v_quantita is distinct from r.quantity then
      with parti as (
        select p.id, p.quantity from public.order_items p where p.diviso_da = r.id
      ), totale as (
        select r.quantity + coalesce(sum(quantity), 0) as q from parti
      ), scalate as (
        select p.id, round(p.quantity * v_quantita / nullif(t.q, 0), 4) as nuova
          from parti p cross join totale t
      ), aggiornate as (
        update public.order_items oi set quantity = s.nuova from scalate s where oi.id = s.id
        returning s.nuova
      )
      update public.order_items oi
         set quantity = v_quantita - coalesce((select sum(nuova) from aggiornate), 0)
       where oi.id = r.id;
    end if;

    insert into public.order_item_misure_storico
      (company_id, order_id, order_item_id, evento, survey_id, survey_element_id,
       misure_prima, misure_dopo, stato_prima, stato_dopo, dati)
    values
      (v_azienda, r.order_id, r.id, 'confermato', r.survey_id, r.survey_element_id,
       r.misure_rilevate, v_da_ordinare, r.measure_status, 'confermato',
       jsonb_build_object('gioco_posa_mm', v_gioco_riga, 'scarto_mm', v_scarto, 'oltre_soglia', v_oltre,
                          'costo_prima', r.purchase_price, 'costo_dopo', v_costo, 'con_ordine', v_con_ordine));

    v_confermate := v_confermate + 1;
    if v_oltre then
      v_scarti := v_scarti || jsonb_build_object('id', r.id, 'name', r.name, 'scarto_mm', v_scarto,
                                                 'costo_prima', r.purchase_price, 'costo_dopo', v_costo,
                                                 'con_ordine', v_con_ordine);
    end if;
  end loop;

  perform set_config('app.materiali_sistema', '', true);

  return jsonb_build_object('confermate', v_confermate, 'gia_confermate', v_gia, 'saltate', v_saltate, 'scarti', v_scarti);
end;
$function$;

-- ── Lo sfrido della riga ────────────────────────────────────────────────────

create or replace function public.riga_imposta_sfrido(p_item uuid, p_sfrido numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.order_items;
  v_azienda uuid;
  v_quantita numeric;
  v_con_ordine boolean;
begin
  if p_sfrido is null or p_sfrido < 0 or p_sfrido > 100 then
    raise exception 'Lo sfrido va da 0 a 100 per cento' using errcode = '22023';
  end if;
  select * into r from public.order_items where id = p_item for update;
  select o.company_id into v_azienda from public.orders o where o.id = r.order_id;
  if v_azienda is null
     or public.utente_sola_lettura(v_azienda)
     or not (public.materiali_puo('can_edit_orders', v_azienda) or public.materiali_puo('can_validate_bom', v_azienda)) then
    raise exception 'Non puoi modificare questa riga' using errcode = '42501';
  end if;
  if r.sfrido is not distinct from p_sfrido then
    return;
  end if;

  v_con_ordine := exists (select 1 from public.purchase_order_items p
                            join public.purchase_orders po on po.id = p.purchase_order_id
                           where p.order_item_id = r.id and po.status <> 'annullato');
  perform set_config('app.materiali_sistema', 'on', true);
  update public.order_items oi set sfrido = p_sfrido where oi.id = r.id or oi.diviso_da = r.id;
  if r.measure_status = 'confermato' and r.misure_rilevate ? 'quantita' then
    v_quantita := round((r.misure_rilevate->>'quantita')::numeric * (1 + p_sfrido / 100), 4);
    update public.order_items oi
       set misure_da_ordinare = oi.misure_da_ordinare || jsonb_build_object('quantita', trim_scale(v_quantita))
     where oi.id = r.id or oi.diviso_da = r.id;
    if not v_con_ordine and not exists (select 1 from public.order_items p where p.diviso_da = r.id) then
      update public.order_items oi set quantity = v_quantita where oi.id = r.id;
    end if;
  end if;
  perform set_config('app.materiali_sistema', '', true);

  insert into public.order_item_misure_storico
    (company_id, order_id, order_item_id, evento, survey_id, survey_element_id, stato_prima, stato_dopo, dati)
  values
    (v_azienda, r.order_id, r.id, 'sfrido', r.survey_id, r.survey_element_id, r.measure_status, r.measure_status,
     jsonb_build_object('sfrido_prima', r.sfrido, 'sfrido_dopo', p_sfrido));
end;
$function$;

-- ── Gioco di posa e soglia dell'azienda ─────────────────────────────────────

create or replace function public.misure_impostazioni_salva(p_company uuid, p_gioco_mm numeric, p_soglia_mm numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.utente_sola_lettura(p_company) or not public.materiali_puo('can_validate_bom', p_company) then
    raise exception 'Per cambiare gioco e soglia serve il permesso di validare i materiali' using errcode = '42501';
  end if;
  if p_gioco_mm is null or p_gioco_mm < 0 or p_gioco_mm > 200 then
    raise exception 'Il gioco di posa va da 0 a 200 mm' using errcode = '22023';
  end if;
  if p_soglia_mm is null or p_soglia_mm < 0 or p_soglia_mm > 500 then
    raise exception 'La soglia va da 0 a 500 mm' using errcode = '22023';
  end if;
  insert into public.company_fasi_settings (company_id, misure_gioco_posa_mm, misure_soglia_scarto_mm)
  values (p_company, p_gioco_mm, p_soglia_mm)
  on conflict (company_id) do update
     set misure_gioco_posa_mm = excluded.misure_gioco_posa_mm,
         misure_soglia_scarto_mm = excluded.misure_soglia_scarto_mm,
         updated_at = now();
end;
$function$;

-- ── Sopralluogo nato prima della commessa ───────────────────────────────────

-- Commessa nata da un'opportunità: i sopralluoghi di quell'opportunità si agganciano da soli.
-- Se qualcosa va storto la commessa nasce lo stesso: l'aggancio resta possibile a mano.
create or replace function public.commessa_aggancia_sopralluoghi()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.opportunity_id is null then
    return null;
  end if;
  begin
    update public.surveys s
       set order_id = new.id
     where s.opportunity_id = new.opportunity_id
       and s.company_id = new.company_id
       and s.order_id is null
       and s.deleted_at is null;
  exception when others then
    raise warning 'commessa_aggancia_sopralluoghi: %', sqlerrm;
  end;
  return null;
end;
$function$;

drop trigger if exists commessa_aggancia_sopralluoghi on public.orders;
create trigger commessa_aggancia_sopralluoghi
  after insert or update of opportunity_id on public.orders
  for each row execute function public.commessa_aggancia_sopralluoghi();

-- Gli altri (stesso cliente o stesso contatto) li propone la scheda: li conferma una persona.
create or replace function public.sopralluoghi_da_agganciare(p_order uuid)
 returns table (id uuid, code text, status text, ruolo_misure text, created_at timestamptz, completed_at timestamptz, address text, city text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  o public.orders;
begin
  select * into o from public.orders x where x.id = p_order;
  if o.id is null or not public.materiali_puo('can_view_orders', o.company_id) then
    raise exception 'Non puoi vedere questa commessa' using errcode = '42501';
  end if;
  return query
    select s.id, s.code, s.status, s.ruolo_misure, s.created_at, s.completed_at, s.address, s.city
      from public.surveys s
     where s.company_id = o.company_id
       and s.order_id is null
       and s.deleted_at is null
       and ((o.customer_id is not null and s.client_id = o.customer_id)
         or (o.opportunity_id is not null and s.opportunity_id = o.opportunity_id)
         or (o.opportunity_id is not null and s.contact_id is not null and s.contact_id =
              (select m.contact_id from public.marketing_opportunities m where m.id = o.opportunity_id)))
     order by s.created_at desc
     limit 20;
end;
$function$;

create or replace function public.sopralluogo_aggancia_commessa(p_survey uuid, p_order uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s public.surveys;
  v_azienda uuid;
begin
  if not public.sopralluogo_puo_lavorare(p_survey, true) then
    raise exception 'Non puoi modificare questo sopralluogo' using errcode = '42501';
  end if;
  select * into s from public.surveys where id = p_survey for update;
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null or v_azienda <> s.company_id or not public.materiali_puo('can_edit_orders', v_azienda) then
    raise exception 'Non puoi collegare questa commessa' using errcode = '42501';
  end if;
  if s.order_id = p_order then
    return;
  end if;
  if s.order_id is not null then
    raise exception 'Il sopralluogo è già collegato a un''altra commessa' using errcode = '23505';
  end if;
  update public.surveys set order_id = p_order where id = p_survey;
end;
$function$;

-- ── Chi può chiamare cosa ───────────────────────────────────────────────────

revoke all on function public.misure_normalizza(jsonb) from public, anon, authenticated;
revoke all on function public.misure_valore(jsonb, text) from public, anon, authenticated;
revoke all on function public.misure_scarto(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.misure_superficie(jsonb) from public, anon, authenticated;
revoke all on function public.sopralluogo_puo_lavorare(uuid, boolean) from public, anon, authenticated;
revoke all on function public.misure_riga_scrivi(uuid, jsonb, text, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.commessa_aggancia_sopralluoghi() from public, anon, authenticated;

revoke all on function public.sopralluogo_posizioni_commessa(uuid) from public, anon;
revoke all on function public.sopralluogo_applica_misure(uuid, jsonb) from public, anon;
revoke all on function public.riga_misure_salva(uuid, jsonb, text, text) from public, anon;
revoke all on function public.misure_conferma(uuid, uuid[]) from public, anon;
revoke all on function public.riga_imposta_sfrido(uuid, numeric) from public, anon;
revoke all on function public.misure_impostazioni_salva(uuid, numeric, numeric) from public, anon;
revoke all on function public.sopralluoghi_da_agganciare(uuid) from public, anon;
revoke all on function public.sopralluogo_aggancia_commessa(uuid, uuid) from public, anon;

grant execute on function public.sopralluogo_posizioni_commessa(uuid) to authenticated;
grant execute on function public.sopralluogo_applica_misure(uuid, jsonb) to authenticated;
grant execute on function public.riga_misure_salva(uuid, jsonb, text, text) to authenticated;
grant execute on function public.misure_conferma(uuid, uuid[]) to authenticated;
grant execute on function public.riga_imposta_sfrido(uuid, numeric) to authenticated;
grant execute on function public.misure_impostazioni_salva(uuid, numeric, numeric) to authenticated;
grant execute on function public.sopralluoghi_da_agganciare(uuid) to authenticated;
grant execute on function public.sopralluogo_aggancia_commessa(uuid, uuid) to authenticated;
