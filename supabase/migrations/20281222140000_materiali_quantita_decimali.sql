-- Quantità dei materiali con i decimali.
--
-- order_items.quantity era un intero: il generatore della distinta calcolava
-- 12,4 kg e scriveva 13; 0,3 m³ diventavano 1. Il decimale restava in
-- quantita_calcolata, ma ordini (purchase_order_items.quantity, numeric) e
-- riconciliazione leggono quantity, quindi il conto non tornava: ordinando
-- 12,4 restava un residuo di 0,6 che nessuno poteva chiudere, ordinandone 13
-- l'eccedenza vera non si vedeva. Primo passo del piano
-- docs/piano-fabbisogno-acquisti-da-progetto.md.
--
-- Cosa cambia:
--   * order_items.quantity e quantity_received → numeric(14,4). La vista
--     v_ordine_articoli_costi dipende dalla colonna: si toglie e si rimette
--     identica (security_invoker, stessi permessi, stesso commento).
--   * Le tre funzioni che restituivano o ricevevano «quantity integer» si
--     rifanno col tipo nuovo (cambiare il tipo restituito vuole DROP + CREATE).
--   * materiali_salva_generazione scrive la quantità calcolata così com'è (il
--     generatore arrotonda già: pezzi interi per cad/pz, due decimali per il
--     resto). Una riga è «cambiata a mano» se non coincide né col calcolo né
--     col vecchio arrotondamento all'intero, così le righe di prima non
--     sembrano modifiche del tecnico.
--   * acquisti_richiedi_offerta non porta più a 1 le quantità sotto l'unità.
--   * Il magazzino resta a pezzi interi: le prenotazioni sulla giacenza
--     arrotondano per eccesso, nello stesso modo quando prenotano e quando
--     rilasciano, così 12,5 non lascia mezzo pezzo impegnato per sempre.
--
-- La tabella ha circa 1.400 righe: la riscrittura è istantanea. lock_timeout
-- comunque, per non mettersi in coda dietro a una transazione lunga.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Colonne ────────────────────────────────────────────────────────────────

drop view if exists public.v_ordine_articoli_costi;

-- «AFTER UPDATE OF … quantity» lega il trigger alla colonna: senza toglierlo
-- il tipo non si cambia. Si rimette identico subito dopo.
drop trigger if exists oi_reserve_on_update on public.order_items;

alter table public.order_items
  alter column quantity type numeric(14,4) using quantity::numeric(14,4),
  alter column quantity_received type numeric(14,4) using quantity_received::numeric(14,4);

create trigger oi_reserve_on_update
  after update of fulfillment_status, stock_item_id, quantity on public.order_items
  for each row execute function public.trg_oi_reserve_on_update();

create view public.v_ordine_articoli_costi
with (security_invoker = true) as
 select oi.id as order_item_id,
    oi.order_id,
    o.company_id,
    o.order_code,
    oi.article_template_id,
    coalesce(nullif(btrim(oi.categoria), ''::text), at.category, 'Senza categoria'::text) as categoria,
    oi.name,
    oi.quantity,
    round(coalesce(oi.standard_cost, 0::numeric) * oi.quantity::numeric, 2) as costo_standard,
    round(coalesce(nullif((select sum(poi.line_total) as sum
           from public.purchase_order_items poi
          where poi.order_item_id = oi.id), 0::numeric), coalesce(oi.purchase_price, 0::numeric) * oi.quantity::numeric), 2) as costo_reale,
        case
            when (exists (select 1
               from public.purchase_order_items poi
              where poi.order_item_id = oi.id)) then 'oda'::text
            when oi.stock_item_id is not null then 'magazzino'::text
            else 'manuale'::text
        end as fonte_costo,
    oi.standard_cost is not null and oi.standard_cost > 0::numeric as ha_baseline_listino,
    o.created_at
   from public.order_items oi
     join public.orders o on o.id = oi.order_id
     left join public.article_templates at on at.id = oi.article_template_id;

comment on view public.v_ordine_articoli_costi is
  'Costo per riga commessa: standard (listino) vs reale (ODA se presente, altrimenti purchase_price manuale/magazzino). Base per analisi prodotto/categoria nel Controllo di Gestione. security_invoker=true.';

revoke all on public.v_ordine_articoli_costi from public, anon;
grant all on public.v_ordine_articoli_costi to authenticated, service_role;

-- ─── Funzioni che restituivano quantity integer ─────────────────────────────

drop function if exists public.acquisti_materiali_controllati(uuid[]);
create function public.acquisti_materiali_controllati(p_items uuid[])
 returns table(id uuid, order_id uuid, company_id uuid, name text, specifiche text, unita_misura text, quantity numeric, article_template_id uuid, supplier_rfq_item_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  aziende integer;
  trovate integer;
  azienda uuid;
begin
  if coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'Seleziona almeno un materiale' using errcode = '22023';
  end if;
  select count(distinct o.company_id), count(*), min(o.company_id::text)::uuid into aziende, trovate, azienda
    from public.order_items oi join public.orders o on o.id = oi.order_id
   where oi.id = any(p_items);
  if trovate <> (select count(distinct x) from unnest(p_items) x) or aziende <> 1
     or not public.materiali_utente_in_azienda(azienda) then
    raise exception 'Materiali non trovati' using errcode = 'P0002';
  end if;
  if not (public.materiali_puo('can_manage_purchasing', azienda) or public.materiali_puo('can_edit_orders', azienda)) then
    raise exception 'Gli acquisti li fa l''ufficio acquisti (o chi modifica le commesse)' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_items oi where oi.id = any(p_items) and oi.natura_riga <> 'materiale') then
    raise exception 'Solo i materiali si comprano: lavorazioni e descrizioni no' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_items oi
               join public.materiali_fasi_validazione v on v.phase_id = oi.phase_id
              where oi.id = any(p_items) and v.stato <> 'validata') then
    raise exception 'Alcuni materiali sono di fasi non ancora validate dal tecnico' using errcode = '22023';
  end if;
  return query
    select oi.id, oi.order_id, o.company_id, oi.name, oi.specifiche, oi.unita_misura, oi.quantity,
           oi.article_template_id, oi.supplier_rfq_item_id
      from public.order_items oi join public.orders o on o.id = oi.order_id
     where oi.id = any(p_items)
     order by oi.order_id, oi.phase_id, oi.position;
end;
$function$;
revoke all on function public.acquisti_materiali_controllati(uuid[]) from public, anon, authenticated;
grant execute on function public.acquisti_materiali_controllati(uuid[]) to service_role;

drop function if exists public.acquisti_materiali_da_ordinare(uuid);
create function public.acquisti_materiali_da_ordinare(p_company uuid)
 returns table(id uuid, order_id uuid, name text, description text, quantity numeric, status text, supplier_id uuid, purchase_price numeric, vat_rate numeric, phase_id uuid, unita_misura text, specifiche text, origine_materiale text, quantita_calcolata numeric, origini jsonb, locale text, supplier_rfq_item_id uuid, stock_item_id uuid, posizioni jsonb, rfq_id uuid, commessa text, fase text, posizione_fase integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_company is null then
    return;
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return;
  end if;
  if p_company is distinct from public.get_effective_company_id()
     and not public.has_role(uid, 'super_admin'::public.app_role) then
    return;
  end if;
  if not (public.materiali_puo('can_manage_purchasing', p_company)
          or public.materiali_puo('can_view_orders', p_company)) then
    return;
  end if;

  return query
    select oi.id, oi.order_id, oi.name, oi.description, oi.quantity, oi.status, oi.supplier_id,
           oi.purchase_price, oi.vat_rate, oi.phase_id, oi.unita_misura, oi.specifiche,
           oi.origine_materiale, oi.quantita_calcolata, oi.origini, oi.locale,
           oi.supplier_rfq_item_id, oi.stock_item_id, oi.posizioni,
           ri.rfq_id, o.order_code, w.name, w.position
      from public.materiali_fasi_validazione v
      join public.orders o on o.id = v.order_id
      join public.order_work_phases w on w.id = v.phase_id
      join public.order_items oi on oi.phase_id = v.phase_id and oi.order_id = o.id
      left join public.supplier_rfq_items ri on ri.id = oi.supplier_rfq_item_id and ri.company_id = p_company
     where v.company_id = p_company
       and v.stato = 'validata'
       and o.company_id = p_company
       and o.deleted_at is null
       and oi.natura_riga = 'materiale'
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
     order by o.order_code, w.position, oi.position, oi.id;
end;
$function$;
revoke all on function public.acquisti_materiali_da_ordinare(uuid) from public, anon;
grant execute on function public.acquisti_materiali_da_ordinare(uuid) to authenticated, service_role;

drop function if exists public.materiali_tecnico_aggiorna(uuid, integer, text);
create or replace function public.materiali_tecnico_aggiorna(p_item uuid, p_quantita numeric, p_specifiche text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
begin
  select oi.id, oi.phase_id, o.company_id, v.stato into r
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.materiali_fasi_validazione v on v.phase_id = oi.phase_id
   where oi.id = p_item and oi.natura_riga = 'materiale';
  if r.id is null or not public.materiali_utente_in_azienda(r.company_id) then
    raise exception 'Materiale non trovato' using errcode = 'P0002';
  end if;
  if not public.materiali_puo('can_validate_bom', r.company_id) then
    raise exception 'Solo chi valida i materiali' using errcode = '42501';
  end if;
  if coalesce(r.stato, 'bozza') = 'validata' then
    raise exception 'I materiali di questa fase sono validati: rimetti la fase in bozza per cambiarli' using errcode = '22023';
  end if;
  if p_quantita is null or p_quantita <= 0 then
    raise exception 'Quantità non valida' using errcode = '22023';
  end if;
  update public.order_items
     set quantity = round(p_quantita, 4), specifiche = coalesce(p_specifiche, specifiche)
   where id = p_item;
end;
$function$;
revoke all on function public.materiali_tecnico_aggiorna(uuid, numeric, text) from public, anon;
grant execute on function public.materiali_tecnico_aggiorna(uuid, numeric, text) to authenticated, service_role;

-- ─── Generazione: la quantità calcolata, non l'intero sopra ─────────────────

create or replace function public.materiali_salva_generazione(p_order uuid, p_righe jsonb, p_escluse jsonb default '[]'::jsonb, p_avvisi jsonb default '[]'::jsonb, p_computo uuid default null::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  fasi uuid[];
  bloccata text;
  a_mano jsonb;
  liberi uuid[];
  tenute text[];
  inserite integer;
  tolte integer;
  saltate integer;
begin
  select o.company_id into azienda from public.orders o where o.id = p_order;
  if azienda is null then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_righe, '[]'::jsonb)) <> 'array' then
    raise exception 'Righe non valide' using errcode = '22023';
  end if;

  select array_agg(distinct (r->>'phase_id')::uuid) filter (where r->>'phase_id' is not null)
    into fasi from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r;

  if exists (select 1 from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r
              where r->>'phase_id' is not null
                and not exists (select 1 from public.order_work_phases w where w.id = (r->>'phase_id')::uuid and w.order_id = p_order)) then
    raise exception 'Una fase indicata non è di questa commessa' using errcode = '22023';
  end if;

  select w.name into bloccata
    from public.materiali_fasi_validazione v join public.order_work_phases w on w.id = v.phase_id
   where v.order_id = p_order and v.stato <> 'bozza' and v.phase_id = any(coalesce(fasi, '{}'))
   limit 1;
  if bloccata is not null then
    raise exception 'La fase «%» è inviata al tecnico o validata: va rimessa in bozza prima di rigenerare i materiali', bloccata
      using errcode = '22023';
  end if;

  -- Le righe generate prima, ancora libere (né offerta né ordine): si
  -- sostituiscono. La quantità cambiata a mano resta, per chiave. Le righe
  -- generate prima dei decimali avevano l'intero sopra il calcolo: anche
  -- quello vale come «non toccata».
  select coalesce(array_agg(oi.id), '{}'),
         coalesce(jsonb_object_agg(oi.chiave_materiale, oi.quantity)
                    filter (where oi.chiave_materiale is not null
                              and oi.quantita_calcolata is not null
                              and oi.quantity is distinct from oi.quantita_calcolata
                              and oi.quantity is distinct from ceil(oi.quantita_calcolata)), '{}'::jsonb)
    into liberi, a_mano
    from public.order_items oi
   where oi.order_id = p_order
     and oi.natura_riga = 'materiale'
     and oi.origine_materiale in ('computo', 'planimetria')
     and oi.supplier_rfq_item_id is null
     and oi.status = 'da_ordinare'
     and coalesce(oi.quantity_received, 0) = 0
     and not exists (select 1 from public.purchase_order_items poi
                       join public.purchase_orders po on po.id = poi.purchase_order_id
                      where poi.order_item_id = oi.id and po.status <> 'annullato')
     and (oi.phase_id is null or not exists (
           select 1 from public.materiali_fasi_validazione v where v.phase_id = oi.phase_id and v.stato <> 'bozza'));

  -- Righe generate già in offerta o in un ordine: non si raddoppiano.
  select coalesce(array_agg(oi.chiave_materiale), '{}') into tenute
    from public.order_items oi
   where oi.order_id = p_order and oi.chiave_materiale is not null
     and oi.origine_materiale in ('computo', 'planimetria')
     and not (oi.id = any(liberi));

  delete from public.order_items where id = any(liberi);
  get diagnostics tolte = row_count;

  insert into public.order_items (
    order_id, name, description, quantity, status, natura_riga, phase_id, supplier_id, article_template_id,
    purchase_price, categoria, unita_misura, specifiche, origine_materiale, quantita_netta, quantita_calcolata,
    sfrido, origini, chiave_materiale, computo_voce_id, scomposizione_id, planimetria_documento_id, locale, position)
  select p_order,
         left(x.r->>'descrizione', 500),
         nullif(x.r->>'specifiche', ''),
         round(coalesce((a_mano->>(x.r->>'chiave'))::numeric, (x.r->>'quantita_calcolata')::numeric), 4),
         'da_ordinare', 'materiale', (x.r->>'phase_id')::uuid, (x.r->>'supplier_id')::uuid, at.id,
         coalesce(at.prezzo_acquisto_netto, at.standard_cost, 0),
         x.r->>'categoria', x.r->>'unita_misura', nullif(x.r->>'specifiche', ''),
         coalesce(x.r->>'origine', 'computo'),
         (x.r->>'quantita_netta')::numeric, (x.r->>'quantita_calcolata')::numeric, (x.r->>'sfrido')::numeric,
         coalesce(x.r->'origini', '[]'::jsonb), x.r->>'chiave',
         (x.r->>'computo_voce_id')::uuid, (x.r->>'scomposizione_id')::uuid,
         (x.r->>'planimetria_documento_id')::uuid, x.r->>'locale',
         1000 + x.n::integer
    from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) with ordinality as x(r, n)
    left join public.article_templates at on at.id = (x.r->>'article_template_id')::uuid and at.company_id = azienda
   where coalesce((x.r->>'quantita_calcolata')::numeric, 0) > 0
     and not ((x.r->>'chiave') = any(tenute));
  get diagnostics inserite = row_count;

  saltate := jsonb_array_length(coalesce(p_righe, '[]'::jsonb)) - inserite;

  insert into public.materiali_generazioni (company_id, order_id, computo_upload_id, righe, escluse, avvisi)
  values (azienda, p_order, p_computo, inserite, coalesce(p_escluse, '[]'::jsonb), coalesce(p_avvisi, '[]'::jsonb));

  return jsonb_build_object('inserite', inserite, 'sostituite', tolte, 'saltate', saltate);
end;
$function$;

-- ─── Richiesta d'offerta: 0,3 m³ restano 0,3 ────────────────────────────────

create or replace function public.acquisti_richiedi_offerta(p_items uuid[], p_titolo text, p_fornitori uuid[] default '{}'::uuid[], p_scadenza date default null::date)
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
  item uuid;
  pos integer := 0;
begin
  select min(c.company_id::text)::uuid, array_agg(distinct c.order_id) into azienda, commesse
    from public.acquisti_materiali_controllati(p_items) c;

  if exists (select 1 from public.order_items oi where oi.id = any(p_items) and oi.supplier_rfq_item_id is not null) then
    raise exception 'Alcuni materiali sono già in una richiesta d''offerta' using errcode = '22023';
  end if;

  insert into public.supplier_rfqs (company_id, titolo, descrizione, order_id, scadenza_offerte, created_by)
  values (azienda, coalesce(nullif(btrim(p_titolo), ''), 'Richiesta d''offerta materiali'),
          'Materiali validati della commessa', case when cardinality(commesse) = 1 then commesse[1] end,
          p_scadenza, auth.uid())
  returning id into rfq;

  perform set_config('app.materiali_sistema', 'on', true);
  for m in select * from public.acquisti_materiali_controllati(p_items) loop
    pos := pos + 1;
    insert into public.supplier_rfq_items (rfq_id, company_id, descrizione, quantita, unita_misura, article_template_id, note, posizione)
    values (rfq, azienda, m.name,
            case when coalesce(m.quantity, 0) > 0 then m.quantity else 1 end,
            coalesce(m.unita_misura, 'pz'), m.article_template_id, m.specifiche, pos)
    returning id into item;
    update public.order_items set supplier_rfq_item_id = item where id = m.id;
  end loop;
  perform set_config('app.materiali_sistema', '', true);

  insert into public.supplier_rfq_suppliers (rfq_id, company_id, supplier_id)
  select rfq, azienda, s.id from public.suppliers s
   where s.id = any(coalesce(p_fornitori, '{}')) and s.company_id = azienda;

  return rfq;
end;
$function$;

-- ─── Magazzino: prenotazioni a pezzi interi, simmetriche ────────────────────

create or replace function public.trg_oi_reserve_on_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.stock_item_id is not null and public.fulfillment_status_holds_reserve(new.fulfillment_status) and coalesce(new.quantity, 0) > 0 then
    update public.warehouse_stock set quantity_reserved = quantity_reserved + ceil(new.quantity)::integer, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$function$;

create or replace function public.trg_oi_reserve_on_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.stock_item_id is not null and public.fulfillment_status_holds_reserve(old.fulfillment_status) and coalesce(old.quantity, 0) > 0 then
    update public.warehouse_stock set quantity_reserved = greatest(0, quantity_reserved - ceil(old.quantity)::integer), updated_at = now()
     where id = old.stock_item_id;
  end if;
  return old;
end;
$function$;

create or replace function public.trg_oi_reserve_on_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old_held boolean := public.fulfillment_status_holds_reserve(old.fulfillment_status);
  v_new_held boolean := public.fulfillment_status_holds_reserve(new.fulfillment_status);
begin
  -- Caso semplice: sia OLD che NEW NON held -> niente da fare
  if not v_old_held and not v_new_held then
    return new;
  end if;
  -- Rilascia reserve su OLD se OLD era held e ha cambiato stato/item/quantita
  if v_old_held and old.stock_item_id is not null and coalesce(old.quantity, 0) > 0 and (
       not v_new_held or old.stock_item_id is distinct from new.stock_item_id or old.quantity is distinct from new.quantity) then
    update public.warehouse_stock set quantity_reserved = greatest(0, quantity_reserved - ceil(old.quantity)::integer), updated_at = now()
     where id = old.stock_item_id;
  end if;
  -- Aggiungi reserve su NEW se NEW e held e ha cambiato stato/item/quantita
  if v_new_held and new.stock_item_id is not null and coalesce(new.quantity, 0) > 0 and (
       not v_old_held or old.stock_item_id is distinct from new.stock_item_id or old.quantity is distinct from new.quantity) then
    update public.warehouse_stock set quantity_reserved = quantity_reserved + ceil(new.quantity)::integer, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$function$;
