-- Le rate del Previsionale anche per le chiamate del servizio (08/11/2026).
--
-- Silvio e il brief del mattino dicono ora lo scaduto da incassare con la
-- regola del Previsionale (supabase/functions/_shared/scadutoPrevisionale.ts),
-- caricando le stesse fonti dell'app col client del servizio. Due di quelle
-- fonti, cruscotto_rate_da_incassare e cruscotto_rate_incassi, chiedevano il
-- permesso di un utente (auth.uid()), che una chiamata del servizio non ha: le
-- rifiutavano, e lo scaduto di Silvio sarebbe rimasto senza le rate.
--
-- Il servizio (service_role) legge già tutte le tabelle senza RLS e passa da
-- user_can_access_company: qui gli si toglie solo il controllo del permesso
-- dell'utente. Per gli utenti non cambia niente. I GRANT restano quelli di
-- prima (authenticated, service_role; niente anon).

create or replace function public.cruscotto_rate_da_incassare(p_company_id uuid)
 returns table(id text, order_id uuid, amount numeric, expected_date date, finanziamento boolean)
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
  return query
    select coalesce(x.installment_id::text, 'non-pianificato-' || x.order_id::text), x.order_id, x.residuo,
           x.expected_date, x.finanziamento
      from public.rate_da_incassare(p_company_id) x
     where x.residuo > 0;
end
$function$;

create or replace function public.cruscotto_rate_incassi(p_company_id uuid)
 returns table(order_id uuid, installment_id text, data date, importo numeric, documento_fiscale_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role()
     and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
     and not coalesce(public.user_can_read_accountant_company(p_company_id), false) then
    raise exception 'Non puoi vedere gli incassi di questa azienda' using errcode = '42501';
  end if;
  return query
    select x.order_id, x.installment_id::text, x.data, x.importo, oi.documento_fiscale_id
      from public.rate_incassi(p_company_id) x
      left join public.order_installments oi on oi.id = x.installment_id
     where x.importo <> 0;
end
$function$;

revoke all on function public.cruscotto_rate_da_incassare(uuid) from public, anon;
revoke all on function public.cruscotto_rate_incassi(uuid) from public, anon;
grant execute on function public.cruscotto_rate_da_incassare(uuid) to authenticated, service_role;
grant execute on function public.cruscotto_rate_incassi(uuid) to authenticated, service_role;
