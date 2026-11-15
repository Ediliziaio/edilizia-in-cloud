-- Previsionale e Cash Flow: le rate delle commesse in una lettura veloce (15/11/2026).
--
-- caricaPrevisionale le leggeva da order_installments con l'embed di orders: dal browser
-- diventano order_installments_visibili e orders_visibili, che calcolano i diritti riga per
-- riga su tutto il database (3,2 s su Demo Azienda 2). Con le altre letture si superavano gli
-- 8 s e la pagina diceva «Non è stato possibile leggere: Rate delle commesse», con la
-- previsione senza le rate. Qui le stesse colonne, con il controllo d'accesso per azienda
-- (commesse, previsionale, controllo di gestione, cruscotto o studio del commercialista).

create or replace function public.previsionale_rate_commesse(p_company_id uuid)
returns table(
  id uuid, order_id uuid, amount numeric, label text, type text, expected_date date,
  is_paid boolean, paid_date date, invoice_id uuid, documento_fiscale_id uuid,
  order_code text, order_deleted_at timestamptz, client_name text, client_company text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role()
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_forecast', p_company_id), false)
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_controllo_gestione', p_company_id), false)
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_cruscotto', p_company_id), false)
     and not coalesce(public.user_can_read_accountant_company(p_company_id), false) then
    raise exception 'Non puoi vedere le rate di questa azienda' using errcode = '42501';
  end if;
  return query
    select i.id, i.order_id, i.amount::numeric, i.label::text, i.type::text, i.expected_date::date,
           i.is_paid, i.paid_date::date, i.invoice_id, i.documento_fiscale_id,
           o.order_code::text, o.deleted_at, o.client_name::text, o.client_company::text
      from public.order_installments i
      join public.orders o on o.id = i.order_id
     where o.company_id = p_company_id;
end
$function$;

revoke all on function public.previsionale_rate_commesse(uuid) from public, anon;
grant execute on function public.previsionale_rate_commesse(uuid) to authenticated, service_role;
