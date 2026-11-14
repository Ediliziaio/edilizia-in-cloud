-- Cruscotto economico: quante rate risultano pagate senza la data dell'incasso
-- (14/11/2026).
--
-- Il Cruscotto lo contava su order_installments_visibili: la vista calcola i
-- diritti rata per rata su TUTTE le rate del database prima di filtrare
-- l'azienda, 2,5 s per rispondere «0» su Demo Azienda 2, e insieme alle altre
-- letture del Cruscotto la richiesta superava gli 8 s (500).
--
-- Qui il conto si fa sulle rate dell'azienda, col controllo d'accesso di
-- cruscotto_rate_da_incassare (stessi permessi: commesse, cruscotto o studio
-- del commercialista). Il cestino resta fuori come prima.

create or replace function public.cruscotto_rate_pagate_senza_data(p_company_id uuid)
returns integer
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
    raise exception 'Non puoi vedere gli incassi di questa azienda' using errcode = '42501';
  end if;
  return (
    select count(*)::integer
      from public.order_installments i
      join public.orders o on o.id = i.order_id
     where o.company_id = p_company_id
       and o.deleted_at is null
       and i.is_paid
       and i.paid_date is null
  );
end
$function$;

revoke all on function public.cruscotto_rate_pagate_senza_data(uuid) from public, anon;
grant execute on function public.cruscotto_rate_pagate_senza_data(uuid) to authenticated, service_role;
