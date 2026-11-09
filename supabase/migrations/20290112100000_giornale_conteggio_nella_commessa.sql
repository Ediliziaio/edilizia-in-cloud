-- Il numero accanto alla nuova vista «Giornale lavori» della commessa.
-- Stessa funzione, una voce in più: resta con i permessi di chi legge (RLS).
create or replace function public.ordine_conteggi_viste(p_order_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'lavorazioni',     (select count(*) from public.order_work_phases        where order_id = p_order_id),
    'rapportini',      (select count(*) from public.campo_rapportini         where order_id = p_order_id),
    'giornale',        (select count(*) from public.giornale_lavori          where order_id = p_order_id),
    'verbali',         (select count(*) from public.order_acceptance_reports where order_id = p_order_id),
    'ordini_acquisto', (select count(*) from public.purchase_orders          where order_id = p_order_id)
  )
$function$;
