-- Correzioni dalla revisione del flusso su misura (08/11/2026). Solo funzioni e un trigger.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.correggi(p_firma text, p_vecchio text, p_nuovo text)
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_firma::regprocedure);
begin
  -- Già applicata: il testo nuovo c'è e il vecchio non resta da sostituire (il nuovo può contenere il vecchio).
  if position(p_nuovo in d) > 0 and (position(p_vecchio in d) = 0 or position(p_vecchio in p_nuovo) > 0) then return; end if;
  if position(p_vecchio in d) = 0 then raise exception 'testo non trovato in %: %', p_firma, left(p_vecchio, 60); end if;
  execute replace(d, p_vecchio, p_nuovo);
end $f$;

-- Il sopralluogo definitivo conferma solo se il preventivo è nato da quel sopralluogo; una riga senza
-- misure non è mai confermata. Le voci con le misure non si ordinano due volte.
select pg_temp.correggi('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])',
  $v$stato_misura := case when definitivo is not null or public.misure_regola_azienda(azienda, chiave) = 'definitive'$v$,
  $v$stato_misura := case when definitivo = nullif(q->>'sopralluogo_id','')::uuid or public.misure_regola_azienda(azienda, chiave) = 'definitive'$v$);
select pg_temp.correggi('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])',
  $v$'measure_status',stato_misura,$v$,
  $v$'measure_status',case when coalesce(nullif(r->>'larghezza_mm','')::numeric, 0) > 0 and coalesce(nullif(r->>'altezza_mm','')::numeric, 0) > 0 then stato_misura else 'da_rilevare' end,$v$);

select pg_temp.correggi('public.purchase_order_items_su_misura_una_volta()',
  $v$select oi.gruppo_id, oi.quantity, oi.name into v_gruppo, v_quantita, v_nome$v$,
  $v$select coalesce(oi.gruppo_id, case when oi.measure_status is not null then oi.id end), oi.quantity, oi.name into v_gruppo, v_quantita, v_nome$v$);

-- Una bozza non è un ordine: il rilievo aggiorna ancora la quantità, e la bozza la segue.
select pg_temp.correggi('public.misure_conferma(uuid, uuid[])',
  $v$where p.order_item_id = r.id and po.status <> 'annullato');$v$,
  $v$where p.order_item_id = r.id and po.status not in ('annullato', 'bozza'));$v$);
select pg_temp.correggi('public.riga_imposta_sfrido(uuid, numeric)',
  $v$where p.order_item_id = r.id and po.status <> 'annullato');$v$,
  $v$where p.order_item_id = r.id and po.status not in ('annullato', 'bozza'));$v$);
select pg_temp.correggi('public.order_items_misure_in_bozza()',
  $v$misure_testo = d->>'misure_testo'
    from$v$,
  $v$misure_testo = d->>'misure_testo',
         quantity = case when (select count(*) from public.purchase_order_items x where x.order_item_id = new.id) = 1 then new.quantity else p.quantity end
    from$v$);
select pg_temp.correggi('public.order_items_misure_in_bozza()',
  $v$and p.misure_testo is distinct from d->>'misure_testo';$v$,
  $v$and (p.misure_testo is distinct from d->>'misure_testo' or p.quantity is distinct from new.quantity);$v$);
drop trigger if exists order_items_misure_in_bozza on public.order_items;
create trigger order_items_misure_in_bozza
  after update of misure_da_ordinare, misure_rilevate, misure_preventivo, measure_status, misura_tipo, riferimento, description, specifiche, axis_selections, quantity
  on public.order_items
  for each row when (new.gruppo_id is not null or new.measure_status is not null)
  execute function public.order_items_misure_in_bozza();

-- Un costo scritto a mano non si ricalcola; costi fuori dallo storico e solo a chi li può vedere.
select pg_temp.correggi('public.misure_conferma(uuid, uuid[])',
  $v$and coalesce(r.prezzo_fonte, 'listino') = 'listino'$v$,
  $v$and r.prezzo_fonte = 'listino'$v$);
select pg_temp.correggi('public.misure_conferma(uuid, uuid[])',
  $v$'costo_prima', r.purchase_price, 'costo_dopo', v_costo, 'con_ordine', v_con_ordine));$v$,
  $v$'con_ordine', v_con_ordine));$v$);
select pg_temp.correggi('public.misure_conferma(uuid, uuid[])',
  $v$'costo_prima', r.purchase_price, 'costo_dopo', v_costo,
                                                 'con_ordine', v_con_ordine);$v$,
  $v$'costo_prima', case when public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda) then r.purchase_price end,
                                                 'costo_dopo', case when public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda) then v_costo end,
                                                 'con_ordine', v_con_ordine);$v$);

-- La merce su misura si registra solo con la spunta per posizione.
select pg_temp.correggi('public.oda_registra_arrivo(uuid, jsonb, text, date, uuid, text, text, uuid)',
  $v$IF public.riga_e_su_misura(v_order_item_id) THEN
        v_stock_item_id := NULL;
      END IF;$v$,
  $v$IF public.riga_e_su_misura(v_order_item_id) THEN
        IF current_setting('app.arrivo_da_spunta', true) IS DISTINCT FROM 'on' THEN
          v_errori := v_errori || jsonb_build_object('item_id', v_item_id, 'errore', 'su_misura_da_spuntare');
          CONTINUE;
        END IF;
        v_stock_item_id := NULL;
      END IF;$v$);
select pg_temp.correggi('public.arrivo_registra(uuid, jsonb, uuid, text, date, uuid)',
  $v$select * into v_esito_ordine from public.oda_registra_arrivo(po.id, v_ok,$v$,
  $v$perform set_config('app.arrivo_da_spunta', 'on', true);
    select * into v_esito_ordine from public.oda_registra_arrivo(po.id, v_ok,$v$);

-- Offerta a corpo: i mq di una riga a quantità sono già il totale; con voci già coperte il totale non si ripartisce.
create or replace function public.misure_mq(p jsonb, p_quantita numeric)
 returns numeric language sql immutable set search_path to 'public'
as $function$
  select coalesce(
    (p->>'larghezza')::numeric * (p->>'altezza')::numeric / 1000000 * coalesce(p_quantita, 1),
    (p->>'mq')::numeric,
    0);
$function$;
select pg_temp.correggi('public.rdo_aggiudica(uuid, text)',
  $v$if coalesce(v_n, 0) > 0 and v_corpo > 0$v$,
  $v$if coalesce(v_n, 0) > 0 and v_corpo > 0 and jsonb_array_length(coalesce(v_saltate, '[]'::jsonb)) = 0$v$);
