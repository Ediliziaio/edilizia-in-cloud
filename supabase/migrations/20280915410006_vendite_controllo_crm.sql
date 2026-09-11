-- Il controllo del CRM del report Venditori, con le regole degli altri numeri.
--
-- La «Diagnosi operativa venditori» contava nel browser, con definizioni sue:
-- tre letture senza limite (oltre mille righe PostgREST taglia in silenzio, e
-- per un'azienda con tremila opportunità il conto si fermava a mille), gli
-- appuntamenti «da esitare» misurati con la spunta is_completed che nessuno usa
-- (così ogni appuntamento passato risultava senza esito, anche quelli esitati),
-- i riprogrammati contati come appuntamenti, le scartate trattate da aperte.
-- Qui gli stessi sei numeri escono dalle definizioni di vendite_opportunita e
-- vendite_appuntamenti (20280915410001), e l'ultimo contatto di una trattativa
-- è quello delle opportunità ferme di Sales OS (20280915410003).
--
-- SECURITY INVOKER come le altre: chi vede solo i propri lead vede solo i
-- propri numeri.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.vendite_controllo_crm(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null
)
returns table (
  contatti_senza_venditore bigint,
  opportunita_senza_venditore bigint,
  appuntamenti_senza_venditore bigint,
  appuntamenti_senza_contatto bigint,
  appuntamenti_senza_esito bigint,
  opportunita_senza_prossimo_passo bigint
)
language plpgsql
stable
security invoker
as $$
declare
  v_inizio timestamptz := p_da::timestamp at time zone 'Europe/Rome';
  v_fine timestamptz := (p_a + 1)::timestamp at time zone 'Europe/Rome';
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  perform public.assert_company_access(p_company);

  return query
  select
    -- contatti arrivati nel periodo senza nessuno che li segua (solo per il team)
    case when p_venditore is null then (
      select count(*)
        from public.marketing_contacts c
       where c.company_id = p_company
         and c.deleted_at is null
         and c.assigned_to is null
         and c.created_at >= v_inizio and c.created_at < v_fine
    ) else 0 end::bigint,
    case when p_venditore is null then (
      select count(*)
        from public.vendite_opportunita(p_company, p_da, p_a, null, null) vo
       where vo.creata and vo.venditore is null
    ) else 0 end::bigint,
    case when p_venditore is null then ap.senza_venditore else 0 end::bigint,
    ap.senza_contatto::bigint,
    ap.senza_esito::bigint,
    (
      select count(*)
        from public.marketing_opportunities mo
       where mo.company_id = p_company
         and mo.deleted_at is null
         and mo.status = 'open'
         and mo.created_at < v_fine
         and (p_venditore is null or mo.assigned_to = p_venditore)
         and (
           -- nessun prossimo passo: né un'azione scritta né una data da oggi in poi
           (nullif(btrim(mo.next_action), '') is null
             and (mo.next_action_date is null or mo.next_action_date < v_oggi))
           -- oppure niente di nuovo da due settimane (stesso «ultimo contatto»
           -- delle opportunità ferme)
           or greatest(
                (select max(mca.created_at)
                   from public.marketing_contact_activities mca
                  where mca.company_id = mo.company_id and mca.contact_id = mo.contact_id),
                mo.last_activity_at, mo.stage_changed_at, mo.created_at
              ) < now() - interval '14 days'
         )
    )::bigint
  from (
    select count(*) filter (where va.venditore is null) as senza_venditore,
           count(*) filter (where va.contact_id is null
                              and (p_venditore is null or va.venditore = p_venditore)) as senza_contatto,
           count(*) filter (where va.senza_esito
                              and (p_venditore is null or va.venditore = p_venditore)) as senza_esito
      from public.vendite_appuntamenti(p_company, p_da, p_a, null) va
  ) ap;
end;
$$;

revoke all on function public.vendite_controllo_crm(uuid, date, date, uuid) from public, anon;
grant execute on function public.vendite_controllo_crm(uuid, date, date, uuid) to authenticated, service_role;
