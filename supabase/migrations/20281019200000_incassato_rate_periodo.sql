-- Incassato dalle rate in un periodo, con l'importo che conta davvero (19/10/2026).
-- Il cruscotto sommava l'importo scritto sulla rata: un saldo pagato valeva quanto salvato,
-- non il residuo della scheda commessa (O-0410: 5.327,28 invece di 6.772,74). Ora si chiede
-- al database, che usa rate_importi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.incassato_rate_periodo(p_da date, p_a date)
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid := public.get_my_company_id();
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato()
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return coalesce((select round(sum(x.importo), 2) from public.rate_importi(v_company) x
                    where x.is_paid and x.paid_date between p_da and p_a), 0);
end $$;
revoke all on function public.incassato_rate_periodo(date, date) from public, anon;
grant execute on function public.incassato_rate_periodo(date, date) to authenticated;
