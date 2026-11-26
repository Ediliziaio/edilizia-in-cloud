-- La Programmazione dentro il Calendario (26/11/2026, richiesta di Florin:
-- «si integra con il calendario, quello generale delle commesse»).
--
-- programmazione_riepilogo(azienda, dal, al): per ogni giorno già programmato
-- nel periodo, lo stato (bozza / pubblicata / cambiata dopo) e gli interventi
-- con orario, chi va (nomi), il capo e i mezzi. Una richiesta sola per tutta la
-- vista del Calendario (mese, settimana, giorno, dettaglio del giorno).
-- Sola lettura, permesso «Vedere commesse», al massimo 62 giorni per volta.
--
-- Applicata il 26/11/2026 con apply_migration, col via di Florin, e
-- riallineata a questa versione (vedi CLAUDE.md, «Come applicare una migrazione»).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.programmazione_riepilogo(p_company_id uuid, p_dal date, p_al date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere la programmazione.';
  end if;
  if p_dal is null or p_al is null or p_al < p_dal or p_al - p_dal > 62 then
    raise exception using errcode = '22023', message = 'Periodo non valido (al massimo 62 giorni).';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'giorno', g.giorno,
             'stato', g.stato,
             'modificata_dopo', g.modificata_dopo,
             'completa', g.completa,
             'interventi', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', i.id, 'tipo', i.tipo, 'orderId', i.order_id, 'titolo', i.titolo, 'indirizzo', i.indirizzo,
                        'inizio', to_char(i.inizio, 'HH24:MI'), 'fine', to_char(i.fine, 'HH24:MI'), 'momento', i.momento,
                        'capo', (select concat_ws(' ', h.nome, h.cognome) from public.hr_profili h where h.id = i.capo_hr_profilo_id),
                        'persone', coalesce((select jsonb_agg(concat_ws(' ', h.nome, h.cognome) order by p.posizione)
                                               from public.programmazione_persone p
                                               join public.hr_profili h on h.id = p.hr_profilo_id
                                              where p.intervento_id = i.id), '[]'::jsonb),
                        'esterni', coalesce((select jsonb_agg(t.name order by t.name)
                                               from public.programmazione_esterni x
                                               join public.external_teams t on t.id = x.external_team_id
                                              where x.intervento_id = i.id), '[]'::jsonb),
                        'mezzi', coalesce((select jsonb_agg(m.nome order by m.nome)
                                             from public.programmazione_mezzi pm
                                             join public.mezzi m on m.id = pm.mezzo_id
                                            where pm.intervento_id = i.id), '[]'::jsonb)
                      ) order by case i.momento when 'prima' then 0 when 'dopo' then 3 else case when i.inizio is null then 2 else 1 end end, i.inizio, i.posizione)
                 from public.programmazione_interventi i
                where i.giornata_id = g.id), '[]'::jsonb)
           ) order by g.giorno)
      from public.programmazione_giornate g
     where g.company_id = p_company_id and g.giorno between p_dal and p_al
       and exists (select 1 from public.programmazione_interventi i where i.giornata_id = g.id)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.programmazione_riepilogo(uuid, date, date) from public, anon;
grant execute on function public.programmazione_riepilogo(uuid, date, date) to authenticated;
