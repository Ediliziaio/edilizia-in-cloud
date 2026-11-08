-- «Ordina comunque» nel diario della commessa: l'elenco degli eventi è un tipo chiuso, si scrive come nota.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    values (po.company_id, po.order_id, 'nota_interna',
            jsonb_build_object('description', format('Ordine %s da inviare senza misure confermate: %s', po.oda_number, motivo),
                               'po_id', po.id, 'motivo', motivo, 'righe', coalesce(array_length(righe, 1), 0)));
  end if;
  return coalesce(array_length(righe, 1), 0);
end;
$function$;
