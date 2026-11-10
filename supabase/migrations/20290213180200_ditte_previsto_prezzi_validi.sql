-- ============================================================================
-- Subappalto dal computo, lotto 2: il costo previsto della ditta sulla fase
-- (ditte_ricalcola_previsto, scatta quando cambiano le voci della fase) usa
-- solo i prezzi della ditta validi OGGI e trova anche quelli scritti
-- sull'anagrafica del subappaltatore.
--
-- Prima prendeva il primo prezzo della squadra senza guardare le date: da
-- quando il listino della ditta chiude i prezzi vecchi (listino_ditta_salva),
-- avrebbe potuto prendere un prezzo chiuso. Stesso ordine del codice
-- (varianteDellaSquadra / variantiPerSquadre): prima il prezzo scritto sulla
-- squadra, poi quello dell'anagrafica; poi predefinito, ordine, il più vecchio.
-- Il resto è identico: solo le ditte con previsto «dal preventivo» e sole
-- sulla fase, IVA della riga.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ditte_ricalcola_previsto(p_fasi uuid[])
returns void
language sql
security definer
set search_path to ''
as $function$
  with sole as (
    select oet.id, oet.phase_id, oet.external_team_id, e.subappaltatore_id, coalesce(oet.vat_rate, 0) as iva
      from public.order_external_teams oet
      left join public.external_teams e on e.id = oet.external_team_id
     where oet.phase_id = any(p_fasi)
       and oet.costo_origine = 'preventivo'
       and oet.external_team_id is not null
       and (select count(*) from public.order_external_teams x
             where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1
  ), costo as (
    select s.id, s.iva,
           coalesce(sum(v.quantita * coalesce(
             (select tv.costo from public.tariffa_costi_varianti tv
               where tv.tariffa_id = v.tariffa_id
                 and (tv.external_team_id = s.external_team_id
                      or (s.subappaltatore_id is not null and tv.subappaltatore_id = s.subappaltatore_id))
                 and tv.attivo is not false and tv.costo is not null
                 and (tv.valid_from is null or tv.valid_from <= (now() at time zone 'Europe/Rome')::date)
                 and (tv.valid_to is null or tv.valid_to >= (now() at time zone 'Europe/Rome')::date)
               order by (tv.external_team_id is not distinct from s.external_team_id) desc,
                        tv.is_default desc nulls last, tv.sort_order nulls last, tv.created_at
               limit 1),
             v.costo_manodopera, 0)), 0) as netto
      from sole s
      left join public.order_work_phase_voci v on v.phase_id = s.phase_id
     group by s.id, s.iva
  )
  update public.order_external_teams oet
     set cost_preventivo = round(c.netto * (1 + c.iva / 100), 2)
    from costo c
   where oet.id = c.id
     and oet.cost_preventivo is distinct from round(c.netto * (1 + c.iva / 100), 2);
$function$;
