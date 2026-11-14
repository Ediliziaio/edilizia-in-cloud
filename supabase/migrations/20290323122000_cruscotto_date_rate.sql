-- Cruscotto, scheda «Commesse e margini»: le date delle rate per sapere in che
-- mese è stata venduta ogni commessa (14/11/2026).
--
-- useMarginData le leggeva da order_installments, che il browser riscrive su
-- order_installments_visibili: la vista calcola i diritti rata per rata su tutto
-- il database, oltre un secondo per Demo Azienda 2, e insieme alle altre letture
-- del Cruscotto la richiesta superava gli 8 s. Qui escono solo le date (niente
-- importi), con il controllo d'accesso di cruscotto_rate_pagate_senza_data.

create or replace function public.cruscotto_date_rate(p_company_id uuid)
returns table(order_id uuid, expected_date date, paid_date date)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role()
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
     and not coalesce(public.user_can_read_accountant_company(p_company_id), false)
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_cruscotto', p_company_id), false) then
    raise exception 'Non puoi vedere le rate di questa azienda' using errcode = '42501';
  end if;
  return query
    select i.order_id, i.expected_date::date, i.paid_date::date
      from public.order_installments i
      join public.orders o on o.id = i.order_id
     where o.company_id = p_company_id
       and o.deleted_at is null
       and (i.expected_date is not null or i.paid_date is not null);
end
$function$;

revoke all on function public.cruscotto_date_rate(uuid) from public, anon;
grant execute on function public.cruscotto_date_rate(uuid) to authenticated, service_role;
