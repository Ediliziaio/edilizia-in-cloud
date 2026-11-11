-- ============================================================================
-- «Affida e manda il contratto» (11/11/2026): i prezzi della tabella prima di
-- salvare, con la regola di affida_voci (affidamento_prezzo_proposto): prezzo
-- della ditta sul suo listino oggi valido, altrimenti costo aziendale della
-- voce di listino, altrimenti a mano. Una voce non ancora collegata al listino
-- può arrivare con la voce di listino proposta (dall'AI o scelta): il prezzo si
-- calcola su quella, senza scrivere niente.
-- Solo lettura; servono i permessi sulle commesse e sui costi.
-- ============================================================================

create or replace function public.affidamento_prezzi_proposti(p_order uuid, p_subappaltatore uuid, p_voci jsonb)
returns table(voce_id uuid, tariffa_id uuid, prezzo numeric, origine text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
begin
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
             and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501', message = 'Per vedere i prezzi delle ditte servono i permessi sulle commesse e sui costi.';
  end if;
  if p_voci is null or jsonb_typeof(p_voci) <> 'array' then
    raise exception using errcode = '22023', message = 'Le voci non sono un elenco.';
  end if;

  return query
  with richieste as (
    select v.id as voce, coalesce(nullif(e->>'tariffa_id', '')::uuid, v.tariffa_id) as tariffa
      from jsonb_array_elements(p_voci) e
      join public.order_work_phase_voci v on v.id = nullif(e->>'voce_id', '')::uuid and v.order_id = p_order
  )
  select r.voce, t.id,
         coalesce(d.costo, nullif(t.costo_interno, 0), nullif(t.prezzo_costo, 0), nullif(t.costo_default, 0)),
         case when d.costo is not null then 'listino_ditta'
              when coalesce(nullif(t.costo_interno, 0), nullif(t.prezzo_costo, 0), nullif(t.costo_default, 0)) is not null then 'costo_aziendale'
              else 'manuale' end
    from richieste r
    left join public.tariffe_aziendali t on t.id = r.tariffa and t.company_id = v_azienda
    left join lateral (
      select tv.costo from public.tariffa_costi_varianti tv
       where tv.tariffa_id = t.id and tv.company_id = v_azienda and tv.subappaltatore_id = p_subappaltatore
         and tv.attivo and tv.costo is not null
         and tv.valid_from <= (now() at time zone 'Europe/Rome')::date
         and (tv.valid_to is null or tv.valid_to >= (now() at time zone 'Europe/Rome')::date)
       order by tv.is_default desc, tv.sort_order, tv.created_at
       limit 1
    ) d on true;
end;
$$;
revoke all on function public.affidamento_prezzi_proposti(uuid, uuid, jsonb) from public, anon;
grant execute on function public.affidamento_prezzi_proposti(uuid, uuid, jsonb) to authenticated, service_role;
