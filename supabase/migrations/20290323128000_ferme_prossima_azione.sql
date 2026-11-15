-- Sales OS, scheda «Ferme»: anche la prossima azione salvata (15/11/2026).
--
-- La colonna «Prossima azione» mostrava sempre un suggerimento («Chiama oggi»), non quello che
-- il commerciale ha scritto: dopo l'aggiornamento in blocco l'azione non si vedeva. Il tipo
-- restituito cambia, quindi la funzione si ricrea; resta SECURITY INVOKER (valgono le regole
-- di riga di chi la chiama) con gli stessi permessi.

drop function if exists public.get_stalled_opportunities(uuid, uuid);

create function public.get_stalled_opportunities(p_company_id uuid, p_pipeline_id uuid default null::uuid)
 returns table(opportunity_id uuid, opportunity_name text, contact_name text, stage_name text, assigned_to uuid, last_activity_at timestamp with time zone, days_stalled integer, stalled_threshold integer, value numeric, next_action text, next_action_date date)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  with att as (
    select mo.id as opp,
           greatest(max(mca.created_at), mo.last_activity_at, mo.stage_changed_at, mo.created_at) as ultima
      from public.marketing_opportunities mo
      left join public.marketing_contact_activities mca
        on mca.company_id = mo.company_id and mca.contact_id = mo.contact_id
     where mo.company_id = p_company_id
       and mo.status = 'open'
       and mo.deleted_at is null
       and (p_pipeline_id is null or mo.pipeline_id = p_pipeline_id)
     group by mo.id
  )
  select mo.id,
         mo.name::text,
         btrim(concat_ws(' ', mc.first_name, mc.last_name))::text,
         s.name::text,
         mo.assigned_to,
         att.ultima,
         floor(extract(epoch from (now() - att.ultima)) / 86400)::integer,
         coalesce(s.stalled_threshold_days, 14)::integer,
         mo.value,
         nullif(btrim(mo.next_action), '')::text,
         mo.next_action_date
    from att
    join public.marketing_opportunities mo on mo.id = att.opp
    join public.marketing_pipeline_stages s on s.id = mo.stage_id
    left join public.marketing_contacts mc on mc.id = mo.contact_id
   where floor(extract(epoch from (now() - att.ultima)) / 86400) >= coalesce(s.stalled_threshold_days, 14)
   order by 7 desc;
end;
$function$;

revoke all on function public.get_stalled_opportunities(uuid, uuid) from public, anon;
grant execute on function public.get_stalled_opportunities(uuid, uuid) to authenticated, service_role;
