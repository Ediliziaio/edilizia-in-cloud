-- «Lavori e squadre»: i mezzi e gli attrezzi del cantiere (26/09/2026, richiesta
-- del founder: «qui dovrei vedere anche il mezzo o l'attrezzatura associata»).
--
-- commessa_mezzi_lavoro(ordine) restituisce:
--   · sul_cantiere  → i mezzi che adesso stanno sul cantiere;
--   · con_le_persone → i mezzi in carico a chi lavora qui (componenti e
--                      responsabili delle squadre sulla commessa, persone sulle
--                      fasi), con gli attrezzi caricati sopra e le fasi di chi
--                      li ha in carico (null = tutta la commessa). Un attrezzo
--                      lasciato su un altro cantiere non conta; un furgone o
--                      un'auto sì, con il cantiere dove risulta («altrove»).
-- Niente valori, rate o costi: quelli restano nella scheda del mezzo.
-- La leggono Commesse e Mezzi.

create or replace function public.commessa_mezzi_lavoro(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_view_mezzi', v_company)) then
    return jsonb_build_object('sul_cantiere', '[]'::jsonb, 'con_le_persone', '[]'::jsonb);
  end if;

  return (
    with persone as (
      -- componenti e responsabili delle squadre sulla commessa (con la fase)
      select h.id as hr_id, sc.phase_id
        from public.squadre_commesse sc
        join public.external_teams t on t.id = sc.squadra_id and t.is_active
        join public.hr_profili h
          on h.company_id = sc.company_id and coalesce(h.attivo, true)
         and (h.id = t.responsabile_hr_profilo_id
              or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
       where sc.order_id = p_order_id
      union
      -- persone messe sulle fasi (o su tutta la commessa)
      select h.id, oe.phase_id
        from public.order_employees oe
        join public.hr_profili h on h.employee_id = oe.employee_id and coalesce(h.attivo, true)
       where oe.order_id = p_order_id
    ),
    per_persona as (
      select p.hr_id,
             case when bool_or(p.phase_id is null) then null
                  else jsonb_agg(distinct p.phase_id) end as fasi
        from persone p
       group by p.hr_id
    )
    select jsonb_build_object(
      'sul_cantiere', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa,
                 'con', nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''))
               order by m.nome)
          from public.mezzi m
          left join public.hr_profili h on h.id = m.assegnato_hr_profilo_id
         where m.company_id = v_company and m.deleted_at is null
           and m.assegnato_order_id = p_order_id and m.su_mezzo_id is null
      ), '[]'::jsonb),
      'con_le_persone', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa,
                 'persona', trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')),
                 'altrove', (select o2.order_code from public.orders o2 where o2.id = m.assegnato_order_id),
                 'fasi', pp.fasi,
                 'a_bordo', coalesce((select jsonb_agg(a.nome order by a.nome)
                                        from public.mezzi a
                                       where a.su_mezzo_id = m.id and a.deleted_at is null), '[]'::jsonb))
               order by h.cognome, h.nome, m.nome)
          from public.mezzi m
          join per_persona pp on pp.hr_id = m.assegnato_hr_profilo_id
          join public.hr_profili h on h.id = m.assegnato_hr_profilo_id
         where m.company_id = v_company and m.deleted_at is null
           and m.su_mezzo_id is null
           and m.assegnato_order_id is distinct from p_order_id
           -- un attrezzo lasciato su un altro cantiere non è con la persona;
           -- furgoni e auto invece seguono chi li guida
           and (m.assegnato_order_id is null or m.tipo in ('furgone', 'autocarro', 'autovettura'))
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.commessa_mezzi_lavoro(uuid) from public, anon;
grant execute on function public.commessa_mezzi_lavoro(uuid) to authenticated;
