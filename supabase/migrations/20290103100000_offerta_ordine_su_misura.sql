-- Offerta e ordine dei beni su misura (08/11/2026), piano articoli su misura, fase 5.
--
-- Una riga per posizione con Rif., misure, tipo di misura, colore e apertura: il valore si
-- ferma sulla riga dell'offerta e dell'ordine, e dichiara sempre quali misure sono.
-- Lo copia il database, così vale per ogni punto che crea un ordine.
-- Una riga non aggiudicata si può richiedere a un altro fornitore.
-- Un ordine non esce dalla bozza con righe da rilevare, salvo «Ordina comunque» col motivo.
-- Un'offerta a corpo si ripartisce sui mq delle posizioni.
--
-- Colonne facoltative e funzioni: tocca solo le poche righe di richiesta già collegate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.supplier_rfq_items
  add column if not exists order_item_id uuid references public.order_items(id) on delete set null,
  add column if not exists riferimento text,
  add column if not exists misure jsonb,
  add column if not exists misure_fonte text,
  add column if not exists misura_tipo text,
  add column if not exists colore text,
  add column if not exists apertura text,
  add column if not exists misure_testo text;

alter table public.purchase_order_items
  add column if not exists rfq_item_id uuid references public.supplier_rfq_items(id) on delete set null,
  add column if not exists riferimento text,
  add column if not exists misure jsonb,
  add column if not exists misure_fonte text,
  add column if not exists misura_tipo text,
  add column if not exists colore text,
  add column if not exists apertura text,
  add column if not exists misure_testo text,
  add column if not exists ripartito boolean not null default false;

alter table public.purchase_orders
  add column if not exists ordina_comunque_motivo text,
  add column if not exists ordina_comunque_il timestamptz,
  add column if not exists ordina_comunque_da uuid,
  add column if not exists ordina_comunque_righe uuid[];

comment on column public.supplier_rfq_items.misure is 'Le misure chieste al fornitore, ferme a quel momento. Diverse da quelle di oggi = offerta su misure vecchie.';
comment on column public.supplier_rfq_items.misure_fonte is 'Quali misure sono: da_ordinare, rilevate, provvisorie o nessuna.';
comment on column public.supplier_rfq_items.misure_testo is 'Rif., misure, tipo di misura, colore e apertura come li legge il fornitore.';
comment on column public.purchase_order_items.rfq_item_id is 'La voce dell''offerta da cui viene: il costo della riga ha fonte «offerta».';
comment on column public.purchase_order_items.misure is 'Le misure ordinate: seguono la commessa finché l''ordine è in bozza, poi restano ferme.';
comment on column public.purchase_order_items.misure_testo is 'Rif., misure, tipo di misura, colore e apertura come li legge il fornitore.';
comment on column public.purchase_order_items.ripartito is 'Prezzo ricavato da un''offerta a corpo, ripartita sui mq delle posizioni.';
comment on column public.purchase_orders.ordina_comunque_motivo is 'Perché l''ordine è partito con misure non ancora confermate.';
comment on column public.purchase_orders.ordina_comunque_righe is 'Le righe coperte da quel motivo: una riga aggiunta dopo chiede un motivo nuovo.';

create index if not exists supplier_rfq_items_order_item_idx
  on public.supplier_rfq_items (order_item_id) where order_item_id is not null;
create index if not exists purchase_order_items_rfq_item_idx
  on public.purchase_order_items (rfq_item_id) where rfq_item_id is not null;

-- Un numero scritto da una persona, o niente: mai un errore per un valore sporco.
create or replace function public.misura_num(p text)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when btrim(p) ~ '^[0-9]+([.,][0-9]+)?$' then replace(btrim(p), ',', '.')::numeric end;
$function$;

-- Le misure sempre con gli stessi nomi, in millimetri: larghezza, altezza, profondita, mq, ml, metri, pezzi.
-- `quantita` (il rilievo a mq, ml o pezzi) prende il nome dalla forma della riga.
create or replace function public.misure_leggi(p jsonb, p_forma text default null)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'larghezza', public.misura_num(coalesce(p->>'larghezza_mm', p->>'larghezza', p->>'l', p->>'L', p->>'width')),
      'altezza', public.misura_num(coalesce(p->>'altezza_mm', p->>'altezza', p->>'h', p->>'H', p->>'height')),
      'profondita', public.misura_num(coalesce(p->>'profondita_mm', p->>'profondita', p->>'profondità', p->>'p', p->>'P', p->>'depth')),
      'mq', public.misura_num(coalesce(p->>'mq', p->>'superficie', case when p_forma = 'mq' then p->>'quantita' end)),
      'ml', public.misura_num(coalesce(p->>'ml', case when p_forma = 'ml' then p->>'quantita' end)),
      'metri', public.misura_num(coalesce(p->>'metri', p->>'m', case when p_forma = 'm' then p->>'quantita' end)),
      'pezzi', public.misura_num(coalesce(p->>'pezzi', p->>'pz', case when p_forma = 'pz' or p_forma is null then p->>'quantita' end))
    )), '{}'::jsonb)
  end;
$function$;

create or replace function public.misure_testo_breve(p jsonb)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select nullif(concat_ws(' · ',
    nullif(concat_ws(' × ',
      'L ' || trim_scale((p->>'larghezza')::numeric)::text,
      'P ' || trim_scale((p->>'profondita')::numeric)::text,
      'H ' || trim_scale((p->>'altezza')::numeric)::text), '') || ' mm',
    replace(trim_scale((p->>'mq')::numeric)::text, '.', ',') || ' mq',
    replace(trim_scale((p->>'ml')::numeric)::text, '.', ',') || ' ml',
    replace(trim_scale((p->>'metri')::numeric)::text, '.', ',') || ' m',
    trim_scale((p->>'pezzi')::numeric)::text || ' pz'
  ), '');
$function$;

-- Quello che dell'articolo su misura finisce sull'offerta e sull'ordine. Null per gli articoli normali.
create or replace function public.riga_misure_ordine(oi public.order_items)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  misure jsonb;
  fonte text;
  dettagli text;
  colore text;
  apertura text;
  etichetta text;
  testo_misure text;
  forma text;
begin
  if oi.gruppo_id is null and oi.measure_status is null then
    return null;
  end if;
  forma := to_jsonb(oi)->>'misura_forma';
  misure := public.misure_leggi(oi.misure_da_ordinare, forma);
  if misure is not null then
    fonte := 'da_ordinare';
  else
    misure := public.misure_leggi(oi.misure_rilevate, forma);
    if misure is not null then
      fonte := 'rilevate';
    else
      misure := public.misure_leggi(oi.misure_preventivo, forma);
      fonte := case when misure is not null then 'provvisorie' else 'nessuna' end;
    end if;
  end if;

  if jsonb_typeof(oi.axis_selections) = 'object' then
    select v into colore from jsonb_each_text(oi.axis_selections) a(k, v)
     where k ~* '(colore|colour|ral)' and nullif(btrim(v), '') is not null limit 1;
    select v into apertura from jsonb_each_text(oi.axis_selections) a(k, v)
     where k ~* 'apertura' and nullif(btrim(v), '') is not null limit 1;
  end if;

  dettagli := nullif(btrim(concat_ws(' · ', nullif(btrim(oi.description), ''), nullif(btrim(oi.specifiche), ''))), '');
  if dettagli is not null and nullif(btrim(oi.riferimento), '') is not null
     and left(lower(dettagli), length(btrim(oi.riferimento)) + 3) = lower(btrim(oi.riferimento)) || ' · ' then
    dettagli := nullif(btrim(substr(dettagli, length(btrim(oi.riferimento)) + 4)), '');
  end if;
  if apertura is null then
    apertura := substring(dettagli from '(?i)(anta[ -]?ribalta|alzante[ -]?scorrevole|scorrevole|vasistas|wasistas|bilico|a libro|battente|fisso)');
  end if;

  etichetta := case fonte
    when 'da_ordinare' then 'misure definitive'
    when 'rilevate' then case when oi.measure_status = 'confermato' then 'misure rilevate e confermate' else 'misure rilevate, non ancora confermate' end
    when 'provvisorie' then 'misure provvisorie'
    else 'misure da definire'
  end;
  testo_misure := public.misure_testo_breve(misure);

  return jsonb_strip_nulls(jsonb_build_object(
    'riferimento', nullif(btrim(oi.riferimento), ''),
    'misure', misure,
    'misure_fonte', fonte,
    'misura_tipo', oi.misura_tipo,
    'colore', colore,
    'apertura', apertura,
    'misure_testo', concat_ws(E'\n',
      concat_ws(' — ',
        'Rif. ' || nullif(btrim(oi.riferimento), ''),
        testo_misure,
        case oi.misura_tipo when 'foro' then 'misura foro' when 'telaio' then 'misura telaio' when 'finita' then 'misura finita' end,
        etichetta),
      nullif(concat_ws(' · ', 'Colore: ' || colore, 'Apertura: ' || apertura), ''),
      dettagli)
  ));
end;
$function$;

-- Le righe di un ordine con le misure ancora aperte. Riordini esclusi: quel pezzo è già stato misurato.
create or replace function public._oda_misure_aperte(p_po uuid)
 returns table(order_item_id uuid, riferimento text, nome text, stato text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct oi.id, oi.riferimento, oi.name, oi.measure_status
    from public.purchase_order_items p
    join public.order_items oi on oi.id = p.order_item_id
   where p.purchase_order_id = p_po
     and p.riordino_motivo is null
     and oi.measure_status in ('da_rilevare', 'rilevato');
$function$;

create or replace function public.oda_misure_da_confermare(p_po uuid)
 returns table(order_item_id uuid, riferimento text, nome text, stato text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
begin
  select po.company_id into azienda from public.purchase_orders po where po.id = p_po;
  if azienda is null or not public.user_can_access_company(azienda) then
    raise exception 'Ordine non accessibile' using errcode = '42501';
  end if;
  return query
    select a.order_item_id, a.riferimento, a.nome, a.stato
      from public._oda_misure_aperte(p_po) a
      join public.purchase_orders po on po.id = p_po
     where not (a.order_item_id = any(coalesce(po.ordina_comunque_righe, '{}')));
end;
$function$;

create or replace function public.oda_ordina_comunque(p_po uuid, p_motivo text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  po public.purchase_orders;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  righe uuid[];
begin
  select * into po from public.purchase_orders where id = p_po for update;
  if not found or not public.user_can_access_company(po.company_id) then
    raise exception 'Ordine non accessibile' using errcode = '42501';
  end if;
  if not (public.materiali_puo('can_manage_purchasing', po.company_id) or public.materiali_puo('can_edit_orders', po.company_id)) then
    raise exception 'Gli acquisti li fa l''ufficio acquisti (o chi modifica le commesse)' using errcode = '42501';
  end if;
  if motivo is null or length(motivo) < 5 then
    raise exception 'Scrivi il motivo: serve a capire domani perché l''ordine è partito così' using errcode = '22023';
  end if;
  select array_agg(a.order_item_id) into righe from public._oda_misure_aperte(p_po) a;
  update public.purchase_orders
     set ordina_comunque_motivo = motivo,
         ordina_comunque_il = now(),
         ordina_comunque_da = auth.uid(),
         ordina_comunque_righe = coalesce(righe, '{}')
   where id = p_po;
  if po.order_id is not null then
    insert into public.order_events (company_id, order_id, event_type, payload)
    values (po.company_id, po.order_id, 'ordine_fornitore_senza_misure',
            jsonb_build_object('po_id', po.id, 'oda_number', po.oda_number, 'motivo', motivo, 'righe', coalesce(array_length(righe, 1), 0)));
  end if;
  return coalesce(array_length(righe, 1), 0);
end;
$function$;

-- Il blocco: uscendo dalla bozza, ogni riga con le misure aperte deve avere un motivo scritto.
create or replace function public.purchase_orders_blocco_misure()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  aperte integer;
  esempio text;
begin
  if old.status is distinct from 'bozza' or new.status in ('bozza', 'annullato') then
    return new;
  end if;
  select count(*), min(coalesce('«' || a.riferimento || '» ', '') || a.nome) into aperte, esempio
    from public._oda_misure_aperte(new.id) a
   where not (a.order_item_id = any(coalesce(new.ordina_comunque_righe, '{}')));
  if aperte > 0 then
    raise exception 'Misure da confermare su % posizioni (%): confermale oppure usa «Ordina comunque» scrivendo il motivo.', aperte, esempio
      using errcode = 'MIS01';
  end if;
  return new;
end;
$function$;

drop trigger if exists purchase_orders_blocco_misure on public.purchase_orders;
create trigger purchase_orders_blocco_misure
  before update of status on public.purchase_orders
  for each row execute function public.purchase_orders_blocco_misure();

-- La riga d'ordine si copia le misure. Vale per ogni punto che crea un ordine.
create or replace function public.purchase_order_items_copia_misure()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  oi public.order_items;
  d jsonb;
  stato_po text;
  coperte uuid[];
begin
  if new.order_item_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.order_item_id is not distinct from old.order_item_id then
    return new;
  end if;
  select * into oi from public.order_items where id = new.order_item_id;
  d := public.riga_misure_ordine(oi);
  if d is null then
    return new;
  end if;
  new.riferimento := d->>'riferimento';
  new.misure := d->'misure';
  new.misure_fonte := d->>'misure_fonte';
  new.misura_tipo := d->>'misura_tipo';
  new.colore := d->>'colore';
  new.apertura := d->>'apertura';
  new.misure_testo := d->>'misure_testo';
  -- Due posizioni con lo stesso nome si devono distinguere anche negli elenchi.
  if d->>'riferimento' is not null and position(lower(d->>'riferimento') in lower(new.description)) = 0 then
    new.description := new.description || ' — ' || (d->>'riferimento');
  end if;

  -- Una riga aggiunta a un ordine già partito passa dallo stesso controllo.
  select po.status, po.ordina_comunque_righe into stato_po, coperte
    from public.purchase_orders po where po.id = new.purchase_order_id;
  if stato_po not in ('bozza', 'annullato')
     and oi.measure_status in ('da_rilevare', 'rilevato')
     and new.riordino_motivo is null
     and not (oi.id = any(coalesce(coperte, '{}'))) then
    raise exception 'Misure da confermare su «%»: l''ordine è già partito. Confermale oppure usa «Ordina comunque» scrivendo il motivo.', oi.name
      using errcode = 'MIS01';
  end if;
  return new;
end;
$function$;

drop trigger if exists purchase_order_items_copia_misure on public.purchase_order_items;
create trigger purchase_order_items_copia_misure
  before insert or update of order_item_id on public.purchase_order_items
  for each row execute function public.purchase_order_items_copia_misure();

-- Le misure cambiate in commessa arrivano sulle righe degli ordini ancora in bozza. Mai su quelli partiti.
create or replace function public.order_items_misure_in_bozza()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d jsonb;
begin
  d := public.riga_misure_ordine(new);
  if d is null then
    return null;
  end if;
  update public.purchase_order_items p
     set riferimento = d->>'riferimento',
         misure = d->'misure',
         misure_fonte = d->>'misure_fonte',
         misura_tipo = d->>'misura_tipo',
         colore = d->>'colore',
         apertura = d->>'apertura',
         misure_testo = d->>'misure_testo'
    from public.purchase_orders po
   where p.order_item_id = new.id
     and po.id = p.purchase_order_id
     and po.status = 'bozza'
     and p.misure_testo is distinct from d->>'misure_testo';
  return null;
end;
$function$;

drop trigger if exists order_items_misure_in_bozza on public.order_items;
create trigger order_items_misure_in_bozza
  after update of misure_da_ordinare, misure_rilevate, misure_preventivo, measure_status, misura_tipo, riferimento, description, specifiche, axis_selections
  on public.order_items
  for each row
  when (new.gruppo_id is not null or new.measure_status is not null)
  execute function public.order_items_misure_in_bozza();

-- Il costo ha fonte «offerta» solo se la riga d'ordine viene davvero da un'offerta aggiudicata.
create or replace function public.materiali_prezzo_da_ordine()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  prezzo numeric;
begin
  -- Un riordino non cambia il costo: lo stesso pezzo, rifatto.
  if new.order_item_id is null or coalesce(new.unit_price, 0) <= 0 or new.riordino_motivo is not null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.unit_price is not distinct from old.unit_price
     and new.discount_percent is not distinct from old.discount_percent
     and new.order_item_id is not distinct from old.order_item_id then
    return null;
  end if;
  if exists (select 1 from public.purchase_orders po
              where po.id = new.purchase_order_id and po.status = 'annullato') then
    return null;
  end if;
  prezzo := round(new.unit_price * (1 - coalesce(new.discount_percent, 0) / 100), 4);
  update public.order_items oi
     set prezzo_prima_ordine = case
           when oi.prezzo_fonte in ('ordine', 'offerta') then oi.prezzo_prima_ordine
           else jsonb_build_object('prezzo', oi.purchase_price, 'fonte', oi.prezzo_fonte)
         end,
         purchase_price = prezzo,
         prezzo_fonte = case when new.rfq_item_id is not null then 'offerta' else 'ordine' end,
         prezzo_aggiornato_il = now()
   where oi.id = new.order_item_id
     and exists (select 1 from public.orders o
                  where o.id = oi.order_id and o.company_id = new.company_id)
     and (oi.origine_materiale is not null
          or oi.gruppo_id is not null
          or coalesce(oi.purchase_price, 0) = 0)
     and oi.purchase_price is distinct from prezzo;
  return null;
end;
$function$;

-- Le voci già richieste sanno da quale articolo vengono, anche quando l'articolo passa a un'altra richiesta.
update public.supplier_rfq_items ri
   set order_item_id = oi.id
  from public.order_items oi
 where oi.supplier_rfq_item_id = ri.id
   and ri.order_item_id is null;

create or replace function public.acquisti_richiedi_offerta(p_items uuid[], p_titolo text, p_fornitori uuid[] DEFAULT '{}'::uuid[], p_scadenza date DEFAULT NULL::date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  commesse uuid[];
  rfq uuid;
  m record;
  oi public.order_items;
  d jsonb;
  item uuid;
  pos integer := 0;
  gia text;
  fornitori uuid[] := coalesce(p_fornitori, '{}');
begin
  select min(c.company_id::text)::uuid, array_agg(distinct c.order_id) into azienda, commesse
    from public.acquisti_materiali_controllati(p_items) c;

  -- Doppio clic e due schede passano uno alla volta: il secondo trova la richiesta del primo.
  perform 1 from public.order_items x where x.id = any(p_items) order by x.id for update;

  select oi2.name || ' (' || r.rfq_number || ')' into gia
    from public.order_items oi2
    join public.supplier_rfq_items ri on ri.id = oi2.supplier_rfq_item_id or ri.order_item_id = oi2.id
    join public.supplier_rfqs r on r.id = ri.rfq_id
   where oi2.id = any(p_items) and r.status = 'aggiudicata'
   limit 1;
  if gia is not null then
    raise exception 'Questo materiale è già stato aggiudicato: %', gia using errcode = '22023';
  end if;

  if cardinality(fornitori) = 0 then
    select oi2.name || ' (' || r.rfq_number || ')' into gia
      from public.order_items oi2
      join public.supplier_rfq_items ri on ri.id = oi2.supplier_rfq_item_id or ri.order_item_id = oi2.id
      join public.supplier_rfqs r on r.id = ri.rfq_id
     where oi2.id = any(p_items) and r.status in ('bozza', 'inviata', 'in_valutazione')
     limit 1;
    if gia is not null then
      raise exception 'Alcuni materiali sono già in una richiesta d''offerta: %. Scegli il fornitore a cui chiederli.', gia using errcode = '22023';
    end if;
  else
    select oi2.name || ' a ' || s.name || ' (' || r.rfq_number || ')' into gia
      from public.order_items oi2
      join public.supplier_rfq_items ri on ri.id = oi2.supplier_rfq_item_id or ri.order_item_id = oi2.id
      join public.supplier_rfqs r on r.id = ri.rfq_id
      join public.supplier_rfq_suppliers rs on rs.rfq_id = r.id
      join public.suppliers s on s.id = rs.supplier_id
     where oi2.id = any(p_items)
       and r.status in ('bozza', 'inviata', 'in_valutazione')
       and rs.supplier_id = any(fornitori)
     limit 1;
    if gia is not null then
      raise exception 'Già chiesto: %', gia using errcode = '22023';
    end if;
  end if;

  insert into public.supplier_rfqs (company_id, titolo, descrizione, order_id, scadenza_offerte, created_by)
  values (azienda, coalesce(nullif(btrim(p_titolo), ''), 'Richiesta d''offerta materiali'),
          'Materiali validati della commessa', case when cardinality(commesse) = 1 then commesse[1] end,
          p_scadenza, auth.uid())
  returning id into rfq;

  perform set_config('app.materiali_sistema', 'on', true);
  for m in select * from public.acquisti_materiali_controllati(p_items) loop
    pos := pos + 1;
    select * into oi from public.order_items x where x.id = m.id;
    d := public.riga_misure_ordine(oi);
    insert into public.supplier_rfq_items (rfq_id, company_id, descrizione, quantita, unita_misura, article_template_id, note, posizione,
                                           order_item_id, riferimento, misure, misure_fonte, misura_tipo, colore, apertura, misure_testo)
    values (rfq, azienda, m.name,
            case when coalesce(m.quantity, 0) > 0 then m.quantity else 1 end,
            coalesce(m.unita_misura, 'pz'), m.article_template_id,
            case when d is null then m.specifiche end, pos,
            m.id, d->>'riferimento', d->'misure', d->>'misure_fonte', d->>'misura_tipo', d->>'colore', d->>'apertura', d->>'misure_testo')
    returning id into item;
    update public.order_items set supplier_rfq_item_id = item where id = m.id;
  end loop;
  perform set_config('app.materiali_sistema', '', true);

  insert into public.supplier_rfq_suppliers (rfq_id, company_id, supplier_id)
  select rfq, azienda, s.id from public.suppliers s
   where s.id = any(fornitori) and s.company_id = azienda;

  return rfq;
end;
$function$;

-- Le voci chieste con misure diverse da quelle di oggi: l'offerta è su misure vecchie.
create or replace function public.rdo_misure_cambiate(p_rfq uuid)
 returns table(rfq_item_id uuid, riferimento text, descrizione text, chieste text, attuali text, fonte_attuale text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
begin
  select r.company_id into azienda from public.supplier_rfqs r where r.id = p_rfq;
  if azienda is null or not public.user_can_access_company(azienda) then
    raise exception 'Richiesta non accessibile' using errcode = '42501';
  end if;
  return query
    select i.id, i.riferimento, i.descrizione,
           public.misure_testo_breve(i.misure),
           public.misure_testo_breve(d.v->'misure'),
           d.v->>'misure_fonte'
      from public.supplier_rfq_items i
      join public.order_items oi on oi.id = i.order_item_id
      cross join lateral (select public.riga_misure_ordine(oi) as v) d
     where i.rfq_id = p_rfq
       and d.v is not null
       and i.misure_fonte is not null
       and i.misure is distinct from d.v->'misure'
     order by i.posizione;
end;
$function$;

-- Per ripartire un'offerta a corpo: quanti mq vale una posizione.
create or replace function public.misure_mq(p jsonb, p_quantita numeric)
 returns numeric
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(
    (p->>'mq')::numeric * coalesce(p_quantita, 1),
    (p->>'larghezza')::numeric * (p->>'altezza')::numeric / 1000000 * coalesce(p_quantita, 1),
    0);
$function$;

create or replace function public.rdo_aggiudica(p_rfq_supplier_id uuid, p_motivazione text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_fornitore record;
  v_rfq record;
  v_po_id uuid;
  v_oda text;
  v_righe int;
  v_netto numeric;
  v_trasporto numeric;
  v_saltate jsonb := '[]'::jsonb;
  v_corpo numeric;
  v_peso_tot numeric;
  v_resto numeric;
  v_quota numeric;
  v_n int;
  v_i int := 0;
  v_usa_mq boolean;
  r record;
begin
  select rs.* into v_fornitore
    from public.supplier_rfq_suppliers rs
   where rs.id = p_rfq_supplier_id;
  if not found then
    raise exception 'Fornitore non trovato nella richiesta' using errcode = '42704';
  end if;
  select r2.* into v_rfq
    from public.supplier_rfqs r2
   where r2.id = v_fornitore.rfq_id
   for update;
  if not found then
    raise exception 'Richiesta non trovata' using errcode = '42704';
  end if;
  if v_rfq.status = 'aggiudicata' then
    raise exception 'Richiesta già aggiudicata: l''ordine c''è già' using errcode = 'P0001';
  end if;
  if v_rfq.status = 'annullata' then
    raise exception 'Richiesta annullata: non si può aggiudicare' using errcode = 'P0001';
  end if;
  if v_fornitore.status <> 'risposta' then
    raise exception 'Questo fornitore non ha ancora un''offerta registrata' using errcode = 'P0001';
  end if;
  if coalesce(v_fornitore.totale_offerto, 0) <= 0 and not exists (
       select 1 from public.supplier_rfq_quotes q
         join public.supplier_rfq_items i on i.id = q.rfq_item_id
        where q.rfq_supplier_id = v_fornitore.id and i.rfq_id = v_rfq.id
          and q.disponibile and q.prezzo_unitario is not null) then
    raise exception 'Nessun prezzo in questa offerta: scrivi i prezzi delle voci o il totale offerto prima di scegliere' using errcode = 'P0001';
  end if;
  if v_fornitore.trasporto_tipo='extra' and v_fornitore.costo_trasporto is null then
    raise exception 'Indica il costo del trasporto extra prima di scegliere';
  end if;
  if v_fornitore.validita_offerta is not null and v_fornitore.validita_offerta < current_date then
    raise exception 'Offerta scaduta: chiedi conferma al fornitore e aggiorna la validità';
  end if;
  v_trasporto:=case when v_fornitore.trasporto_tipo='extra' then coalesce(v_fornitore.costo_trasporto,0) else 0 end;
  select sum(round(i.quantita*q.prezzo_unitario*(1-coalesce(q.sconto_percentuale,0)/100),2)) into v_netto
    from public.supplier_rfq_items i join public.supplier_rfq_quotes q on q.rfq_item_id=i.id
    where i.rfq_id=v_rfq.id and q.rfq_supplier_id=v_fornitore.id and q.disponibile and q.prezzo_unitario is not null;
  if v_netto is not null and v_fornitore.totale_offerto is not null and abs(v_fornitore.totale_offerto-v_netto-v_trasporto)>0.02 then
    raise exception 'Il totale documento non coincide con le voci e il trasporto: correggi gli importi prima di scegliere';
  end if;
  if v_netto is null and v_fornitore.totale_offerto < v_trasporto then
    raise exception 'Il totale documento deve comprendere anche il trasporto';
  end if;

  -- Due richieste aperte sulla stessa riga: passa una aggiudicazione alla volta.
  perform pg_advisory_xact_lock(hashtextextended('rdo_aggiudica:' || v_rfq.company_id::text, 0));

  -- La voce già coperta da un altro ordine non si ordina due volte.
  select coalesce(jsonb_agg(jsonb_build_object('rfq_item_id', i.id, 'descrizione', i.descrizione, 'oda', c.oda_number)), '[]'::jsonb)
    into v_saltate
    from public.supplier_rfq_items i
    cross join lateral (
      select min(po.oda_number) as oda_number, sum(p.quantity) as coperta
        from public.purchase_order_items p
        join public.purchase_orders po on po.id = p.purchase_order_id
       where p.order_item_id = i.order_item_id
         and po.status <> 'annullato'
         and p.riordino_motivo is null) c
   where i.rfq_id = v_rfq.id and i.order_item_id is not null
     and c.coperta >= i.quantita;

  insert into public.purchase_orders (
    company_id, supplier_id, order_id, expected_delivery_date, payment_terms, origine, notes, created_by
  ) values (
    v_rfq.company_id,
    v_fornitore.supplier_id,
    v_rfq.order_id,
    v_rfq.data_fabbisogno,
    v_fornitore.condizioni_pagamento,
    case v_fornitore.inviata_via
      when 'telefono' then 'telefono'
      when 'whatsapp' then 'telefono'
      when 'di_persona' then 'negozio'
      else 'email'
    end,
    concat_ws(E'\n','Da richiesta d''offerta ' || v_rfq.rfq_number || ' — ' || v_rfq.titolo,
      case when v_fornitore.giorni_consegna is not null then 'Consegna: ' || v_fornitore.giorni_consegna || ' giorni' end,
      case v_fornitore.trasporto_tipo when 'incluso' then 'Trasporto incluso' when 'ritiro' then 'Ritiro a cura dell’impresa' when 'extra' then 'Trasporto extra: ' || v_trasporto || ' EUR, IVA esclusa' else 'Trasporto da confermare' end,
      nullif(v_fornitore.disponibilita_note,'')),
    auth.uid()
  )
  returning id, oda_number into v_po_id, v_oda;

  insert into public.purchase_order_items (
    purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku, order_item_id, rfq_item_id
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, 'pz'),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         coalesce(q.aliquota_iva, 22), i.sku,
         coalesce(i.order_item_id,
           (select oi.id from public.order_items oi
              join public.orders o on o.id = oi.order_id
             where oi.supplier_rfq_item_id = i.id and o.company_id = v_rfq.company_id
             limit 1)),
         i.id
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id
   where i.rfq_id = v_rfq.id
     and q.disponibile
     and q.prezzo_unitario is not null
     and not exists (select 1 from jsonb_array_elements(v_saltate) s where (s->>'rfq_item_id')::uuid = i.id)
   order by i.posizione;
  get diagnostics v_righe = row_count;

  if v_righe = 0 and coalesce(v_fornitore.totale_offerto, 0) > 0 then
    v_corpo := v_fornitore.totale_offerto - v_trasporto;
    select count(*), sum(public.misure_mq(i.misure, i.quantita)), bool_and(public.misure_mq(i.misure, i.quantita) > 0)
      into v_n, v_peso_tot, v_usa_mq
      from public.supplier_rfq_items i
     where i.rfq_id = v_rfq.id and i.misure_fonte is not null and i.order_item_id is not null
       and not exists (select 1 from jsonb_array_elements(v_saltate) s where (s->>'rfq_item_id')::uuid = i.id);

    if coalesce(v_n, 0) > 0 and v_corpo > 0
       and not exists (select 1 from public.supplier_rfq_items i
                        where i.rfq_id = v_rfq.id and (i.misure_fonte is null or i.order_item_id is null)) then
      -- A corpo su posizioni su misura: ognuna prende la sua parte, sui mq o, se ne manca uno, sui pezzi.
      if not coalesce(v_usa_mq, false) then
        select sum(i.quantita) into v_peso_tot from public.supplier_rfq_items i
         where i.rfq_id = v_rfq.id
           and not exists (select 1 from jsonb_array_elements(v_saltate) s where (s->>'rfq_item_id')::uuid = i.id);
      end if;
      v_resto := v_corpo;
      for r in
        select i.*, case when v_usa_mq then public.misure_mq(i.misure, i.quantita) else i.quantita end as peso
          from public.supplier_rfq_items i
         where i.rfq_id = v_rfq.id
           and not exists (select 1 from jsonb_array_elements(v_saltate) s where (s->>'rfq_item_id')::uuid = i.id)
         order by i.posizione
      loop
        v_i := v_i + 1;
        v_quota := case when v_i = v_n then v_resto else round(v_corpo * r.peso / v_peso_tot, 2) end;
        v_resto := v_resto - v_quota;
        insert into public.purchase_order_items (
          purchase_order_id, company_id, description, quantity, unit_of_measure, unit_price,
          discount_percent, vat_rate, order_item_id, rfq_item_id, ripartito
        ) values (
          v_po_id, v_rfq.company_id, r.descrizione, r.quantita, coalesce(r.unita_misura, 'pz'),
          round(v_quota / r.quantita, 4), 0, 22, r.order_item_id, r.id, true
        );
      end loop;
      v_righe := v_n;
    elsif jsonb_array_length(v_saltate) = 0 then
      insert into public.purchase_order_items (
        purchase_order_id, company_id, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate
      ) values (
        v_po_id, v_rfq.company_id, 'Fornitura a corpo — ' || v_rfq.titolo, 1, 'corpo', v_corpo, 0, 22
      );
      v_righe := 1;
    end if;
  end if;

  if v_righe = 0 then
    raise exception 'Tutte le voci di questa offerta sono già in un altro ordine: non c''è niente da aggiudicare' using errcode = 'P0001';
  end if;

  if v_trasporto>0 then
    insert into public.purchase_order_items(purchase_order_id,company_id,description,quantity,unit_of_measure,unit_price,discount_percent,vat_rate)
    values(v_po_id,v_rfq.company_id,'Trasporto fornitura',1,'corpo',v_trasporto,0,22);
    v_righe:=v_righe+1;
  end if;
  update public.supplier_rfqs
     set status = 'aggiudicata',
         supplier_id_aggiudicato = v_fornitore.supplier_id,
         purchase_order_id = v_po_id,
         aggiudicata_at = now(),
         motivazione_scelta = nullif(btrim(coalesce(p_motivazione, '')), '')
   where id = v_rfq.id;
  return jsonb_build_object('purchase_order_id', v_po_id, 'oda_number', v_oda, 'righe', v_righe, 'saltate', v_saltate);
end;
$function$;

revoke all on function public.misura_num(text) from public, anon;
revoke all on function public.misure_leggi(jsonb, text) from public, anon;
revoke all on function public.misure_testo_breve(jsonb) from public, anon;
revoke all on function public.misure_mq(jsonb, numeric) from public, anon;
grant execute on function public.misure_mq(jsonb, numeric) to authenticated, service_role;
revoke all on function public.riga_misure_ordine(public.order_items) from public, anon, authenticated;
revoke all on function public._oda_misure_aperte(uuid) from public, anon, authenticated;
revoke all on function public.purchase_orders_blocco_misure() from public, anon, authenticated;
revoke all on function public.purchase_order_items_copia_misure() from public, anon, authenticated;
revoke all on function public.order_items_misure_in_bozza() from public, anon, authenticated;
revoke all on function public.oda_misure_da_confermare(uuid) from public, anon;
grant execute on function public.oda_misure_da_confermare(uuid) to authenticated, service_role;
revoke all on function public.oda_ordina_comunque(uuid, text) from public, anon;
grant execute on function public.oda_ordina_comunque(uuid, text) to authenticated, service_role;
revoke all on function public.rdo_misure_cambiate(uuid) from public, anon;
grant execute on function public.rdo_misure_cambiate(uuid) to authenticated, service_role;
