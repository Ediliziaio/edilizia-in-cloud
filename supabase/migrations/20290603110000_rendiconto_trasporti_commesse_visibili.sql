-- Rendiconto trasporti: la commessa si legge da orders_visibili, non da orders (25/11/2026).
--
-- La funzione è security invoker e univa public.orders. Su orders c'è la regola
-- restrittiva office_financial_select (importi E costi E margini): chi non ha i
-- margini — una segretaria con «Acquisti» — vede zero commesse dalla tabella
-- grezza, quindi il rendiconto le usciva sempre vuoto («Nessun viaggio…») anche
-- con viaggi approvati. orders_visibili applica le stesse regole di visibilità
-- senza la parte economica, come fa il browser per ogni lettura delle commesse.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.rapportini_voci_approvate_per_trasporti(
  p_company_id uuid, p_order_id uuid, p_rapportini uuid[]
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
    and (r.stato = 'approvato' or (r.stato is null and r.approvato is true))
    and (v.viaggio is not null or btrim(v.unita) ~* '^viaggi[oi]$'
      or btrim(v.descrizione) ~* '^(trasport[oi]|viaggi[oi])\y')
  order by r.data_lavoro, v.id;
$$;
revoke all on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[]) to authenticated;
