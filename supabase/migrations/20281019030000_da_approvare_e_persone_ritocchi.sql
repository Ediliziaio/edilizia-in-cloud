-- Due ritocchi dalla revisione del 19/10/2026:
--   · ufficio_da_approvare: l'importo delle bolle dal cantiere lo vede chi ha il permesso sui costi;
--     gli altri vedono fornitore, numero e chi l'ha fotografata.
--   · e_persona_ufficio risponde per l'azienda di chi chiede (o per i processi del server), così
--     resta un controllo interno e non un modo per sapere chi lavora in un'altra azienda.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.e_persona_ufficio(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select (auth.uid() is null or p_company = public.get_my_company_id()
          or exists (select 1 from public.profiles me where me.id = auth.uid() and me.company_id = p_company))
     and (exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
                   where p.id = p_user and p.company_id = p_company and not coalesce(p.is_blocked, false)
                     and ur.role in ('company_admin', 'company_staff', 'salesperson', 'call_center', 'employee', 'worker', 'subcontractor'))
          or exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role = 'super_admin'))
$$;
revoke all on function public.e_persona_ufficio(uuid, uuid) from public, anon;
grant execute on function public.e_persona_ufficio(uuid, uuid) to authenticated;

create or replace function public.ufficio_da_approvare()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.get_my_company_id();
  v_costi boolean;
begin
  if auth.uid() is null or v_company is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false) then
    raise exception 'Non puoi vedere le approvazioni di questa azienda' using errcode = '42501';
  end if;
  v_costi := coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company), false);
  return jsonb_build_object(
    'rapportini', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'order_id', r.order_id, 'codice', o.order_code, 'giorno', r.data_lavoro,
        'autore', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
        'collaudo', coalesce(r.lavoro_completato, false) or nullif(btrim(r.firma_cliente_url), '') is not null,
        'ore', coalesce(r.ore_lavorate, 0) + coalesce(r.ore_straordinario, 0), 'inviato_il', r.updated_at
      ) order by r.data_lavoro, r.updated_at)
      from public.campo_rapportini r join public.orders o on o.id = r.order_id
      left join public.profiles p on p.id = r.user_id
      where r.company_id = v_company and r.stato = 'inviato'), '[]'::jsonb),
    'correzioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'order_id', c.order_id, 'codice', o.order_code, 'tipo', c.tipo, 'ora', c.ora_richiesta, 'motivo', c.motivo,
        'persona', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      ) order by c.ora_richiesta)
      from public.campo_timbrature_correzioni c left join public.orders o on o.id = c.order_id
      left join public.profiles p on p.id = c.user_id
      where c.company_id = v_company and c.stato = 'in_attesa'), '[]'::jsonb),
    'bolle', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id, 'order_id', ca.order_id, 'codice', o.order_code, 'fornitore', ca.fornitore,
        'numero', ca.numero_documento, 'totale', case when v_costi then ca.totale end, 'il', ca.created_at,
        'persona', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      ) order by ca.created_at)
      from public.campo_acquisti ca left join public.orders o on o.id = ca.order_id
      left join public.profiles p on p.id = ca.user_id
      where ca.company_id = v_company and ca.stato = 'da_verificare'), '[]'::jsonb)
  );
end $$;
revoke all on function public.ufficio_da_approvare() from public, anon;
grant execute on function public.ufficio_da_approvare() to authenticated;
