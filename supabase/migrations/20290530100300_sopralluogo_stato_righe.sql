-- Dalla misura all'ordine: dove sono le righe nate da un sopralluogo.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 5.
--
-- Dalla scheda del rilievo si vede, riga per riga: misure rilevate o confermate, in quale ordine
-- al fornitore sono finite e quanto è arrivato. Nessun prezzo né costo: la funzione non li
-- restituisce, così la può usare anche chi non vede i costi.
-- Collaudata il 24/11/2026 sulla catena rilievo → commessa → ordine (Demo 2, transazione annullata):
-- 3 righe create «rilevate», nessun doppione al secondo giro, ordine bloccato finché le misure
-- non erano confermate, poi partito con «Rif. F01 — L 1200 × H 1400 mm — misure definitive».

create or replace function public.sopralluogo_stato_righe(p_survey uuid)
returns table(
  order_item_id uuid,
  riferimento text,
  nome text,
  stato_misure text,
  quantita numeric,
  unita text,
  oda_id uuid,
  oda_numero text,
  oda_stato text,
  quantita_ordinata numeric,
  quantita_arrivata numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.sopralluogo_puo_lavorare(p_survey, false) then
    raise exception 'Non puoi vedere questo sopralluogo' using errcode = '42501';
  end if;
  return query
    select oi.id, oi.riferimento, oi.name, oi.measure_status, oi.quantity, oi.unita_misura,
           po.id, po.oda_number, po.status,
           poi.quantity, poi.quantity_received
      from public.order_items oi
      left join public.purchase_order_items poi on poi.order_item_id = oi.id
      left join public.purchase_orders po on po.id = poi.purchase_order_id and po.status <> 'annullato'
     where oi.survey_id = p_survey
       and oi.diviso_da is null
     order by oi.position nulls last, oi.riferimento nulls last, oi.name;
end;
$function$;

revoke all on function public.sopralluogo_stato_righe(uuid) from public, anon;
grant execute on function public.sopralluogo_stato_righe(uuid) to authenticated, service_role;
