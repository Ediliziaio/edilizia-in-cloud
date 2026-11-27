-- Rendiconto trasporti: anche dai rapportini «inviati» (da approvare), come BOZZA (27/11/2026).
-- Il PDF prodotto così porta «BOZZA – contiene rapportini non approvati» (lo scrive il frontend).
-- Il rifiutato e la bozza dell'operaio non entrano mai. Senza il nuovo argomento il comportamento è quello di prima.
-- Si sostituisce la funzione a 3 argomenti con una a 4 (default false): due overload renderebbero ambigua la chiamata a 3.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop function if exists public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[]);

create or replace function public.rapportini_voci_approvate_per_trasporti(
  p_company_id uuid, p_order_id uuid, p_rapportini uuid[], p_anche_da_approvare boolean default false
) returns table (
  id uuid, data date, descrizione text, quantita numeric, unita text,
  vendita_unitaria numeric, viaggio jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select v.id, r.data_lavoro, v.descrizione, v.quantita, v.unita,
    case when public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', p_company_id)
         then v.vendita_unitaria end,
    v.viaggio
  from public.rapportino_voci_libere v
  join public.campo_rapportini r
    on (r.id, r.company_id, r.order_id) = (v.rapportino_id, v.company_id, v.order_id)
  join public.orders_visibili o on (o.id, o.company_id) = (r.order_id, r.company_id)
  where v.company_id = p_company_id and v.order_id = p_order_id
    and r.id = any(p_rapportini) and r.annullato_at is null and o.deleted_at is null
    and (r.stato = 'approvato' or (r.stato is null and r.approvato is true)
         or (coalesce(p_anche_da_approvare, false) and r.stato = 'inviato'))
    and (v.viaggio is not null or btrim(v.unita) ~* '^viaggi[oi]$'
      or btrim(v.descrizione) ~* '^(trasport[oi]|viaggi[oi])\y')
  order by r.data_lavoro, v.id;
$$;
revoke all on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[], boolean) to authenticated;
