-- L'arrivo della merce su misura, posizione per posizione (8/11/2026). Piano articoli su misura, fase 7.
--
-- Una riga per ogni spunta: arrivata, danneggiata, sbagliata, mancante, con foto e nota.
-- Le spunte valgono solo per le righe su misura: gli articoli normali restano come oggi.
--
-- Come si contano i pezzi di una riga d'ordine (Q = quantità ordinata, R = quantity_received):
--   arrivata                  R sale: il pezzo c'è ed è giusto.
--   danneggiata o sbagliata   R NON sale: il pezzo c'è ma non si può posare.
--   mancante                  R NON sale.
-- Se il fornitore rimanda il pezzo sulla stessa riga, una spunta «sostitutivo» chiude il problema.
-- Se si fa un riordino, nasce una riga nuova, legata alla stessa posizione, con riordino_motivo.
-- Quando il riordino arriva giusto, la riga vecchia si chiude: R sale anche lì, e l'ordine
-- vecchio può diventare «ricevuto». Il pezzo però conta una volta sola: chi legge i pezzi buoni
-- toglie quelli segnati 'sostituito'. Il riordino gratuito ha prezzo zero: nessun costo doppio.
--
-- Solo oggetti nuovi: nessuna riga esistente viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.arrivi_posizione (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  ddt_ricezione_id uuid references public.ddt_ricezione(id) on delete set null,
  esito text not null check (esito in ('arrivata', 'danneggiata', 'sbagliata', 'mancante')),
  quantita numeric not null check (quantita > 0),
  stato text not null default 'aperto' check (stato in ('aperto', 'riordinato', 'risolto', 'sostituito')),
  foto text[] not null default '{}',
  nota text,
  riordino_poi_id uuid references public.purchase_order_items(id) on delete set null,
  invio_id uuid,
  creato_da uuid,
  creato_il timestamptz not null default now(),
  chiuso_il timestamptz
);

comment on table public.arrivi_posizione is 'Le spunte dell''arrivo merce su misura. Si leggono e si scrivono solo con le funzioni arrivo_*.';
comment on column public.arrivi_posizione.stato is 'aperto = da gestire; riordinato = pezzo nuovo chiesto; risolto = chiuso sulla stessa riga; sostituito = arrivato il riordino.';
comment on column public.arrivi_posizione.invio_id is 'Identifica un invio: lo stesso invio ripetuto (doppio clic) non scrive due volte.';

create index if not exists arrivi_posizione_riga_idx on public.arrivi_posizione (purchase_order_item_id);
create index if not exists arrivi_posizione_commessa_idx on public.arrivi_posizione (order_item_id);
create index if not exists arrivi_posizione_ordine_idx on public.arrivi_posizione (purchase_order_id);
create index if not exists arrivi_posizione_invio_idx on public.arrivi_posizione (purchase_order_id, invio_id) where invio_id is not null;
create index if not exists arrivi_posizione_riordino_idx on public.arrivi_posizione (riordino_poi_id) where riordino_poi_id is not null;
create index if not exists arrivi_posizione_bolla_idx on public.arrivi_posizione (ddt_ricezione_id) where ddt_ricezione_id is not null;

-- Nessuna policy e nessun GRANT: si passa solo dalle funzioni, che non restituiscono prezzi.
alter table public.arrivi_posizione enable row level security;
revoke all on public.arrivi_posizione from public, anon, authenticated;

-- ── Cosa è su misura ────────────────────────────────────────────────────────
create or replace function public.riga_e_su_misura(p_order_item uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select oi.gruppo_id is not null or oi.measure_status is not null
                     from public.order_items oi where oi.id = p_order_item), false);
$function$;

-- ── Chi può spuntare: l'ufficio che vede la commessa e chi ci lavora ─────────
create or replace function public.arrivo_puo_registrare(p_company uuid, p_order uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null
     and not public.utente_bloccato()
     and not public.utente_e_cliente_esterno()
     and not public.utente_sola_lettura(p_company)
     and ((public.campo_e_ufficio(p_company) and coalesce(public.ufficio_vede_commessa(p_order), false))
          or coalesce(public.campo_lavoro_su_commessa(p_order), false));
$function$;

-- Reclamo e riordino sono dell'ufficio: nascono ordini e possono nascere costi.
create or replace function public.arrivo_puo_riordinare(p_company uuid, p_order uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null
     and not public.utente_bloccato()
     and not public.utente_sola_lettura(p_company)
     and public.campo_e_ufficio(p_company)
     and coalesce(public.ufficio_vede_commessa(p_order), false)
     and (coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company), false)
          or coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', p_company), false));
$function$;

-- ── I conti di una posizione ────────────────────────────────────────────────
create or replace function public.arrivo_conti(p_order_item uuid)
 returns table(quantita numeric, ordinata numeric, buoni numeric, danneggiati numeric, sbagliati numeric, in_riordino numeric, non_arrivati numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with riga as (
    select coalesce(oi.quantity, 0)::numeric as q from public.order_items oi where oi.id = p_order_item
  ), ordini as (
    select coalesce(sum(p.quantity) filter (where p.riordino_motivo is null), 0)::numeric as ord,
           coalesce(sum(p.quantity_received), 0)::numeric as ric
      from public.purchase_order_items p
      join public.purchase_orders po on po.id = p.purchase_order_id
     where p.order_item_id = p_order_item and po.status <> 'annullato'
  ), spunte as (
    select coalesce(sum(a.quantita) filter (where a.stato = 'sostituito'), 0) as sost,
           coalesce(sum(a.quantita) filter (where a.esito = 'danneggiata' and a.stato in ('aperto', 'riordinato')), 0) as dan,
           coalesce(sum(a.quantita) filter (where a.esito = 'sbagliata' and a.stato in ('aperto', 'riordinato')), 0) as sba,
           coalesce(sum(a.quantita) filter (where a.stato = 'riordinato'), 0) as rio
      from public.arrivi_posizione a where a.order_item_id = p_order_item
  ), c as (
    select riga.q, ordini.ord, spunte.dan, spunte.sba, spunte.rio,
           least(riga.q, greatest(ordini.ric - spunte.sost, 0)) as b
      from riga, ordini, spunte
  )
  select c.q, c.ord, c.b,
         least(c.dan, c.q - c.b),
         least(c.sba, greatest(c.q - c.b - least(c.dan, c.q - c.b), 0)),
         c.rio,
         greatest(c.q - c.b - least(c.dan, c.q - c.b) - least(c.sba, greatest(c.q - c.b - least(c.dan, c.q - c.b), 0)), 0)
    from c;
$function$;

-- La riga di commessa dice che cosa è davvero arrivato giusto: lo legge chi programma la posa.
create or replace function public.arrivo_allinea_riga(p_order_item uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c record;
begin
  if not public.riga_e_su_misura(p_order_item) then
    return;
  end if;
  select * into c from public.arrivo_conti(p_order_item);
  update public.order_items oi
     set quantity_received = c.buoni,
         last_goods_receipt_date = case when c.buoni > coalesce(oi.quantity_received, 0) then now() else oi.last_goods_receipt_date end,
         fulfillment_status = case
           when oi.fulfillment_status = 'installed' then oi.fulfillment_status
           when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
           else 'not_started' end
   where oi.id = p_order_item
     and (oi.quantity_received is distinct from c.buoni
          or oi.fulfillment_status is distinct from case
               when oi.fulfillment_status = 'installed' then oi.fulfillment_status
               when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
               else 'not_started' end);
end;
$function$;

create or replace function public.arrivo_avanza_ordine(p_po uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mancante numeric;
begin
  select coalesce(sum(greatest(quantity - coalesce(quantity_received, 0), 0)), 0) into v_mancante
    from public.purchase_order_items where purchase_order_id = p_po;
  update public.purchase_orders
     set status = case when v_mancante <= 0 then 'ricevuto' else 'parziale' end,
         actual_delivery_date = case when v_mancante <= 0 then coalesce(actual_delivery_date, current_date) else actual_delivery_date end,
         updated_at = now()
   where id = p_po and status in ('inviato', 'confermato', 'parziale');
end;
$function$;

-- Chiude le righe aperte di una posizione, le più vecchie prima. Restituisce quanto resta da chiudere.
create or replace function public.arrivo_chiudi_aperte(p_poi uuid, p_esiti text[], p_quantita numeric)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r public.arrivi_posizione%rowtype;
  v_resta numeric := p_quantita;
begin
  for r in select * from public.arrivi_posizione a
            where a.purchase_order_item_id = p_poi and a.stato = 'aperto' and a.esito = any (p_esiti)
            order by a.creato_il, a.id for update loop
    exit when v_resta <= 0;
    if v_resta < r.quantita then
      insert into public.arrivi_posizione (company_id, purchase_order_id, purchase_order_item_id, order_item_id, ddt_ricezione_id,
                                           esito, quantita, stato, foto, nota, creato_da, creato_il)
      values (r.company_id, r.purchase_order_id, r.purchase_order_item_id, r.order_item_id, r.ddt_ricezione_id,
              r.esito, r.quantita - v_resta, 'aperto', r.foto, r.nota, r.creato_da, r.creato_il);
      update public.arrivi_posizione set quantita = v_resta, stato = 'risolto', chiuso_il = now() where id = r.id;
      v_resta := 0;
    else
      update public.arrivi_posizione set stato = 'risolto', chiuso_il = now() where id = r.id;
      v_resta := v_resta - r.quantita;
    end if;
  end loop;
  return v_resta;
end;
$function$;

-- ── Elenco per la pagina di spunta: niente prezzi ───────────────────────────
create or replace function public.arrivo_elenco(p_purchase_order_id uuid, p_ddt_id uuid default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  po public.purchase_orders%rowtype;
  v_order uuid;
  v_ufficio boolean;
  v_ris jsonb;
begin
  select * into po from public.purchase_orders where id = p_purchase_order_id and company_id = v_company;
  if not found then
    raise exception 'Ordine non trovato.' using errcode = 'P0002';
  end if;
  v_order := coalesce(po.order_id, (select oi.order_id from public.purchase_order_items p
                                      join public.order_items oi on oi.id = p.order_item_id
                                     where p.purchase_order_id = po.id limit 1));
  if not public.arrivo_puo_registrare(v_company, v_order) then
    raise exception 'Non puoi vedere l''arrivo di questa merce.' using errcode = '42501';
  end if;
  v_ufficio := public.arrivo_puo_riordinare(v_company, v_order);

  select jsonb_build_object(
    'ordine', jsonb_build_object(
      'id', po.id, 'numero', po.oda_number, 'stato', po.status, 'order_id', v_order,
      'fornitore', s.name, 'email_fornitore', case when v_ufficio then s.email end,
      'commessa', o.order_code, 'cliente', coalesce(nullif(btrim(coalesce(o.client_name, '')), ''), o.description)),
    'puo_riordinare', v_ufficio,
    'articoli_normali', (select count(*) from public.purchase_order_items p
                          where p.purchase_order_id = po.id and not public.riga_e_su_misura(p.order_item_id)),
    'posizioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'poi_id', p.id, 'order_item_id', p.order_item_id,
        'nome', oi.name, 'descrizione', p.description, 'riferimento', oi.riferimento, 'gruppo_id', oi.gruppo_id,
        'misure', coalesce(oi.misure_da_ordinare, oi.misure_rilevate, oi.misure_preventivo),
        'misura_tipo', oi.misura_tipo, 'componente', oi.componente, 'unita', p.unit_of_measure, 'sku', p.sku,
        'quantita', p.quantity, 'ricevuta', coalesce(p.quantity_received, 0),
        'riordino', p.riordino_motivo is not null, 'riordino_motivo', p.riordino_motivo,
        'problemi', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id, 'esito', a.esito, 'quantita', a.quantita, 'stato', a.stato, 'foto', to_jsonb(a.foto), 'nota', a.nota,
            'creato_il', a.creato_il, 'chi', nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
            'riordino_po_id', rp.purchase_order_id, 'riordino_numero', ro.oda_number) order by a.creato_il)
            from public.arrivi_posizione a
            left join public.profiles pr on pr.id = a.creato_da
            left join public.purchase_order_items rp on rp.id = a.riordino_poi_id
            left join public.purchase_orders ro on ro.id = rp.purchase_order_id
           where a.purchase_order_item_id = p.id and a.esito <> 'arrivata' and a.stato in ('aperto', 'riordinato')), '[]'::jsonb)
      ) order by p.sort_order nulls last, oi.riferimento nulls last, p.id)
        from public.purchase_order_items p
        join public.order_items oi on oi.id = p.order_item_id
       where p.purchase_order_id = po.id and public.riga_e_su_misura(p.order_item_id)), '[]'::jsonb),
    'righe_bolla', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'posizione', r.posizione, 'codice', r.codice_articolo, 'descrizione', r.descrizione,
        'quantita', r.quantita, 'unita', r.unita_misura, 'order_item_id', r.order_item_id, 'origine', r.origine) order by r.posizione)
        from public.ddt_righe r
        join public.ddt_ricezione d on d.id = r.ddt_ricezione_id
       where r.ddt_ricezione_id = p_ddt_id and d.company_id = v_company), '[]'::jsonb)
  ) into v_ris
  from (select 1) x
  left join public.suppliers s on s.id = po.supplier_id
  left join public.orders o on o.id = v_order;

  return v_ris;
end;
$function$;

-- ── La spunta ───────────────────────────────────────────────────────────────
create or replace function public.arrivo_registra(
  p_purchase_order_id uuid,
  p_righe jsonb,
  p_ddt_id uuid default null,
  p_numero_bolla text default null,
  p_data date default null,
  p_invio_id uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set lock_timeout to '5s'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_uid uuid := auth.uid();
  po public.purchase_orders%rowtype;
  p public.purchase_order_items%rowtype;
  v_order uuid;
  v_r jsonb;
  v_esito text;
  v_q numeric;
  v_sostitutivo boolean;
  v_man numeric; v_pro numeric; v_rio numeric; v_ric numeric; v_libero numeric; v_max numeric; v_prima numeric; v_resto numeric;
  v_foto text[];
  v_id uuid;
  v_inserite uuid[] := '{}';
  v_ok jsonb := '[]'::jsonb;
  v_collegare jsonb := '[]'::jsonb;
  v_saltate jsonb := '[]'::jsonb;
  v_problemi int := 0;
  v_testo_problemi text := '';
  v_nome text;
  v_ddt uuid := p_ddt_id;
  v_numero text;
  v_data date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
  v_esito_ordine record;
  v_admin record;
  v_chi text;
begin
  if v_uid is null or v_company is null then
    raise exception 'Sessione scaduta: accedi di nuovo.' using errcode = 'P0001';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Non hai spuntato nessuna posizione.' using errcode = 'P0001';
  end if;

  -- Tutto l'ordine, una persona alla volta: due telefoni non contano due volte lo stesso pezzo.
  select * into po from public.purchase_orders where id = p_purchase_order_id and company_id = v_company for update;
  if not found then
    raise exception 'Ordine non trovato.' using errcode = 'P0002';
  end if;
  v_order := coalesce(po.order_id, (select oi.order_id from public.purchase_order_items i
                                      join public.order_items oi on oi.id = i.order_item_id
                                     where i.purchase_order_id = po.id limit 1));
  if not public.arrivo_puo_registrare(v_company, v_order) then
    raise exception 'Non puoi registrare l''arrivo per questo cantiere.' using errcode = '42501';
  end if;
  if po.status not in ('inviato', 'confermato', 'parziale', 'ricevuto') then
    raise exception 'L''ordine % è in stato «%»: l''arrivo non si può registrare.', po.oda_number, po.status using errcode = 'P0001';
  end if;

  -- Stesso invio ripetuto: niente di nuovo, si dice com'è andata la prima volta.
  if p_invio_id is not null and exists (select 1 from public.arrivi_posizione a
                                         where a.purchase_order_id = po.id and a.invio_id = p_invio_id) then
    return jsonb_build_object('gia_registrato', true, 'registrate', 0, 'saltate', '[]'::jsonb,
      'ddt_id', (select a.ddt_ricezione_id from public.arrivi_posizione a
                  where a.purchase_order_id = po.id and a.invio_id = p_invio_id and a.ddt_ricezione_id is not null limit 1));
  end if;

  for v_r in select value from jsonb_array_elements(p_righe) limit 500 loop
    v_esito := v_r->>'esito';
    v_q := case when (v_r->>'quantita') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'quantita')::numeric end;
    v_sostitutivo := coalesce((v_r->>'sostitutivo')::boolean, false);
    if v_esito is null or v_esito not in ('arrivata', 'danneggiata', 'sbagliata', 'mancante') or coalesce(v_q, 0) <= 0 then
      v_saltate := v_saltate || jsonb_build_object('poi_id', v_r->>'poi_id', 'motivo', 'dati non validi');
      continue;
    end if;

    select * into p from public.purchase_order_items
     where id = nullif(v_r->>'poi_id', '')::uuid and purchase_order_id = po.id for update;
    if not found then
      v_saltate := v_saltate || jsonb_build_object('poi_id', v_r->>'poi_id', 'motivo', 'non è una riga di questo ordine');
      continue;
    end if;
    if not public.riga_e_su_misura(p.order_item_id) then
      v_saltate := v_saltate || jsonb_build_object('poi_id', p.id, 'descrizione', p.description,
        'motivo', 'articolo normale: si registra dall''arrivo merce dell''ordine');
      continue;
    end if;

    select coalesce(sum(a.quantita) filter (where a.stato = 'aperto' and a.esito = 'mancante'), 0),
           coalesce(sum(a.quantita) filter (where a.stato = 'aperto' and a.esito in ('danneggiata', 'sbagliata')), 0),
           coalesce(sum(a.quantita) filter (where a.stato = 'riordinato'), 0)
      into v_man, v_pro, v_rio
      from public.arrivi_posizione a where a.purchase_order_item_id = p.id;
    v_ric := coalesce(p.quantity_received, 0);
    v_libero := greatest(p.quantity - v_ric - v_man - v_pro - v_rio, 0);
    v_max := case v_esito
      when 'arrivata' then v_libero + v_man + case when v_sostitutivo then v_pro else 0 end
      when 'mancante' then v_libero
      else v_libero + v_man end;

    if v_max <= 0 then
      v_saltate := v_saltate || jsonb_build_object('poi_id', p.id, 'descrizione', p.description, 'motivo', 'già registrata da un''altra spunta');
      continue;
    end if;
    if v_q > v_max then
      v_saltate := v_saltate || jsonb_build_object('poi_id', p.id, 'descrizione', p.description,
        'motivo', 'registrati solo ' || trim(trailing '.' from to_char(v_max, 'FM999999990.999')) || ': il resto era già segnato');
      v_q := v_max;
    end if;

    -- Quello che eccede i pezzi liberi chiude le righe aperte, senza contarle due volte.
    v_prima := 0;
    if v_esito = 'arrivata' and v_sostitutivo then
      v_prima := least(v_q, v_pro);
      perform public.arrivo_chiudi_aperte(p.id, array['danneggiata', 'sbagliata'], v_prima);
    end if;
    v_resto := greatest(v_q - v_prima - v_libero, 0);
    if v_resto > 0 then
      perform public.arrivo_chiudi_aperte(p.id, array['mancante'], v_resto);
    end if;

    select coalesce(array_agg(left(f, 300)) filter (where f like v_company::text || '/%'), '{}') into v_foto
      from (select f from jsonb_array_elements_text(case when jsonb_typeof(v_r->'foto') = 'array' then v_r->'foto' else '[]'::jsonb end) f limit 6) x;

    insert into public.arrivi_posizione (company_id, purchase_order_id, purchase_order_item_id, order_item_id, esito, quantita,
                                         stato, foto, nota, invio_id, creato_da, chiuso_il)
    values (v_company, po.id, p.id, p.order_item_id, v_esito, v_q,
            case when v_esito = 'arrivata' then 'risolto' else 'aperto' end, v_foto,
            nullif(left(btrim(coalesce(v_r->>'nota', '')), 500), ''), p_invio_id, v_uid,
            case when v_esito = 'arrivata' then now() end)
    returning id into v_id;
    v_inserite := v_inserite || v_id;

    if v_esito = 'arrivata' then
      v_ok := v_ok || jsonb_build_object('item_id', p.id, 'quantity', v_q, 'stock_item_id', null);
    end if;
    if v_esito in ('danneggiata', 'sbagliata') then
      v_problemi := v_problemi + 1;
    end if;
    if v_esito <> 'arrivata' then
      select coalesce(nullif(btrim(coalesce(oi.riferimento, '')), '') || ' — ', '') || oi.name into v_nome
        from public.order_items oi where oi.id = p.order_item_id;
      v_testo_problemi := v_testo_problemi || case when v_testo_problemi = '' then '' else '; ' end
        || v_nome || ': ' || v_esito;
    end if;
    if nullif(v_r->>'ddt_riga_id', '') is not null then
      v_collegare := v_collegare || jsonb_build_object('riga', v_r->>'ddt_riga_id', 'order_item', p.order_item_id);
    end if;
  end loop;

  if cardinality(v_inserite) = 0 then
    return jsonb_build_object('gia_registrato', false, 'registrate', 0, 'saltate', v_saltate, 'ddt_id', p_ddt_id);
  end if;

  -- La bolla: quella aperta, quella con lo stesso numero su questo ordine, o una nuova.
  if v_ddt is not null then
    perform 1 from public.ddt_ricezione d
      where d.id = v_ddt and d.company_id = v_company
        and (d.purchase_order_id = po.id or d.purchase_order_id is null) for update;
    if not found then
      raise exception 'Questa bolla è di un altro ordine.' using errcode = 'P0001';
    end if;
    update public.ddt_ricezione d set purchase_order_id = po.id where d.id = v_ddt and d.purchase_order_id is null;
  else
    v_numero := nullif(btrim(coalesce(p_numero_bolla, '')), '');
    if v_numero is null then
      v_numero := 'S/N ' || to_char(v_data, 'DD/MM/YYYY') || ' ' || po.oda_number;
    end if;
    select d.id into v_ddt from public.ddt_ricezione d
     where d.company_id = v_company and d.purchase_order_id = po.id
       and upper(btrim(d.numero_ddt)) = upper(v_numero)
     order by d.created_at limit 1;
    if v_ddt is null then
      insert into public.ddt_ricezione (company_id, purchase_order_id, order_id, supplier_id, numero_ddt, data_ricezione, stato,
                                        source, destinazione, created_by, quantita_ricevuta)
      values (v_company, po.id, v_order, po.supplier_id, v_numero, v_data, 'parziale', 'manual', 'cantiere', v_uid, 0)
      returning id into v_ddt;
    end if;
  end if;
  update public.arrivi_posizione set ddt_ricezione_id = v_ddt where id = any (v_inserite);

  -- Quantità, stato dell'ordine e costo restano nella funzione di sempre, senza magazzino.
  if jsonb_array_length(v_ok) > 0 then
    select * into v_esito_ordine from public.oda_registra_arrivo(po.id, v_ok, null, v_data, null, null, null, v_ddt);
    if jsonb_array_length(coalesce(v_esito_ordine.errori, '[]'::jsonb)) > 0 then
      raise exception 'Arrivo non registrato: %', v_esito_ordine.errori::text using errcode = 'P0001';
    end if;
  else
    update public.purchase_orders set status = 'parziale', updated_at = now()
     where id = po.id and status in ('inviato', 'confermato');
  end if;

  if v_testo_problemi <> '' then
    update public.ddt_ricezione d
       set has_damages = d.has_damages or v_problemi > 0,
           non_conformita = left(coalesce(nullif(d.non_conformita, '') || '; ', '') || v_testo_problemi, 2000)
     where d.id = v_ddt;
  end if;

  -- La bolla dice di quale posizione parla: l'ha confermato chi riceve.
  update public.ddt_righe r
     set order_item_id = (c->>'order_item')::uuid
    from jsonb_array_elements(v_collegare) c
   where r.id = (c->>'riga')::uuid and r.ddt_ricezione_id = v_ddt;

  -- Se è arrivato qualcosa di sbagliato il titolare lo sa subito.
  if v_problemi > 0 then
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_chi from public.profiles where id = v_uid;
    for v_admin in
      select distinct pr.id from public.profiles pr join public.user_roles ur on ur.user_id = pr.id
       where pr.company_id = v_company and ur.role in ('company_admin', 'company_staff') and pr.id <> v_uid
    loop
      perform public.campo_notifica(v_company, v_admin.id, 'campo_acquisto',
        'Merce arrivata male: ordine ' || po.oda_number || ' (' || v_problemi || ')',
        coalesce(v_chi, 'Chi ha ricevuto la merce') || ' segnala: ' || left(v_testo_problemi, 300) || '. Apri l''ordine per il reclamo e il riordino.',
        'purchase_order', po.id, '/azienda/ordini-acquisto/' || po.id || '/arrivo');
    end loop;
  end if;

  return jsonb_build_object('gia_registrato', false, 'registrate', cardinality(v_inserite), 'saltate', v_saltate, 'ddt_id', v_ddt);
end;
$function$;

-- ── Riordino di solo quel pezzo ─────────────────────────────────────────────
-- Crea una bozza: l'ordine lo spedisce una persona, come tutti gli altri.
create or replace function public.arrivo_riordina(p_esiti uuid[], p_gratis boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set lock_timeout to '5s'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_po_id uuid;
  po public.purchase_orders%rowtype;
  v_order uuid;
  a public.arrivi_posizione%rowtype;
  p public.purchase_order_items%rowtype;
  v_nuovo uuid;
  v_nuova_riga uuid;
  v_quante int := 0;
  v_esistente uuid;
begin
  if auth.uid() is null or v_company is null then
    raise exception 'Sessione scaduta: accedi di nuovo.' using errcode = 'P0001';
  end if;
  if p_esiti is null or cardinality(p_esiti) = 0 then
    raise exception 'Scegli i pezzi da riordinare.' using errcode = 'P0001';
  end if;
  select x.purchase_order_id into v_po_id from public.arrivi_posizione x
   where x.id = any (p_esiti) and x.company_id = v_company limit 1;
  if v_po_id is null then
    raise exception 'Pezzi non trovati.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.arrivi_posizione x where x.id = any (p_esiti) and x.purchase_order_id <> v_po_id) then
    raise exception 'Un riordino per volta: scegli pezzi dello stesso ordine.' using errcode = 'P0001';
  end if;

  select * into po from public.purchase_orders where id = v_po_id and company_id = v_company for update;
  v_order := coalesce(po.order_id, (select x.order_id from public.order_items x
                                      join public.arrivi_posizione y on y.order_item_id = x.id where y.id = any (p_esiti) limit 1));
  if not public.arrivo_puo_riordinare(v_company, v_order) then
    raise exception 'Il riordino lo fa l''ufficio.' using errcode = '42501';
  end if;

  for a in select * from public.arrivi_posizione x
            where x.id = any (p_esiti) and x.stato = 'aperto' and x.esito in ('danneggiata', 'sbagliata')
            order by x.creato_il, x.id for update loop
    if v_nuovo is null then
      insert into public.purchase_orders (company_id, supplier_id, order_id, status, issue_date, notes, internal_notes, created_by,
                                          delivery_address, delivery_warehouse_id, payment_terms, payment_method)
      values (v_company, po.supplier_id, v_order, 'bozza', current_date,
              'Riordino di pezzi danneggiati o sbagliati dell''ordine ' || po.oda_number || '.',
              case when p_gratis then 'Sostituzione gratuita chiesta al fornitore.' else 'Riordino a pagamento.' end,
              auth.uid(), po.delivery_address, po.delivery_warehouse_id, po.payment_terms, po.payment_method)
      returning id into v_nuovo;
    end if;
    select * into p from public.purchase_order_items where id = a.purchase_order_item_id;
    insert into public.purchase_order_items (company_id, purchase_order_id, description, sku, unit_of_measure, quantity, unit_price,
                                             discount_percent, vat_rate, article_template_id, sort_order, notes, order_item_id, riordino_motivo)
    values (v_company, v_nuovo, p.description, p.sku, p.unit_of_measure, a.quantita,
            case when p_gratis then 0 else p.unit_price end, case when p_gratis then 0 else p.discount_percent end, p.vat_rate,
            p.article_template_id, v_quante + 1, a.nota, a.order_item_id,
            initcap(a.esito) || coalesce(': ' || nullif(btrim(coalesce(a.nota, '')), ''), '') || ' (ordine ' || po.oda_number || ')')
    returning id into v_nuova_riga;
    update public.arrivi_posizione set stato = 'riordinato', riordino_poi_id = v_nuova_riga where id = a.id;
    v_quante := v_quante + 1;
  end loop;

  if v_nuovo is null then
    -- Secondo clic: il riordino c'è già.
    select rp.purchase_order_id into v_esistente
      from public.arrivi_posizione x join public.purchase_order_items rp on rp.id = x.riordino_poi_id
     where x.id = any (p_esiti) limit 1;
    if v_esistente is null then
      raise exception 'Questi pezzi non sono da riordinare.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('purchase_order_id', v_esistente, 'riordinati', 0, 'gia_fatto', true);
  end if;
  return jsonb_build_object('purchase_order_id', v_nuovo, 'riordinati', v_quante, 'gia_fatto', false,
                            'numero', (select oda_number from public.purchase_orders where id = v_nuovo));
end;
$function$;

-- ── Il riordino arriva, si annulla, si cancella ─────────────────────────────
create or replace function public.arrivo_poi_ricevuto()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_delta numeric := coalesce(new.quantity_received, 0) - coalesce(old.quantity_received, 0);
  r public.arrivi_posizione%rowtype;
  v_q numeric;
begin
  if not public.riga_e_su_misura(new.order_item_id) then
    return null;
  end if;
  if v_delta > 0 and new.riordino_motivo is not null then
    for r in select * from public.arrivi_posizione a
              where a.riordino_poi_id = new.id and a.stato = 'riordinato'
              order by a.creato_il, a.id for update loop
      exit when v_delta <= 0;
      v_q := least(v_delta, r.quantita);
      if v_q < r.quantita then
        insert into public.arrivi_posizione (company_id, purchase_order_id, purchase_order_item_id, order_item_id, ddt_ricezione_id,
                                             esito, quantita, stato, foto, nota, riordino_poi_id, creato_da, creato_il)
        values (r.company_id, r.purchase_order_id, r.purchase_order_item_id, r.order_item_id, r.ddt_ricezione_id,
                r.esito, r.quantita - v_q, 'riordinato', r.foto, r.nota, r.riordino_poi_id, r.creato_da, r.creato_il);
      end if;
      update public.arrivi_posizione set quantita = v_q, stato = 'sostituito', chiuso_il = now() where id = r.id;
      update public.purchase_order_items
         set quantity_received = coalesce(quantity_received, 0) + v_q, received_date = current_date
       where id = r.purchase_order_item_id;
      perform public.arrivo_avanza_ordine(r.purchase_order_id);
      v_delta := v_delta - v_q;
    end loop;
  end if;
  perform public.arrivo_allinea_riga(new.order_item_id);
  return null;
end;
$function$;

drop trigger if exists arrivo_poi_ricevuto on public.purchase_order_items;
create trigger arrivo_poi_ricevuto
  after update of quantity_received on public.purchase_order_items
  for each row
  when (new.order_item_id is not null and new.quantity_received is distinct from old.quantity_received)
  execute function public.arrivo_poi_ricevuto();

create or replace function public.arrivo_riordino_annullato()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_table_name = 'purchase_orders' then
    if new.status = 'annullato' and old.status is distinct from 'annullato' then
      update public.arrivi_posizione a
         set stato = 'aperto', riordino_poi_id = null
       where a.stato = 'riordinato'
         and a.riordino_poi_id in (select p.id from public.purchase_order_items p where p.purchase_order_id = new.id);
    end if;
    return null;
  end if;
  update public.arrivi_posizione a set stato = 'aperto', riordino_poi_id = null
   where a.stato = 'riordinato' and a.riordino_poi_id = old.id;
  return old;
end;
$function$;

drop trigger if exists arrivo_riordino_annullato on public.purchase_orders;
create trigger arrivo_riordino_annullato
  after update of status on public.purchase_orders
  for each row execute function public.arrivo_riordino_annullato();

drop trigger if exists arrivo_riordino_tolto on public.purchase_order_items;
create trigger arrivo_riordino_tolto
  before delete on public.purchase_order_items
  for each row when (old.riordino_motivo is not null)
  execute function public.arrivo_riordino_annullato();

-- ── Cosa manca, per commessa e per telefono ─────────────────────────────────
create or replace function public.arrivo_commessa(p_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_ris jsonb;
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = v_company) then
    raise exception 'Commessa non trovata.' using errcode = 'P0002';
  end if;
  if not public.arrivo_puo_registrare(v_company, p_order_id) then
    raise exception 'Non puoi vedere l''arrivo di questa merce.' using errcode = '42501';
  end if;

  with righe as (
    select oi.id, oi.name, oi.riferimento, oi.gruppo_id, c.*,
           case when c.quantita > 0 and c.buoni >= c.quantita then 'arrivata'
                when c.danneggiati + c.sbagliati > 0 then 'da_sostituire'
                when c.buoni > 0 then 'parziale'
                when c.ordinata <= 0 then 'non_ordinata'
                else 'non_arrivata' end as stato,
           (select jsonb_agg(distinct jsonb_build_object('id', po.id, 'numero', po.oda_number))
              from public.purchase_order_items p join public.purchase_orders po on po.id = p.purchase_order_id
             where p.order_item_id = oi.id and po.status <> 'annullato') as ordini
      from public.order_items oi
      cross join lateral public.arrivo_conti(oi.id) c
     where oi.order_id = p_order_id and (oi.gruppo_id is not null or oi.measure_status is not null)
  )
  select jsonb_build_object(
    'posizioni', count(*),
    'arrivate', count(*) filter (where stato = 'arrivata'),
    'da_sostituire', count(*) filter (where stato = 'da_sostituire'),
    'parziali', count(*) filter (where stato = 'parziale'),
    'non_arrivate', count(*) filter (where stato = 'non_arrivata'),
    'non_ordinate', count(*) filter (where stato = 'non_ordinata'),
    'pezzi_posabili', coalesce(sum(buoni), 0),
    'pezzi_totali', coalesce(sum(quantita), 0),
    'righe', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'nome', name, 'riferimento', riferimento, 'stato', stato, 'quantita', quantita, 'buoni', buoni,
      'danneggiati', danneggiati, 'sbagliati', sbagliati, 'in_riordino', in_riordino, 'non_arrivati', non_arrivati,
      'ordini', coalesce(ordini, '[]'::jsonb)) order by riferimento nulls last, name), '[]'::jsonb)
  ) into v_ris from righe;
  return v_ris;
end;
$function$;

create or replace function public.arrivo_da_spuntare()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x order by x->>'previsto' nulls last), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', po.id, 'numero', po.oda_number, 'fornitore', s.name, 'previsto', po.expected_delivery_date,
               'commessa', o.order_code, 'cliente', coalesce(nullif(btrim(coalesce(o.client_name, '')), ''), o.description),
               'posizioni', count(*), 'pezzi_da_ricevere', sum(greatest(p.quantity - coalesce(p.quantity_received, 0), 0))) as x
        from public.purchase_orders po
        join public.purchase_order_items p on p.purchase_order_id = po.id
        join public.order_items oi on oi.id = p.order_item_id
        join public.orders o on o.id = oi.order_id
        left join public.suppliers s on s.id = po.supplier_id
       where po.company_id = public.get_my_company_id()
         and po.status in ('inviato', 'confermato', 'parziale')
         and (oi.gruppo_id is not null or oi.measure_status is not null)
         and public.arrivo_puo_registrare(po.company_id, oi.order_id)
       group by po.id, po.oda_number, s.name, po.expected_delivery_date, o.order_code, o.client_name, o.description
      having sum(greatest(p.quantity - coalesce(p.quantity_received, 0), 0)) > 0
       limit 30
    ) t;
$function$;

revoke all on function public.riga_e_su_misura(uuid) from public, anon, authenticated;
revoke all on function public.arrivo_puo_registrare(uuid, uuid) from public, anon, authenticated;
revoke all on function public.arrivo_puo_riordinare(uuid, uuid) from public, anon, authenticated;
revoke all on function public.arrivo_conti(uuid) from public, anon, authenticated;
revoke all on function public.arrivo_allinea_riga(uuid) from public, anon, authenticated;
revoke all on function public.arrivo_avanza_ordine(uuid) from public, anon, authenticated;
revoke all on function public.arrivo_chiudi_aperte(uuid, text[], numeric) from public, anon, authenticated;
revoke all on function public.arrivo_poi_ricevuto() from public, anon, authenticated;
revoke all on function public.arrivo_riordino_annullato() from public, anon, authenticated;

revoke all on function public.arrivo_elenco(uuid, uuid) from public, anon;
revoke all on function public.arrivo_registra(uuid, jsonb, uuid, text, date, uuid) from public, anon;
revoke all on function public.arrivo_riordina(uuid[], boolean) from public, anon;
revoke all on function public.arrivo_commessa(uuid) from public, anon;
revoke all on function public.arrivo_da_spuntare() from public, anon;
grant execute on function public.arrivo_elenco(uuid, uuid) to authenticated;
grant execute on function public.arrivo_registra(uuid, jsonb, uuid, text, date, uuid) to authenticated;
grant execute on function public.arrivo_riordina(uuid[], boolean) to authenticated;
grant execute on function public.arrivo_commessa(uuid) to authenticated;
grant execute on function public.arrivo_da_spuntare() to authenticated;
